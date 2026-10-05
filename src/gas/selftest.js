// Self-test: fill a separate test spreadsheet with synthetic data and compare every report
// cell with the JS reference (core/expected.js). The real spreadsheet's data is never touched;
// only the report is written back into its "Self-test" tab.
/* global SpreadsheetApp, PropertiesService, Utilities */

import { TABS, TRANSACTION_HEADERS, CF } from '../core/schema.js';
import { expectedReport } from '../core/expected.js';
import { buildCategorySlots } from '../core/categories.js';
import { nextPayday } from '../core/payday.js';
import { SAMPLE_YEAR, SAMPLE_CATEGORIES, SAMPLE_ACCOUNTS, sampleTransactions } from '../core/sample.js';
import { configValue, runSetup, setConfigValue, writeAccounts, writeCategories } from './setup.js';

const ERROR_SCAN = {
  CASHFLOW: 'B6:Y300',
  'QUARTER REPORT': 'B2:AR46',
  'FINAL STATEMENT': 'B2:AE39',
  'BUDGET TRACKER': 'C3:L63',
  Setup: 'B2:E13',
};
const ERROR_VALUE = /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|ERROR!|NULL!)/;

const TEST_SHEET_NAME = 'Cashflow Tracker self-test (reused, do not edit)';
const TEST_SHEET_KEY = 'SELFTEST_SHEET_ID';

/**
 * One permanent test spreadsheet, reused by every run. Without access to the whole Drive the
 * script cannot delete files, so a fresh copy per run would pile up. Reusing is safe because
 * setup re-applies every formula patch to it before the checks.
 */
function testSpreadsheet(ss, notes) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(TEST_SHEET_KEY);
  if (id) {
    try {
      const existing = SpreadsheetApp.openById(id);
      notes.push('reused the test spreadsheet');
      return existing;
    } catch (e) {
      notes.push('the previous test spreadsheet is gone; made a new one');
    }
  }
  const copy = ss.copy(TEST_SHEET_NAME);
  props.setProperty(TEST_SHEET_KEY, copy.getId());
  notes.push(`created the test spreadsheet "${TEST_SHEET_NAME}"`);
  return copy;
}

/** Sets the first locale the spreadsheet accepts; returns the locale in effect. */
function useLocale(sheet, candidates) {
  for (const loc of candidates) {
    try {
      sheet.setSpreadsheetLocale(loc);
      if (sheet.getSpreadsheetLocale() === loc) return loc;
    } catch (e) { /* try the next spelling */ }
  }
  return sheet.getSpreadsheetLocale();
}

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function writeTransactions(ss, tx) {
  const sh = ss.getSheetByName(TABS.transactions);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, TRANSACTION_HEADERS.length).clearContent();
  const rows = tx.map((t) => TRANSACTION_HEADERS.map((h) => {
    if (h === 'date') return toDate(t.date);
    return t[h] ?? '';
  }));
  sh.getRange(2, 1, rows.length, TRANSACTION_HEADERS.length).setValues(rows);
}

/** Reads every expected cell, one getValues() per sheet over the bounding box. */
function readCells(ss, keys) {
  const bySheet = {};
  for (const k of keys) {
    const [sheet, cell] = k.split('!');
    (bySheet[sheet] ||= []).push(cell);
  }
  const values = new Map();
  for (const [sheet, cells] of Object.entries(bySheet)) {
    const sh = ss.getSheetByName(sheet);
    const pos = cells.map((c) => sh.getRange(c)).map((r) => [r.getRow(), r.getColumn()]);
    const r0 = Math.min(...pos.map((p) => p[0]));
    const c0 = Math.min(...pos.map((p) => p[1]));
    const r1 = Math.max(...pos.map((p) => p[0]));
    const c1 = Math.max(...pos.map((p) => p[1]));
    const grid = sh.getRange(r0, c0, r1 - r0 + 1, c1 - c0 + 1).getValues();
    cells.forEach((c, i) => values.set(`${sheet}!${c}`, grid[pos[i][0] - r0][pos[i][1] - c0]));
  }
  return values;
}

function sameNumber(actual, expected) {
  const a = actual === '' ? 0 : Number(actual);
  return Number.isFinite(a) && Math.abs(a - expected) < 0.005;
}

