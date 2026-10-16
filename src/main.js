// Apps Script entry points. The build turns every export below into a top-level function.
// SEED (first-run data) and SYNC_DEFAULT ('preview' | 'live') are injected by scripts/build.mjs.
/* global SpreadsheetApp, HtmlService, LockService, Utilities, SEED, SYNC_DEFAULT */

import { runSetup, configValue, setConfigValue } from './gas/setup.js';
import { runSelfTest } from './gas/selftest.js';
import { runSync, connect, appSpreadsheet, syncStamp, addRuntime, installTrigger } from './gas/sync.js';
import { recordStartup } from './gas/perf.js';
import { cachedInit, storeInit } from './gas/initcache.js';
import { sheetStore } from './gas/sheetstore.js';
import { createApi, API_METHODS } from './core/api.js';
import { scanYearly } from './gas/yearly.js';
import { syncCalendar } from './gas/calendar.js';
import { pushSite, sendPush, acceptDevice } from './gas/push.js';
import { sendWeeklySummary, clearSelfTestTrigger, runDaily, scheduleSelfTest, sendSyncAlert, installMailTriggers, runEvening } from './gas/weekly.js';
import { refreshPrices } from './gas/prices.js';

const MENU = 'Cashflow Tracker';

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU)
    .addItem('Hubungkan Gmail / Connect Gmail', 'menuConnect')
    .addItem('Sinkron sekarang / Sync now', 'menuSyncNow')
    .addSeparator()
    .addItem('Siapkan spreadsheet / Set up', 'menuSetup')
    .addItem('Uji otomatis / Self-test', 'menuSelfTest')
    .addItem('Kirim ringkasan mingguan / Send weekly summary', 'menuWeeklySummary')
    .addItem('Perbarui harga aset / Update asset prices', 'menuPrices')
    .addToUi();
}

function describe(s) {
  if (s.status === 'busy') return 'Sinkron lain sedang berjalan. / Another sync is running.';
  return [
    `Mode: ${s.mode === 'live' ? 'live (Transactions)' : 'preview (tab Preview)'}`,
    `Gmail: ${s.gmail}`,
    `Email dibaca / read: ${s.seen} (transaksi ${s.parsed}, dilewati ${s.skipped}, gagal ${s.errors})`,
    `Baris baru / new rows: ${s.added}${s.updated ? `, diperbarui ${s.updated}` : ''}`,
    s.remaining ? `Sisa / remaining: ${s.remaining} (berlanjut otomatis / continues by itself)` : '',
  ].filter(Boolean).join('\n');
}

