// Apps Script entry points. The build turns every export below into a top-level function.
/* global SpreadsheetApp, SEED */

import { runSetup } from './gas/setup.js';
import { runSelfTest } from './gas/selftest.js';

const MENU = 'Cashflow Tracker';

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU)
    .addItem('1. Siapkan spreadsheet / Set up', 'menuSetup')
    .addItem('2. Uji otomatis / Self-test', 'menuSelfTest')
    .addToUi();
}

export function menuSetup() {
  const ui = SpreadsheetApp.getUi();
  const log = runSetup(SpreadsheetApp.getActive(), SEED);
  ui.alert('Setup selesai / Setup done', log.join('\n'), ui.ButtonSet.OK);
}

export function menuSelfTest() {
  const ui = SpreadsheetApp.getUi();
  const r = runSelfTest(SpreadsheetApp.getActive(), SEED);
  const head = r.ok ? `LULUS / PASS: ${r.checks} checks` : `GAGAL / FAIL: ${r.failures.length} of ${r.checks} checks`;
  const body = [...r.failures.slice(0, 10), ...(r.failures.length > 10 ? ['… (see the Self-test tab)'] : []), ...r.notes].join('\n');
  ui.alert(head, body || 'See the Self-test tab.', ui.ButtonSet.OK);
}

/** Same as the menu items, callable from the Apps Script editor's Run button. */
export function setup() { return runSetup(SpreadsheetApp.getActive(), SEED); }
export function selfTest() { return runSelfTest(SpreadsheetApp.getActive(), SEED); }
