// Turns the uploaded template into the app's spreadsheet. Safe to run again: it never touches
// data in Transactions / Accounts / Rules / Connections, and re-applies the same formulas.
/* global SpreadsheetApp */

import {
  TABS, TRANSACTION_HEADERS, ACCOUNT_HEADERS, RULE_HEADERS, CONNECTION_HEADERS, CONFIG_KEYS, INBOX_LOG_HEADERS, BUDGET_HEADERS,
  SETUP_VERSION, CF, TX_COL, STATUS, DIRECTION, ACCOUNT_TYPES, FIXED_CATEGORIES,
} from '../core/schema.js';
import { templatePatches, isOpenEnded } from '../core/formulas.js';
import { validateSeed } from '../core/seed.js';
import { changeCategorySlots, renameCategoryEverywhere } from '../core/api.js';
import { slotsAfterChanges } from '../core/categories.js';
import { sheetStore } from './sheetstore.js';

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

/** Values for keys added in a later setup version: filled once, never overwritten. */
function fillNewConfig(ss, seed) {
  const fill = (key, value) => { if (configValue(ss, key) === '' && value !== '') setConfigValue(ss, key, value); };
  fill('owner_bank_names', seed.owner_bank_names.join(', '));
  fill('cat_transfer', seed.defaults.transfer);
  fill('cat_fee', seed.defaults.fee);
  fill('weekly_email', 'on');
  fill('monthly_email', 'on');
  fill('payday_email', 'on');
  fill('cat_dividend', seed.defaults.dividend);
}

// Hints written by setup version 1, which version 2 may replace with the better ones from the
// seed (account numbers found in the emails). A hint the user changed is left alone.
// (The owner's sheet was migrated on 2026-10-05; only the generic v1 placeholders are kept here.)
const V1_HINTS = new Set(['livin', 'gopay', 'manual', 'dividen']);

function migrateAccountHints(ss, seed, log) {
  const sh = ss.getSheetByName(TABS.accounts);
  if (sh.getLastRow() < 2) return;
  const col = ACCOUNT_HEADERS.indexOf('match_hint') + 1;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, ACCOUNT_HEADERS.length).getValues();
  let n = 0;
  rows.forEach((r, i) => {
    const s = seed.accounts.find((a) => a.stream === r[0]);
    if (s && V1_HINTS.has(String(r[col - 1])) && s.match_hint !== r[col - 1]) {
      sh.getRange(i + 2, col).setValue(s.match_hint);
      n += 1;
    }
  });
  if (n) log.push(`Updated ${n} account hint(s)`);
}

/**
 * The seed's category_changes newer than this sheet: renames keep their slot (and are carried
 * into transactions, rules and budgets); additions take the first free slot of their kind.
 */
function applyCategoryChanges(ss, seed, log, fromVersion) {
  const changes = (seed.category_changes || []).filter((c) => c.since > fromVersion);
  if (!changes.length) return;
  const store = sheetStore(ss);
  const renamed = changeCategorySlots(store, slotsAfterChanges(store.slots(), changes));
  // The fixed transfer category (CASHFLOW K40) isn't a slot: rename the cell, then its rows.
  const transfer = String(store.config('cat_transfer') || FIXED_CATEGORIES.transfer);
  const fixed = {};
  for (const c of changes) {
    const to = (c.rename || {})[transfer];
    if (to && to !== transfer) fixed[transfer] = to;
  }
  if (fixed[transfer]) {
    ss.getSheetByName(CF.sheet).getRange(`K${CF.transferRow}`).setValue(fixed[transfer]);
    Object.assign(renamed, renameCategoryEverywhere(store, fixed)); // also sets cat_transfer
  }
  log.push(`Categories updated${Object.keys(renamed).length ? ` (renamed ${Object.entries(renamed).map(([a, b]) => `${a} → ${b}`).join(', ')})` : ''}`);
}

/**
 * One-off repairs from the seed's data_fixes newer than this sheet (the seed is private, so row
 * ids stay out of the public code). Each fix applies only while the row still holds the value it
 * corrects, so a category the owner changed since is left alone.
 *   { since, transactions: [[id, fromCategory, toCategory]], rules: [{ pattern, from, to } | { pattern, id }] }
 */
