// Dev helper: value, formula and number format of some cells of the bound spreadsheet.
//   node scripts/inspect-cells.mjs CASHFLOW B141:H141
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

const [tab, range] = process.argv.slice(2);
const sheetId = JSON.parse(readFileSync('.clasp.json', 'utf8')).parentId;
const cred = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
})).json();
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const res = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=${encodeURIComponent(mime)}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
const ws = wb.getWorksheet(tab);
const [a, b] = range.split(':');
const col = (s) => s.replace(/\d+/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const row = (s) => Number(s.replace(/\D+/g, ''));
for (let r = row(a); r <= row(b || a); r += 1) {
  for (let c = col(a); c <= col(b || a); c += 1) {
    const cell = ws.getCell(r, c);
    console.log(cell.address, JSON.stringify(cell.value), '| type', cell.type, '| fmt', cell.numFmt || '', cell.formula ? `| formula ${cell.formula.slice(0, 120)}` : '');
  }
}
