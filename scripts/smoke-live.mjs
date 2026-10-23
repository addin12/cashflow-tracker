// Dev check: runs the app's API on a READ-ONLY copy of the real spreadsheet (exported with the clasp login, kept
// in memory, nothing is written anywhere) for both people, and reports crashes, slow calls and odd numbers.
//   node scripts/smoke-live.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createApi } from '../src/core/api.js';
import { TABS, CF, CONFIG_KEYS } from '../src/core/schema.js';

const sheetId = JSON.parse(readFileSync('.clasp.json', 'utf8')).parentId;
const cred = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
})).json();
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const res = await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}/export?mimeType=${encodeURIComponent(mime)}`, { headers: { authorization: `Bearer ${tok.access_token}` } });
if (!res.ok) throw new Error(`export failed: HTTP ${res.status}`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));

const pad = (n) => String(n).padStart(2, '0');
function plain(header, v) {
  if (v && typeof v === 'object' && !(v instanceof Date)) v = 'result' in v ? v.result : v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? '';
  if (v instanceof Date) {
    if (header === 'time') return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
    if (['updated_at', 'connected_at', 'last_sync', 'created_at'].includes(header)) return v.toISOString();
    return v.toISOString().slice(0, 10);
  }
  return v == null ? '' : v;
}
const table = (name) => {
  const ws = wb.getWorksheet(name);
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row) => rows.push(row.values.slice(1)));
  const [head, ...body] = rows;
  if (!head) return [];
  const headers = head.map(String);
  return body.map((r) => Object.fromEntries(headers.map((h, j) => [h, plain(h, r[j])]))).filter((o) => Object.values(o).some((v) => v !== ''));
};

const tables = Object.fromEntries(Object.values(TABS).map((t) => [t, table(t)]));
const cfg = {};
const cws = wb.getWorksheet(TABS.config);
if (cws) cws.eachRow((row, i) => { if (i > 1 && i <= CONFIG_KEYS.length + 1) { const [k, v] = row.values.slice(1); cfg[String(k)] = v instanceof Date ? v.toISOString().slice(0, 10) : plain('', v); } });
const cf = wb.getWorksheet(CF.sheet);
const cell = (r) => String(plain('', cf.getCell(`K${r}`).value));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => cell(a + i));
const slots = { income: range(...CF.incomeRows), expense: range(...CF.expenseRows) };

const store = {
  read: (tab) => (tables[tab] || []).map((r) => ({ ...r })),
  append: (tab, rows) => { (tables[tab] = tables[tab] || []).push(...rows.map((r) => ({ ...r }))); },
  update: (tab, ups) => ups.forEach(({ id, changes }) => Object.assign((tables[tab] || []).find((r) => String(r.id) === String(id)) || {}, changes)),
  remove: (tab, id) => { tables[tab] = (tables[tab] || []).filter((r) => String(r.id) !== String(id)); },
  replace: (tab, rows) => { tables[tab] = rows.map((r) => ({ ...r })); },
  config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; },
  slots: () => ({ income: [...slots.income], expense: [...slots.expense] }), setSlots() {},
};

const people = [
  { who: String(cfg.owner_name), isOwner: true, emails: String(cfg.owner_email || '') },
  { who: String(cfg.partner_name), isOwner: false, emails: String(cfg.partner_email || '') },
].filter((p) => p.who);

let problems = 0;
const money = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('id-ID') : n);
for (const p of people) {
  const api = createApi(store, { now: () => new Date(), isOwner: p.isOwner, meName: p.who, myEmail: p.emails.split(',')[0].trim().toLowerCase() });
  const calls = [
    ['bootstrap', () => api.bootstrap()], ['review', () => api.review()], ['dashboard', () => api.dashboard({})],
    ['dashboard Kita', () => api.dashboard({ who: '' })], ['dashboard mine', () => api.dashboard({ who: p.who })],
    ['list', () => api.list({ limit: 100000 })], ['settings', () => api.settings()], ['yearly', () => api.yearly({ year: new Date().getFullYear() })],
    ['yearly mine', () => api.yearly({ year: new Date().getFullYear(), owner: p.who })],
  ];
  console.log(`\n== ${p.who} (${p.isOwner ? 'owner' : 'partner'})`);
  for (const [name, fn] of calls) {
    const t = Date.now();
    try {
      const out = fn();
      const ms = Date.now() - t;
      const flag = ms > 400 ? '  SLOW' : '';
      if (flag) problems += 1;
      let note = '';
      if (name === 'bootstrap') note = `setup ${JSON.stringify(out.setup)} · notConnected ${JSON.stringify(out.notConnected)}`;
      if (name === 'review') note = `pending ${out.pending.length} · unreadable ${out.errors.length} · ruleable ${out.ruleable}`;
      if (name === 'dashboard') note = `spent ${money(out.summary && out.summary.expense)} · accounts ${(out.balances || []).filter((b) => b.owner === p.who).map((b) => `${b.stream} ${money(b.balance)}`).join(', ')}`;
      console.log(`${name.padEnd(16)} ${String(ms).padStart(4)} ms${flag}  ${note}`);
    } catch (e) {
      problems += 1;
      console.log(`${name.padEnd(16)} CRASH: ${e.message}\n${String(e.stack).split('\n').slice(1, 3).join('\n')}`);
    }
  }
}
console.log(problems ? `\n${problems} problem(s)` : '\nno crashes, nothing slow');