function applyDataFixes(ss, seed, log, fromVersion) {
  const fixes = (seed.data_fixes || []).filter((f) => f.since > fromVersion);
  if (!fixes.length) return;
  const store = sheetStore(ss);
  const rows = new Map(store.read(TABS.transactions).map((r) => [String(r.id), r]));
  const updates = [];
  let skipped = 0;
  for (const f of fixes) {
    for (const [id, from, to] of f.transactions || []) {
      const r = rows.get(String(id));
      if (r && r.category === from) updates.push({ id: r.id, changes: { category: to } }); else skipped += 1;
    }
  }
  if (updates.length) store.update(TABS.transactions, updates);
  // Rules are fixed cell by cell, found by pattern (ids may be duplicated, which is one of the fixes).
  const sh = ss.getSheetByName(TABS.rules);
  const col = (h) => RULE_HEADERS.indexOf(h);
  const values = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, RULE_HEADERS.length).getValues() : [];
  let ruleFixes = 0;
  values.forEach((v, i) => {
    for (const f of fixes) {
      for (const x of f.rules || []) {
        if (String(v[col('pattern')]) !== x.pattern) continue;
        if (x.to && String(v[col('category')]) === x.from) { sh.getRange(i + 2, col('category') + 1).setValue(x.to); v[col('category')] = x.to; ruleFixes += 1; }
        if (x.id && String(v[col('id')]) !== x.id) { sh.getRange(i + 2, col('id') + 1).setValue(x.id); v[col('id')] = x.id; ruleFixes += 1; }
      }
    }
  });
  log.push(`Data fixes: ${updates.length} transaction(s), ${ruleFixes} rule change(s)${skipped ? `, ${skipped} skipped (already changed)` : ''}`);
}

/**
 * Starter rules: all of them into an empty Rules tab; on an upgrade only the rules marked
 * `since` a newer setup version (so a starter rule the owner deleted doesn't come back).
 */
function seedRules(ss, seed, log, fromVersion) {
  const sh = ss.getSheetByName(TABS.rules);
  const empty = sh.getLastRow() < 2;
  const existing = empty ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, RULE_HEADERS.length).getValues();
  const patterns = new Set(existing.map((r) => String(r[RULE_HEADERS.indexOf('pattern')])));
  const wanted = seed.rules
    .map((r, i) => ({ ...r, n: i + 1 }))
    .filter((r) => (empty || Number(r.since || 0) > fromVersion) && !patterns.has(r.pattern));
  if (!wanted.length) return;
  const now = new Date();
  // Ids follow the seed's order, which can change between versions: never reuse one in the sheet.
  const ids = new Set(existing.map((r) => String(r[RULE_HEADERS.indexOf('id')])));
  const freeId = (n) => { let id = `r_seed_${n}`; while (ids.has(id)) id += 'b'; ids.add(id); return id; };
  const rows = wanted.map((r) => RULE_HEADERS.map((h) => ({
    id: freeId(r.n), field: r.field || 'description', pattern: r.pattern, category: r.category, stream_override: r.stream_override || '',
    auto_approve: r.auto_approve !== false, hits: 0, created_by: 'setup', created_at: now,
  })[h]));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, RULE_HEADERS.length).setValues(rows);
  log.push(`Added ${rows.length} starter rule(s)`);
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
  const fromVersion = Number(configValue(ss, 'setup_version')) || 0;
  const firstRun = fromVersion === 0;
  log.push(firstRun ? 'First run: seeding categories, accounts and settings' : `Upgrade from setup version ${fromVersion} to ${SETUP_VERSION}`);

  ensureTab(ss, TABS.transactions, TRANSACTION_HEADERS);
  const acc = ensureTab(ss, TABS.accounts, ACCOUNT_HEADERS);
  ensureTab(ss, TABS.rules, RULE_HEADERS);
  ensureTab(ss, TABS.connections, CONNECTION_HEADERS);
  ensureTab(ss, TABS.inboxLog, INBOX_LOG_HEADERS);
  ensureTab(ss, TABS.preview, TRANSACTION_HEADERS);
  ensureTab(ss, TABS.budgets, BUDGET_HEADERS);
  ensureConfig(ss, seed, firstRun);
  fillNewConfig(ss, seed);
  seedRules(ss, seed, log, fromVersion);
  if (!firstRun && fromVersion < 2) migrateAccountHints(ss, seed, log);
  if (!firstRun) applyCategoryChanges(ss, seed, log, fromVersion);
  if (!firstRun) applyDataFixes(ss, seed, log, fromVersion);

  if (firstRun) {
    writeCategories(ss, seed.slots);
    ss.getSheetByName(CF.sheet).getRange(`K${CF.transferRow}`).setValue(seed.defaults.transfer); // its name may differ from the template's
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