/** Runs the checks on the test spreadsheet. Returns { ok, checks, failures[], notes[] }. */
export function runSelfTest(ss, seed) {
  if (!configValue(ss, 'setup_version')) throw new Error('Run setup first (menu: Cashflow Tracker → Setup).');
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  const notes = [];
  const copy = testSpreadsheet(ss, notes);
  runSetup(copy, seed); // bring the test copy's formulas up to date with the current code
  const failures = [];
  // Run the checks in the Indonesian locale, where month names differ (Mei, Agu, Okt, Des).
  const locale = useLocale(copy, ['in_ID', 'id_ID']);
  notes.push(`your sheet: locale ${ss.getSpreadsheetLocale()}, time zone ${ss.getSpreadsheetTimeZone()}; checks ran with locale ${locale}`);
  let checks = 0;
  {
    const slots = buildCategorySlots(SAMPLE_CATEGORIES);
    const tx = sampleTransactions(SAMPLE_YEAR);
    writeCategories(copy, slots);
    writeAccounts(copy, SAMPLE_ACCOUNTS);
    writeTransactions(copy, tx);
    copy.getSheetByName('Setup').getRange('D3').setValue(SAMPLE_YEAR);
    const bt = copy.getSheetByName('BUDGET TRACKER');
    ['E27', 'H27', 'K27'].forEach((c) => bt.getRange(c).setValue('JAN'));
    SpreadsheetApp.flush();

    // 1. Every report cell against the reference.
    const expected = expectedReport({ year: SAMPLE_YEAR, slots, accounts: SAMPLE_ACCOUNTS, transactions: tx, budgetMonth: 1 });
    const actual = readCells(copy, [...expected.keys()]);
    for (const [key, want] of expected) {
      checks += 1;
      const got = actual.get(key);
      if (!sameNumber(got, want)) failures.push(`${key}: expected ${want}, got ${JSON.stringify(got)}`);
    }

    // 2. Ledger: approved rows of the year only, sorted by date.
    const ledgerCount = tx.filter((t) => t.status === 'approved' && t.date.startsWith(`${SAMPLE_YEAR}-`)).length;
    const cf = copy.getSheetByName(CF.sheet);
    const ledger = cf.getRange(CF.firstDataRow, 2, ledgerCount + 5, 7).getValues();
    const filled = ledger.filter((r) => r[0] !== '');
    checks += 2;
    if (filled.length !== ledgerCount) failures.push(`CASHFLOW ledger: expected ${ledgerCount} rows, got ${filled.length}`);
    const dates = filled.map((r) => (r[0] instanceof Date ? r[0].getTime() : NaN));
    if (dates.some((d, i) => Number.isNaN(d) || (i > 0 && d < dates[i - 1]))) failures.push('CASHFLOW ledger: dates are not sorted ascending');

    // 3. Payday.
    checks += 1;
    const day = Number(configValue(copy, 'payday_day'));
    const want = nextPayday(new Date(), day);
    const got = cf.getRange(CF.payday.payday).getValue();
    if (!(got instanceof Date) || got.toDateString() !== want.toDateString()) {
      failures.push(`CASHFLOW ${CF.payday.payday} next payday: expected ${want.toDateString()}, got ${got}`);
    }

    // 4. No error values anywhere in the report areas.
    for (const [sheet, range] of Object.entries(ERROR_SCAN)) {
      const sh = copy.getSheetByName(sheet);
      const r = sh.getRange(range);
      const vals = r.getDisplayValues();
      vals.forEach((row, i) => row.forEach((v, j) => {
        checks += 1;
        if (ERROR_VALUE.test(v)) failures.push(`${sheet}!${sh.getRange(r.getRow() + i, r.getColumn() + j).getA1Notation()}: ${v}`);
      }));
    }
  }

  const ok = failures.length === 0;
  writeReport(ss, { ok, checks, failures, notes, stamp });
  setConfigValue(ss, 'last_selftest', `${stamp} ${ok ? 'PASS' : 'FAIL'} (${checks} checks, ${failures.length} failed)`);
  return { ok, checks, failures, notes };
}

function writeReport(ss, { ok, checks, failures, notes, stamp }) {
  let sh = ss.getSheetByName(TABS.selfTest);
  if (!sh) sh = ss.insertSheet(TABS.selfTest);
  sh.clear();
  const lines = [
    [`Self-test ${stamp}`],
    [ok ? `PASS: all ${checks} checks matched` : `FAIL: ${failures.length} of ${checks} checks failed`],
    ...notes.map((n) => [`note: ${n}`]),
    [''],
    ...failures.slice(0, 500).map((f) => [f]),
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange('A2').setFontWeight('bold').setFontColor(ok ? '#1f7a4d' : '#b23b3b');
}
