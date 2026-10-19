// CSV files people open in Excel or Sheets: the transaction export, the SPT list, and the backup that
// comes with the monthly email. A text cell that starts like a formula gets a leading ' so a
// description such as "=HYPERLINK(...)" can't run when the file is opened. Numbers are left alone.

const FORMULA_START = /^([=+@\t\r]|-(?!\d))/;

export function csvCell(v) {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '');
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Head + rows -> CSV text with a BOM (Excel then reads it as UTF-8). */
export const toCsv = (head, rows) => `﻿${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}`;

export const BACKUP_HEAD = ['id', 'date', 'time', 'owner', 'stream', 'direction', 'amount', 'category', 'description', 'details', 'source', 'status', 'ref_no', 'transfer_id'];

/** Every transaction, oldest first, with the columns needed to rebuild the sheet. */
export function backupCsv(rows) {
  const sorted = [...rows].sort((a, b) => `${String(a.date).slice(0, 10)}${a.time}`.localeCompare(`${String(b.date).slice(0, 10)}${b.time}`));
  return toCsv(BACKUP_HEAD, sorted.map((r) => BACKUP_HEAD.map((h) => (h === 'date' ? String(r.date).slice(0, 10) : h === 'amount' ? Number(r.amount) || 0 : r[h] ?? ''))));
}
