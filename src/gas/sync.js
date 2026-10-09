// Gmail -> Transactions. A time trigger runs every minute: a quick look asks Gmail whether a bank
// or shop email arrived since the last sync (two small searches, no spreadsheet work), and only
// then does the full sync run. A full run also happens every 30 minutes (retries of emails still
// waiting, a fresh first-screen snapshot) and from the menu or the app's "Sync now".
// Personal accounts get 90 minutes of trigger time a day: the quick look keeps us well under it.
/* global SpreadsheetApp, LockService, ScriptApp, PropertiesService, Utilities */

import { TABS, TRANSACTION_HEADERS, CONNECTION_HEADERS, INBOX_LOG_HEADERS, RULE_HEADERS, SETUP_VERSION } from '../core/schema.js';
import { parseEmail, SENDERS, backfillQuery } from '../core/parsers/index.js';
import { planSync } from '../core/plan.js';
import { readTable, appendRows, updateRows } from './store.js';
import { listMessageIds, getEmail, myAddress } from './gmail.js';
import { configValue, runSetup } from './setup.js';
import { flushStartupTimings } from './perf.js';
import { refreshInit } from './initcache.js';
import { installMailTriggers, scheduleSelfTest, sendSyncAlert } from './weekly.js';
import { rolloverYear } from './rollover.js';

const OVERLAP_MS = 2 * 24 * 3600 * 1000;
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // Apps Script stops a run at 6 minutes
const SHEET_KEY = 'SHEET_ID';
const MAX_EMAILS_PER_RUN = 80; // a backlog is worked off over several runs
const PAUSE_MS = 300; // stays well under Gmail's per-minute quota for personal scripts
export const TRIGGER_HANDLER = 'syncTrigger';
const TRIGGER_MINUTES = 1;
const FULL_EVERY_MS = 30 * 60 * 1000;
// Script properties shared by the quick look and the full run.
const P = {
  checkpoint: 'SYNC_CHECKPOINT_MS', // newest email the last complete run handled
  known: 'SYNC_KNOWN_IDS', // ids the quick look's searches returned right after that run
  lastFull: 'SYNC_LAST_FULL_MS',
  setup: 'SYNC_SETUP_VERSION',
  stamp: 'SYNC_DATA_STAMP', // changes when a sync adds or changes rows (the open app refreshes)
  checked: 'SYNC_LAST_CHECK_MS', // last time Gmail was looked at, quick or full
};

/** Ids of bank and shop emails since a moment just before `checkpointMs`. */
function recentIds(checkpointMs) {
  const since = Math.floor(checkpointMs / 1000) - 60;
  return [...listMessageIds(`from:(${SENDERS.join(' OR ')}) after:${since}`, 20), ...listMessageIds(backfillQuery(since), 20)];
}

/** The quick look: does anything call for a full run? */
function needsFullRun(props) {
  const p = props.getProperties();
  if (!p[P.checkpoint] || !p[P.known] || p[P.setup] !== String(SETUP_VERSION)) return true;
  if (Date.now() - Number(p[P.lastFull] || 0) > FULL_EVERY_MS) return true;
  const known = new Set(JSON.parse(p[P.known]));
  const fresh = recentIds(Number(p[P.checkpoint])).some((id) => !known.has(id));
  props.setProperty(P.checked, String(Date.now()));
  return fresh;
}

/** For the web app: has a sync changed anything, and when was Gmail last looked at? Cheap: no spreadsheet. */
export function syncStamp() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return { stamp: p[P.stamp] || '', checked: Number(p[P.checked] || 0) || null, today: Number(p[runtimeKey()] || 0) };
}

