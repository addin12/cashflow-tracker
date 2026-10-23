// A READ-ONLY copy of the real spreadsheet as the app's in-memory store (exported with the clasp login, nothing is
// written back). Shared by the dev checks that want to see the app on real data: smoke-live.mjs, screens-live.mjs.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { TABS, CF, CONFIG_KEYS } from '../src/core/schema.js';

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

/** @returns {Promise<{store: object, tables: object, cfg: object, slots: object, people: {who: string, isOwner: boolean, emails: string}[]}>} */
export async function loadLive() {
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
  return { store, tables, cfg, slots, people };
}
