// Turns the uploaded template into the app's spreadsheet. Safe to run again: it never touches
// data in Transactions / Accounts / Rules / Connections, and re-applies the same formulas.
/* global SpreadsheetApp */

import {
  TABS, TRANSACTION_HEADERS, ACCOUNT_HEADERS, RULE_HEADERS, CONNECTION_HEADERS, CONFIG_KEYS,
  SETUP_VERSION, CF, TX_COL, STATUS, DIRECTION, ACCOUNT_TYPES,
} from '../core/schema.js';
import { templatePatches, isOpenEnded } from '../core/formulas.js';
import { validateSeed } from '../core/seed.js';

export const TEMPLATE_TABS = ['GUIDELINE', 'Setup', 'CASHFLOW', 'GROWTH ANALYSIS', 'QUARTER REPORT', 'BUDGET TRACKER', 'FINAL STATEMENT', 'rawdata'];
const MIN_LEDGER_ROWS = 3000;
const TIME_ZONE = 'Asia/Jakarta';

function rangeOf(sheet, a1) {
  return sheet.getRange(isOpenEnded(a1) ? `${a1}${sheet.getMaxRows()}` : a1);
}

function ensureTab(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  const created = !sh;
  if (!sh) sh = ss.insertSheet(name);
  const head = sh.getRange(1, 1, 1, headers.length);
  head.setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return { sheet: sh, created };
}

export function configValue(ss, key) {
  const sh = ss.getSheetByName(TABS.config);
  if (!sh) return '';
  const i = CONFIG_KEYS.findIndex((k) => k.key === key);
  return i < 0 ? '' : sh.getRange(i + 2, 2).getValue();
}

export function setConfigValue(ss, key, value) {
  const i = CONFIG_KEYS.findIndex((k) => k.key === key);
  if (i < 0) throw new Error(`unknown config key ${key}`);
  ss.getSheetByName(TABS.config).getRange(i + 2, 2).setValue(value);
}

function ensureConfig(ss, seed, firstRun) {
  const { sheet } = ensureTab(ss, TABS.config, ['key', 'value', 'note']);
  CONFIG_KEYS.forEach((k, i) => {
    const row = i + 2;
    sheet.getRange(row, 1).setValue(k.key);
    sheet.getRange(row, 3).setValue(k.note);
    ss.setNamedRange(k.name, sheet.getRange(row, 2));
  });
  if (firstRun) {
    const [y, m, d] = seed.start_date.split('-').map(Number);
    setConfigValue(ss, 'start_date', new Date(y, m - 1, d));
    setConfigValue(ss, 'payday_day', seed.payday_day);
    setConfigValue(ss, 'owner_name', seed.owner_name);
  }
  sheet.getRange('B2').setNumberFormat('yyyy-mm-dd');
}

/** Writes the category names into CASHFLOW K5:K38 (K39/K40 are the template's fixed rows). */
export function writeCategories(ss, slots) {
  const cf = ss.getSheetByName(CF.sheet);
  cf.getRange(`K${CF.incomeRows[0]}:K${CF.incomeRows[1]}`).setValues(slots.income.map((n) => [n]));
  cf.getRange(`K${CF.expenseRows[0]}:K${CF.expenseRows[1]}`).setValues(slots.expense.map((n) => [n]));
}

/** Replaces the Accounts tab body. */
export function writeAccounts(ss, accounts) {
  const sh = ss.getSheetByName(TABS.accounts);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, ACCOUNT_HEADERS.length).clearContent();
  if (!accounts.length) return;
  sh.getRange(2, 1, accounts.length, ACCOUNT_HEADERS.length)
    .setValues(accounts.map((a) => ACCOUNT_HEADERS.map((h) => (a[h] ?? (h === 'opening_balance' ? 0 : '')))));
}

function applyPatch(ss, p) {
  const sh = ss.getSheetByName(p.sheet);
  if (!sh) throw new Error(`setup: tab "${p.sheet}" not found`);
  switch (p.op) {
    case 'clear': {
      const r = rangeOf(sh, p.range);
      r.clearContent();
      r.clearNote();
      if (p.validations) r.clearDataValidations();
      return;
    }
    case 'formula': sh.getRange(p.cell).setFormula(p.formula); return;
    case 'formulas': sh.getRange(p.range).setFormulas(p.formulas); return;
    case 'values': sh.getRange(p.range).setValues(p.values); return;
    default: throw new Error(`setup: unknown patch op ${p.op}`);
  }
}