const runtimeKey = () => `SYNC_RUNTIME_${Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd')}`;
/** Trigger time used today (ms), to stay inside the 90-minute daily allowance. */
export function addRuntime(ms) {
  try {
    const props = PropertiesService.getScriptProperties();
    const key = runtimeKey();
    props.setProperty(key, String((Number(props.getProperty(key)) || 0) + ms));
    // Old days go away.
    Object.keys(props.getProperties()).filter((k) => k.startsWith('SYNC_RUNTIME_') && k !== key).forEach((k) => props.deleteProperty(k));
  } catch (e) { /* bookkeeping only */ }
}

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
  // The every-minute trigger: nothing new in Gmail means nothing to do.
  if (opts.quick) {
    try { if (!needsFullRun(PropertiesService.getScriptProperties())) return { status: 'idle' }; } catch (e) { /* look properly instead */ }
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { status: 'busy' };
  try {
    return syncOnce(opts);
  } catch (e) {
    // Leave a trace where the owner (and the developer, via the sheet) can see it.
    try {
      const ss = appSpreadsheet();
      upsertConnection(ss, safeAddress(), { last_sync: new Date(), last_status: `ERROR: ${e.message} | ${String(e.stack || '').split('\n').slice(0, 3).join(' / ')}` });
      // …and tell the owner by email (at most once per 12 hours for the same message).
      sendSyncAlert(ss, { error: e.message });
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
    // An archived year (a copy made at New Year) keeps its data as it was.
    if (configValue(ss, 'archived')) return { status: 'archived' };
    if ((Number(configValue(ss, 'setup_version')) || 0) < SETUP_VERSION) {
      runSetup(ss, opts.seed);
      // After an upgrade: make sure the email triggers exist, and check the reports again.
      try { installTrigger(); installMailTriggers(); scheduleSelfTest(); } catch (e) { /* tried again at the next upgrade */ }
    }
    const mode = modeOf(ss, opts.defaultMode || 'preview');
    let yearNote = '';
    if (mode === 'live') {
      const y = rolloverYear(ss);
      if (y) yearNote = `new year ${y.target}, ${y.year} archived`;
    }
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
    // An email's latest log line decides: "error" and "waiting" (an Apple receipt whose charge
    // isn't in yet) are tried again.
    const inTransactions = new Set(existing.map((r) => String(r.gmail_id)).filter(Boolean));
    const latest = new Map();
    logged.forEach((r) => latest.set(String(r.gmail_id), r.status));
    const again = (s) => s === 'error' || s === 'waiting';
    const failed = new Set([...latest].filter(([id, s]) => again(s) && !inTransactions.has(id)).map(([id]) => id));
    const done = new Set([...inTransactions, ...[...latest].filter(([, s]) => !again(s)).map(([id]) => id)]);
    const backfill = backfillQuery(Math.floor(startMs / 1000));
    const listed = [...new Set([...listMessageIds(query, 2000), ...listMessageIds(backfill, 500)])]
      .filter((id) => !done.has(id) && !failed.has(id)).reverse(); // oldest first (roughly: two lists)
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
    const byStatus = (id) => latest.get(String(id)); // a retry with the same outcome isn't logged twice
    // A retried email that fails again is already in the log: don't add it twice.
    const logRows = plan.log.filter((l) => !(l.status === byStatus(l.gmailId) && failed.has(String(l.gmailId)))).map((l) => ({
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

    // A new bank email that couldn't be read: tell the owner (the app also shows it in Review).
    const unread = logRows.filter((l) => l.status === 'error');
    if (mode === 'live' && unread.length) {
      try { sendSyncAlert(ss, { unread: unread.map((l) => ({ subject: l.subject, from: l.from, reason: l.reason })) }); } catch (e) { /* the app shows them anyway */ }
    }
    if (yearNote) note = note ? `${note}; ${yearNote}` : yearNote;

    try { flushStartupTimings(ss); } catch (e) { /* timings are optional */ }
    try { if (mode === 'live') refreshInit(ss); } catch (e) { /* the page then fetches its data itself */ }
    const newest = emails.reduce((m, e) => Math.max(m, e.epochMs), Number(conn.checkpoint) || 0);
    const summary = {
      status: complete ? 'ok' : 'partial', mode, gmail, ...counts, added: plan.add.length, updated: plan.update.length,
      remaining: ids.length - emails.length, seconds: Math.round((Date.now() - started) / 1000),
    };
    // What the quick look needs next time; a partial run leaves no known ids, so the next minute continues.
    if (mode === 'live') {
      const props = PropertiesService.getScriptProperties();
      const now = String(Date.now());
      props.setProperties({ [P.lastFull]: now, [P.checked]: now, [P.setup]: String(SETUP_VERSION) });
      if (complete) props.setProperties({ [P.checkpoint]: String(newest), [P.known]: JSON.stringify(recentIds(newest)) });
      else props.deleteProperty(P.known);
      if (plan.add.length || plan.update.length) props.setProperty(P.stamp, now);
    }
    const usedMin = Math.round(syncStamp().today / 6000) / 10;
    upsertConnection(ss, gmail, {
      last_sync: new Date(), last_status: `${mode} ${summary.status}: +${summary.added} rows, ${counts.errors} errors${summary.remaining ? `, ${summary.remaining} left` : ''}${note ? ` (${note})` : ''} · ${summary.seconds}s · today ${usedMin} min`,
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

/** (Re)installs the every-minute trigger for the person running this. */
export function installTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === TRIGGER_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(TRIGGER_MINUTES).create();
}

export function connect(seed, defaultMode) {
  const ss = appSpreadsheet();
  installTrigger();
  const gmail = myAddress();
  upsertConnection(ss, gmail, { method: 'own trigger', connected_at: new Date() });
  return runSync({ seed, defaultMode });
}