export function menuConnect() {
  const ui = SpreadsheetApp.getUi();
  const s = connect(SEED, SYNC_DEFAULT);
  ui.alert('Gmail terhubung / Connected', `${describe(s)}\n\nSinkron otomatis tiap menit. / Syncs every minute.`, ui.ButtonSet.OK);
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
const TABS_OPENABLE = ['review', 'dashboard', 'transactions', 'add', 'settings'];
export function doGet(e) {
  const p = (e && e.parameter) || {};
  // ?tab= opens a screen (the site's short links /tambah, /cek ...); ?push= is a phone joining notifications.
  const tab = TABS_OPENABLE.includes(p.tab) ? p.tab : '';
  const push = p.push ? (acceptDevice(appSpreadsheet(), p.push, p.n, p.label) ? 'ok' : 'bad') : '';
  // The cached first-screen data goes into the page itself, so it paints without a round trip.
  const init = cachedInit();
  const start = `window.__TAB__=${JSON.stringify(tab)};window.__PUSH__=${JSON.stringify(push)};`;
  const html = HtmlService.createHtmlOutputFromFile('index').getContent()
    .replace('window.__INIT__=null;', () => start + (init ? `window.__INIT__=${init.replace(/</g, '\\u003c').replace(/\//g, '\\/')};` : 'window.__INIT__=null;'));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Cashflow')
    .setFaviconUrl(ICON_URL)
    // HtmlService allows only a few meta tags; any other one makes the whole page an
    // "Exception: The meta tag you specified is not allowed" error. The home-screen name comes from the title.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** The tab icon: a wallet drawn for this app (docs/icon.svg → docs/icon-192.png), kept in the public repo. */
const ICON_URL = 'https://raw.githubusercontent.com/addin12/cashflow-tracker/main/docs/icon-192.png';

const READ_ONLY = new Set(['init', 'bootstrap', 'review', 'list', 'dashboard', 'settings', 'yearly']);

/**
 * The web app's single server entry point: google.script.run.api(name, payloadJson).
 * Answers with a JSON string because google.script.run can't carry Date objects.
 */
export function api(name, payloadJson) {
  const t0 = Date.now();
  try {
    // Asked every minute by the open page: answered without opening the spreadsheet.
    if (name === 'stamp') return JSON.stringify({ data: syncStamp() });
    if (!API_METHODS.includes(name)) throw new Error(`unknown method ${name}`);
    const payload = JSON.parse(payloadJson || '{}');
    const ss = appSpreadsheet();
    const t1 = Date.now();
    const impl = createApi(sheetStore(ss), {
      now: () => new Date(),
      sync: () => runSync({ seed: SEED, defaultMode: SYNC_DEFAULT }),
      sheetUrl: ss.getUrl(),
      sendSummary: () => sendWeeklySummary(ss, { force: true }),
      scanYearly: () => scanYearly(ss),
      syncCalendar: () => syncCalendar(ss),
      push: pushSite() ? { site: pushSite(), token: () => Utilities.getUuid().replace(/-/g, ''), send: (notice) => sendPush(ss, notice) } : null,
    });
    const lock = READ_ONLY.has(name) || name === 'syncNow' ? null : LockService.getScriptLock();
    if (lock && !lock.tryLock(20000)) {
      // The app waits and sends it again by itself.
      const busy = new Error('Sedang sinkron, coba lagi sebentar. / A sync is running, try again shortly.');
      busy.retry = true;
      throw busy;
    }
    try {
      const data = impl[name](payload);
      // New tickers get their market price now, so Settings shows it at once.
      if (name === 'saveAssets' && data.fetch) try { refreshPrices(ss); } catch (e) { /* the sync fetches it later */ }
      const json = JSON.stringify({ data });
      if (name === 'init') {
        storeInit(JSON.stringify(data));
        if (!payload.refresh) recordStartup({ open_ms: t1 - t0, work_ms: Date.now() - t1, ...(payload.lastLoad || {}) });
      }
      return json;
    } finally {
      if (lock) lock.releaseLock();
    }
  } catch (e) {
    return JSON.stringify({ error: e.message, retry: !!e.retry });
  }
}

/** Time-driven trigger (every minute): a quick look at Gmail, the full sync only when needed. */
export function syncTrigger() {
  const t0 = Date.now();
  try {
    return runSync({ seed: SEED, defaultMode: SYNC_DEFAULT, quick: true });
  } finally {
    addRuntime(Date.now() - t0);
  }
}

/** Time-driven trigger (Mondays 07:00): the weekly summary email, then the weekly self-test in its own run. */
export function weeklySummaryTrigger() {
  try {
    return sendWeeklySummary(appSpreadsheet());
  } finally {
    try { scheduleSelfTest(5 * 60 * 1000); } catch (e) { /* next Monday */ }
  }
}

/** Time-driven trigger (every day 21:00): the "anything to log today?" nudge, when switched on. */
export function eveningTrigger() {
  return runEvening(appSpreadsheet());
}

/** Time-driven trigger (every day 07:00): monthly report on the 1st, balance-check reminder on payday. */
export function dailyTrigger() {
  return runDaily(appSpreadsheet());
}

/** One-off time trigger (after an upgrade, and weekly): runs the self-test, emails the owner if it fails. */
export function selfTestTrigger() {
  clearSelfTestTrigger();
  const ss = appSpreadsheet();
  const r = runSelfTest(ss, SEED);
  if (!r.ok) try { sendSyncAlert(ss, { selftest: r }); } catch (e) { /* the result is in Config and the Self-test tab */ }
  return r;
}

export function menuPrices() {
  const ui = SpreadsheetApp.getUi();
  const ss = appSpreadsheet();
  const n = refreshPrices(ss, { maxAgeMs: 0 });
  ui.alert('Harga aset / Asset prices', `${n} harga diperbarui / prices updated.\n${configValue(ss, 'price_status') || ''}`, ui.ButtonSet.OK);
}

export function menuWeeklySummary() {
  const ui = SpreadsheetApp.getUi();
  const r = sendWeeklySummary(appSpreadsheet(), { force: true });
  ui.alert('Ringkasan mingguan / Weekly summary', `Terkirim ke / Sent to ${r.to}`, ui.ButtonSet.OK);
}

/** Same as the menu items, callable from the Apps Script editor's Run button. */
/** Editor: fetch prices now, and make sure the background triggers exist (they go when access is removed and given again). */
export function updatePrices() {
  installTrigger();
  installMailTriggers();
  return refreshPrices(appSpreadsheet(), { maxAgeMs: 0 });
}
/** Editor, once: asks Google for Calendar access, switches the Cashflow calendar on and fills it. */
export function connectCalendar() {
  installTrigger();
  installMailTriggers();
  const ss = appSpreadsheet();
  setConfigValue(ss, 'calendar_sync', 'on');
  return syncCalendar(ss);
}
export function setup() { return runSetup(appSpreadsheet(), SEED); }
export function selfTest() { return runSelfTest(appSpreadsheet(), SEED); }
