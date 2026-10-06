// Gmail -> Transactions. Runs every 10 minutes (time trigger) and from the menu.
/* global SpreadsheetApp, LockService, ScriptApp, PropertiesService, Utilities */

import { TABS, TRANSACTION_HEADERS, CONNECTION_HEADERS, INBOX_LOG_HEADERS, RULE_HEADERS, SETUP_VERSION } from '../core/schema.js';
import { parseEmail, SENDERS } from '../core/parsers/index.js';
import { planSync } from '../core/plan.js';
import { readTable, appendRows, updateRows } from './store.js';
import { listMessageIds, getEmail, myAddress } from './gmail.js';
import { configValue, runSetup } from './setup.js';
import { flushStartupTimings } from './perf.js';

const OVERLAP_MS = 2 * 24 * 3600 * 1000;
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // Apps Script stops a run at 6 minutes
const SHEET_KEY = 'SHEET_ID';
const MAX_EMAILS_PER_RUN = 80; // a backlog is worked off over several 10-minute runs
const PAUSE_MS = 300; // stays well under Gmail's per-minute quota for personal scripts
export const TRIGGER_HANDLER = 'syncTrigger';

/** The spreadsheet, also when running from a time trigger. */
export function appSpreadsheet() {
  const active = SpreadsheetApp.getActive();
  if (active) {
    PropertiesService.getScriptProperties().setProperty(SHEET_KEY, active.getId());
    return active;
  }
  const id = PropertiesService.getScriptProperties().getProperty(SHEET_KEY);
  if (!id) throw new Error('Spreadsheet unknown: open it once and use the Cashflow Tracker menu.');
  return SpreadsheetApp.openById(id);
}

function syncConfig(ss) {
  const names = String(configValue(ss, 'owner_bank_names') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    owner: String(configValue(ss, 'owner_name') || ''),
    ownerNames: names,
    categories: {
      transfer: String(configValue(ss, 'cat_transfer') || 'trf ke bank lain'),
      fee: String(configValue(ss, 'cat_fee') || 'Biaya Admin'),
      dividend: String(configValue(ss, 'cat_dividend') || 'Dividen & Bunga'),
    },
  };
}

function modeOf(ss, defaultMode) {
  const m = String(configValue(ss, 'sync_mode') || '').trim().toLowerCase();
  return m === 'live' || m === 'preview' ? m : defaultMode;
}

function upsertConnection(ss, gmail, changes) {
  const rows = readTable(ss, TABS.connections);
  const row = rows.find((r) => String(r.gmail).toLowerCase() === gmail.toLowerCase());
  if (row) {
    const sh = ss.getSheetByName(TABS.connections);
    for (const [h, v] of Object.entries(changes)) {
      const col = CONNECTION_HEADERS.indexOf(h) + 1;
      if (col > 0) sh.getRange(row._row, col).setValue(v);
    }
    return { ...row, ...changes };
  }
  const fresh = { gmail, owner: configValue(ss, 'owner_name'), method: 'own trigger', connected_at: new Date(), ...changes };
  appendRows(ss, TABS.connections, CONNECTION_HEADERS, [fresh]);
  return fresh;
}

/**
 * One sync run.
 * @param {{defaultMode?: 'live'|'preview', budgetMs?: number}} opts
 * @returns {object} summary (also written to the Connections row)
 */
