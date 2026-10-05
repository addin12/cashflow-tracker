// Dev helper: print cells of the bound spreadsheet, using the clasp login (drive.file scope:
// clasp uploaded the file, so it may export it). Exports to .xlsx and reads exact cell values;
// the gviz CSV endpoint guesses one type per column and blanks the rest, so it is not used.
//   node scripts/read-tab.mjs "Self-test" [A1:C10]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

const [tab = 'Self-test', range] = process.argv.slice(2);
const sheetId = JSON.parse(readFileSync('.clasp.json', 'utf8')).parentId;
const cred = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
})).json();
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const res = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=${encodeURIComponent(mime)}`, {
  headers: { authorization: `Bearer ${tok.access_token}` },
});
if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
const ws = wb.getWorksheet(tab);
if (!ws) throw new Error(`no tab "${tab}"`);

const show = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : String(v.result ?? v.text ?? v.error ?? '');
  return String(v);
};
const rows = [];
if (range) {
  const [a, b = a] = range.split(':');
  const s = ws.getCell(a); const e = ws.getCell(b);
  for (let r = s.row; r <= e.row; r += 1) {
    const cells = [];
    for (let c = s.col; c <= e.col; c += 1) cells.push(show(ws.getRow(r).getCell(c).value));
    rows.push(`${r}: ${cells.join(' | ')}`);
  }
} else {
  ws.eachRow((row, r) => rows.push(`${r}: ${row.values.slice(1).map(show).join(' | ')}`));
}
console.log(rows.join('\n'));
