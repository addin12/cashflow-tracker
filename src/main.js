// Apps Script entry points. The build turns every export below into a top-level function.
// SEED (first-run data) and SYNC_DEFAULT ('preview' | 'live') are injected by scripts/build.mjs.
/* global SpreadsheetApp, HtmlService, LockService, SEED, SYNC_DEFAULT */

import { runSetup } from './gas/setup.js';
import { runSelfTest } from './gas/selftest.js';
import { runSync, connect, appSpreadsheet } from './gas/sync.js';
import { sheetStore } from './gas/sheetstore.js';
import { createApi, API_METHODS } from './core/api.js';

const MENU = 'Cashflow Tracker';

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU)
    .addItem('Hubungkan Gmail / Connect Gmail', 'menuConnect')
    .addItem('Sinkron sekarang / Sync now', 'menuSyncNow')
    .addSeparator()
    .addItem('Siapkan spreadsheet / Set up', 'menuSetup')
    .addItem('Uji otomatis / Self-test', 'menuSelfTest')
    .addToUi();
}

function describe(s) {
  if (s.status === 'busy') return 'Sinkron lain sedang berjalan. / Another sync is running.';
  return [
    `Mode: ${s.mode === 'live' ? 'live (Transactions)' : 'preview (tab Preview)'}`,
    `Gmail: ${s.gmail}`,
    `Email dibaca / read: ${s.seen} (transaksi ${s.parsed}, dilewati ${s.skipped}, gagal ${s.errors})`,
    `Baris baru / new rows: ${s.added}${s.updated ? `, diperbarui ${s.updated}` : ''}`,
    s.remaining ? `Sisa / remaining: ${s.remaining} (berlanjut otomatis tiap 10 menit)` : '',
  ].filter(Boolean).join('\n');
}

export function menuConnect() {
  const ui = SpreadsheetApp.getUi();
  const s = connect(SEED, SYNC_DEFAULT);
  ui.alert('Gmail terhubung / Connected', `${describe(s)}\n\nSinkron otomatis setiap 10 menit. / Syncs every 10 minutes.`, ui.ButtonSet.OK);
}

export function menuSyncNow() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Sinkron / Sync', describe(runSync({ seed: SEED, defaultMode: SYNC_DEFAULT })), ui.ButtonSet.OK);
}

export function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  const log = runSetup(appSpreadsheet(), SEED);
  ui.alert('Setup selesai / Setup done', log.join('\n'), ui.ButtonSet.OK);
}

export function menuSelfTest() {
  const ui = SpreadsheetApp.getUi();
  const r = runSelfTest(appSpreadsheet(), SEED);
  const head = r.ok ? `LULUS / PASS: ${r.checks} checks` : `GAGAL / FAIL: ${r.failures.length} of ${r.checks} checks`;
  const body = [...r.failures.slice(0, 10), ...(r.failures.length > 10 ? ['… (see the Self-test tab)'] : []), ...r.notes].join('\n');
  ui.alert(head, body || 'See the Self-test tab.', ui.ButtonSet.OK);
}

/** Web app page (deployed for the owner only: "execute as me, access: only myself"). */
export function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Cashflow')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

const READ_ONLY = new Set(['bootstrap', 'review', 'list', 'dashboard', 'settings']);

/**
 * The web app's single server entry point: google.script.run.api(name, payloadJson).
 * Answers with a JSON string because google.script.run can't carry Date objects.
 */
export function api(name, payloadJson) {
  try {
    if (!API_METHODS.includes(name)) throw new Error(`unknown method ${name}`);
    const ss = appSpreadsheet();
    const impl = createApi(sheetStore(ss), {
      now: () => new Date(),
      sync: () => runSync({ seed: SEED, defaultMode: SYNC_DEFAULT }),
      sheetUrl: ss.getUrl(),
    });
    const lock = READ_ONLY.has(name) || name === 'syncNow' ? null : LockService.getScriptLock();
    if (lock && !lock.tryLock(20000)) throw new Error('Sedang sinkron, coba lagi sebentar. / A sync is running, try again shortly.');
    try {
      return JSON.stringify({ data: impl[name](JSON.parse(payloadJson || '{}')) });
    } finally {
      if (lock) lock.releaseLock();
    }
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

/** Time-driven trigger (every 10 minutes). */
export function syncTrigger() {
  return runSync({ seed: SEED, defaultMode: SYNC_DEFAULT });
}

/** Same as the menu items, callable from the Apps Script editor's Run button. */
export function setup() { return runSetup(appSpreadsheet(), SEED); }
export function selfTest() { return runSelfTest(appSpreadsheet(), SEED); }