export function runSync(opts = {}) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: 'busy' };
  try {
    return syncOnce(opts);
  } catch (e) {
    // Leave a trace where the owner (and the developer, via the sheet) can see it.
    try {
      const ss = appSpreadsheet();
      upsertConnection(ss, safeAddress(), { last_sync: new Date(), last_status: `ERROR: ${e.message} | ${String(e.stack || '').split('\n').slice(0, 3).join(' / ')}` });
    } catch (ignored) { /* nothing more we can do */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function safeAddress() {
  try { return myAddress(); } catch (e) { return 'unknown'; }
}

function syncOnce(opts) {
  const started = Date.now();
  {
    const ss = appSpreadsheet();
    if ((Number(configValue(ss, 'setup_version')) || 0) < SETUP_VERSION) runSetup(ss, opts.seed);
    const mode = modeOf(ss, opts.defaultMode || 'preview');
    const gmail = myAddress();
    const conn = readTable(ss, TABS.connections).find((r) => String(r.gmail).toLowerCase() === gmail.toLowerCase()) || {};

    const startDate = configValue(ss, 'start_date');
    const startMs = startDate instanceof Date ? startDate.getTime() : Date.parse(startDate) || 0;
    const checkpoint = mode === 'live' ? Number(conn.checkpoint) || 0 : 0;
    const sinceMs = Math.max(startMs, checkpoint - OVERLAP_MS);
    const query = `from:(${SENDERS.join(' OR ')}) after:${Math.floor(sinceMs / 1000)}`;

    // Preview mode works like live mode but on its own tabs, continuing where it stopped.
    // A new PREVIEW_EPOCH (a parser change) clears them so the preview restarts from scratch.
    if (mode === 'preview') resetPreviewIfStale(ss);
    const previewRows = mode === 'preview' ? readTable(ss, TABS.preview) : [];
    const existing = [...readTable(ss, TABS.transactions), ...previewRows];
    const logged = readTable(ss, mode === 'live' ? TABS.inboxLog : PREVIEW_LOG);
    // Emails that failed to parse are retried every run (a parser fix then fills them in),
    // also when they are older than the search window.
    const inTransactions = new Set(existing.map((r) => String(r.gmail_id)).filter(Boolean));
    const failed = new Set(logged.filter((r) => r.status === 'error' && !inTransactions.has(String(r.gmail_id))).map((r) => String(r.gmail_id)));
    const done = new Set([...inTransactions, ...logged.filter((r) => r.status !== 'error').map((r) => String(r.gmail_id))]);
    const listed = listMessageIds(query, 2000).filter((id) => !done.has(id) && !failed.has(id)).reverse(); // oldest first
    const ids = [...failed, ...listed];

    const emails = [];
    let complete = true;
    let note = '';
    for (const id of ids) {
      if (Date.now() - started > (opts.budgetMs || TIME_BUDGET_MS) || emails.length >= MAX_EMAILS_PER_RUN) { complete = false; break; }
      let e;
      try {
        e = getEmail(id);
      } catch (err) {
        // Gmail's per-minute quota: keep what we have; the next run continues from here.
        if (/quota|rate limit|too many/i.test(err.message)) { complete = false; note = 'Gmail rate limit, continuing next run'; break; }
        throw err;
      }
      emails.push({ id: e.id, from: e.from, subject: e.subject, epochMs: e.epochMs, gmail, result: parseEmail(e) });
      Utilities.sleep(PAUSE_MS);
    }

    const accounts = readTable(ss, TABS.accounts);
    const rules = readTable(ss, TABS.rules);
    const plan = planSync({ emails, existing, accounts, rules, config: syncConfig(ss), nowIso: new Date().toISOString() });
    const byId = Object.fromEntries(emails.map((e) => [e.id, e]));
    // A retried email that fails again is already in the log: don't add it twice.
    const logRows = plan.log.filter((l) => !(l.status === 'error' && failed.has(String(l.gmailId)))).map((l) => ({
      gmail_id: l.gmailId, received: new Date(byId[l.gmailId].epochMs), from: byId[l.gmailId].from, subject: byId[l.gmailId].subject,
      status: l.status, parser: l.parser || '', reason: l.reason || '', rows: l.rows, gmail,
    }));
    const counts = { seen: emails.length, parsed: 0, skipped: 0, errors: 0 };
    plan.log.forEach((l) => { if (l.status === 'ok') counts.parsed += 1; else if (l.status === 'error') counts.errors += 1; else counts.skipped += 1; });

    if (mode === 'live') {
      appendRows(ss, TABS.transactions, TRANSACTION_HEADERS, plan.add);
      updateRows(ss, TABS.transactions, TRANSACTION_HEADERS, plan.update);
      appendRows(ss, TABS.inboxLog, INBOX_LOG_HEADERS, logRows);
      bumpRuleHits(ss, rules, plan.ruleHits);
    } else {
      appendRows(ss, TABS.preview, TRANSACTION_HEADERS, plan.add);
      updateRows(ss, TABS.preview, TRANSACTION_HEADERS, plan.update);
      appendRows(ss, PREVIEW_LOG, INBOX_LOG_HEADERS, logRows);
    }

    try { flushStartupTimings(ss); } catch (e) { /* timings are optional */ }
    const newest = emails.reduce((m, e) => Math.max(m, e.epochMs), Number(conn.checkpoint) || 0);
    const summary = {
      status: complete ? 'ok' : 'partial', mode, gmail, ...counts, added: plan.add.length, updated: plan.update.length,
      remaining: ids.length - emails.length, seconds: Math.round((Date.now() - started) / 1000),
    };
    upsertConnection(ss, gmail, {
      last_sync: new Date(), last_status: `${mode} ${summary.status}: +${summary.added} rows, ${counts.errors} errors${summary.remaining ? `, ${summary.remaining} left` : ''}${note ? ` (${note})` : ''}`,
      seen: counts.seen, parsed: counts.parsed, skipped: counts.skipped, errors: counts.errors,
      ...(mode === 'live' && complete ? { checkpoint: newest } : {}),
    });
    return summary;
  }
}

function bumpRuleHits(ss, rules, hits) {
  const sh = ss.getSheetByName(TABS.rules);
  const col = RULE_HEADERS.indexOf('hits') + 1;
  for (const r of rules) if (hits[r.id]) sh.getRange(r._row, col).setValue((Number(r.hits) || 0) + hits[r.id]);
}

const PREVIEW_LOG = 'Preview Log';
const PREVIEW_EPOCH = 'parsers-2026-10-05c';

function resetPreviewIfStale(ss) {
  const props = PropertiesService.getScriptProperties();
  let log = ss.getSheetByName(PREVIEW_LOG);
  if (!log) log = ss.insertSheet(PREVIEW_LOG);
  if (props.getProperty('PREVIEW_EPOCH') === PREVIEW_EPOCH && log.getLastRow() >= 1) return;
  const pv = ss.getSheetByName(TABS.preview);
  if (pv.getLastRow() > 1) pv.getRange(2, 1, pv.getLastRow() - 1, pv.getLastColumn()).clearContent();
  log.clear();
  log.getRange(1, 1, 1, INBOX_LOG_HEADERS.length).setValues([INBOX_LOG_HEADERS]).setFontWeight('bold');
  props.setProperty('PREVIEW_EPOCH', PREVIEW_EPOCH);
}

/** (Re)installs the 10-minute trigger for the person running this. */
export function installTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === TRIGGER_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(10).create();
}

export function connect(seed, defaultMode) {
  const ss = appSpreadsheet();
  installTrigger();
  const gmail = myAddress();
  upsertConnection(ss, gmail, { method: 'own trigger', connected_at: new Date() });
  return runSync({ seed, defaultMode });
}