function listRule(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function formatTabs(ss) {
  const tx = ss.getSheetByName(TABS.transactions);
  const col = (h) => tx.getRange(`${TX_COL[h]}2:${TX_COL[h]}`);
  col('date').setNumberFormat('yyyy-mm-dd');
  col('time').setNumberFormat('hh:mm:ss');
  col('amount').setNumberFormat('#,##0');
  col('updated_at').setNumberFormat('yyyy-mm-dd hh:mm');
  col('direction').setDataValidation(listRule(DIRECTION));
  col('status').setDataValidation(listRule(STATUS));
  const cats = ss.getSheetByName(CF.sheet).getRange(`$K$${CF.incomeRows[0]}:$K$${CF.transferRow}`);
  col('category').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(cats, true).setAllowInvalid(true).build());
  const streams = ss.getSheetByName(TABS.accounts).getRange('$A$2:$A');
  col('stream').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(streams, true).setAllowInvalid(true).build());

  const acc = ss.getSheetByName(TABS.accounts);
  acc.getRange('B2:B').setDataValidation(listRule(ACCOUNT_TYPES));
  acc.getRange('F2:F').setNumberFormat('#,##0');

  const cf = ss.getSheetByName(CF.sheet);
  cf.getRange(`B${CF.firstDataRow}:B`).setNumberFormat('d mmm yyyy');
  cf.getRange(`G${CF.firstDataRow}:H`).setNumberFormat('#,##0');
  cf.getRange(CF.payday.payday).setNumberFormat('d mmm yyyy');
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {object} seedRaw  contents of private/seed.json (or the example seed)
 * @returns {string[]} log lines
 */
export function runSetup(ss, seedRaw) {
  const seed = validateSeed(seedRaw);
  const log = [];
  const missing = TEMPLATE_TABS.filter((n) => !ss.getSheetByName(n));
  if (missing.length) throw new Error(`This is not the cashflow template (missing tabs: ${missing.join(', ')})`);

  ss.setSpreadsheetTimeZone(TIME_ZONE);
  const firstRun = !configValue(ss, 'setup_version');
  log.push(firstRun ? 'First run: seeding categories, accounts and settings' : `Re-run (setup version ${configValue(ss, 'setup_version')})`);

  ensureTab(ss, TABS.transactions, TRANSACTION_HEADERS);
  const acc = ensureTab(ss, TABS.accounts, ACCOUNT_HEADERS);
  ensureTab(ss, TABS.rules, RULE_HEADERS);
  ensureTab(ss, TABS.connections, CONNECTION_HEADERS);
  ensureConfig(ss, seed, firstRun);

  if (firstRun) {
    writeCategories(ss, seed.slots);
    if (acc.created || acc.sheet.getLastRow() < 2) writeAccounts(ss, seed.accounts);
    ss.getSheetByName('Setup').getRange('D3').setValue(seed.year);
    // Demo budgets in the template point at placeholder categories.
    const bt = ss.getSheetByName('BUDGET TRACKER');
    ['C6:C8', 'G6:G8', 'H6:H8', 'L6:L8'].forEach((r) => bt.getRange(r).clearContent());
    log.push(`Seeded ${seed.categories.income.length} income + ${seed.categories.expense.length} expense categories, ${seed.accounts.length} accounts`);
  }

  const cf = ss.getSheetByName(CF.sheet);
  if (cf.getMaxRows() < MIN_LEDGER_ROWS) cf.insertRowsAfter(cf.getMaxRows(), MIN_LEDGER_ROWS - cf.getMaxRows());

  const patches = templatePatches();
  patches.forEach((p) => applyPatch(ss, p));
  log.push(`Applied ${patches.length} template patches`);

  formatTabs(ss);
  setConfigValue(ss, 'setup_version', SETUP_VERSION);
  SpreadsheetApp.flush();
  log.push('Done');
  return log;
}
