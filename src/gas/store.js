// Reading and writing the app's tabs as arrays of objects (keyed by header).
/* global SpreadsheetApp */

import { TABS, TRANSACTION_HEADERS } from '../core/schema.js';

const pad = (n) => String(n).padStart(2, '0');

/** Sheet cell -> plain value for the core logic (dates 'YYYY-MM-DD', times 'HH:MM:SS'). */
function fromCell(header, v, tz) {
  if (v instanceof Date) {
    if (header === 'time') return `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
    if (header === 'updated_at' || header === 'connected_at' || header === 'last_sync' || header === 'created_at') return v.toISOString();
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (header === 'time' && typeof v === 'number') {
    const s = Math.round(v * 86400);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }
  return v;
}

/** Core value -> sheet cell (dates as Date so the template's date formulas work). */
function toCell(header, v) {
  if (header === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (header === 'time' && typeof v === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
    const [h, mi, s = 0] = v.split(':').map(Number);
    return (h * 3600 + mi * 60 + s) / 86400;
  }
  if (header === 'updated_at' && typeof v === 'string' && v) return new Date(v);
  return v ?? '';
}

export function readTable(ss, tab) {
  const sh = ss.getSheetByName(tab);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const headers = values[0].map(String);
  return values.slice(1)
    .map((row, i) => Object.assign(Object.fromEntries(headers.map((h, j) => [h, fromCell(h, row[j])])), { _row: i + 2 }))
    .filter((o) => headers.some((h) => o[h] !== '' && o[h] != null));
}

export function appendRows(ss, tab, headers, rows) {
  if (!rows.length) return;
  const sh = ss.getSheetByName(tab);
  const start = sh.getLastRow() + 1;
  if (sh.getMaxRows() < start + rows.length) sh.insertRowsAfter(sh.getMaxRows(), start + rows.length - sh.getMaxRows() + 100);
  sh.getRange(start, 1, rows.length, headers.length).setValues(rows.map((r) => headers.map((h) => toCell(h, r[h]))));
}

/** Applies { id, changes } to rows found by id (column A). */
export function updateRows(ss, tab, headers, updates) {
  if (!updates.length) return 0;
  const sh = ss.getSheetByName(tab);
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map((r) => String(r[0]));
  let n = 0;
  for (const { id, changes } of updates) {
    const row = ids.indexOf(String(id)) + 1;
    if (row < 2) continue;
    // One read and one write per row (each call to the sheet is slow).
    const range = sh.getRange(row, 1, 1, headers.length);
    const values = range.getValues()[0];
    for (const [h, v] of Object.entries(changes)) {
      const col = headers.indexOf(h);
      if (col >= 0) values[col] = toCell(h, v);
    }
    range.setValues([values]);
    n += 1;
  }
  return n;
}

export const readTransactions = (ss) => readTable(ss, TABS.transactions);
export const appendTransactions = (ss, rows) => appendRows(ss, TABS.transactions, TRANSACTION_HEADERS, rows);
export const updateTransactions = (ss, updates) => updateRows(ss, TABS.transactions, TRANSACTION_HEADERS, updates);

/** Whole-row replace (used by the web app when the user edits a row). */
export function writeRow(ss, tab, headers, rowNumber, obj) {
  ss.getSheetByName(tab).getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((h) => toCell(h, obj[h]))]);
}

export function deleteRowById(ss, tab, id) {
  const sh = ss.getSheetByName(tab);
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map((r) => String(r[0]));
  const row = ids.indexOf(String(id)) + 1;
  if (row >= 2) sh.deleteRow(row);
  return row >= 2;
}

export function spreadsheet() {
  return SpreadsheetApp.getActive() || null;
}
