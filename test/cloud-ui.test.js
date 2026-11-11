// The page served by the Cloudflare Worker has no google.script: its calls are plain fetch to /api/<method>, and the start-up and the home screen are
// put together from several small requests. Here the page runs in jsdom against the real app on an in-memory store, behind a fetch like the Worker's.
import { describe, expect, it, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildUiHtml } from '../scripts/ui-build.mjs';
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { buildCategorySlots } from '../src/core/categories.js';

function memoryStore() {
  const t = {
    [TABS.transactions]: [
      { id: 's1', date: '2026-10-31', time: '', owner: 'Me', stream: 'GoPay', direction: 'out', amount: 115419, category: '', description: 'Pengeluaran GoPay 2026-10 (ringkasan bulanan)', details: 'Dari ringkasan bulanan GoPay: pilih kategori', status: 'pending', source: 'summary', gmail_id: 'gs', updated_by: 'sync' },
      { id: 't1', date: '2026-10-04', time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: '', description: 'WARUNG BU SITI', details: 'QRIS', status: 'pending', gmail_id: 'g1', updated_by: 'sync' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', institution: 'BCA', match_hint: '56', opening_balance: 1000000 },
      { stream: 'GoPay', type: 'Spending', owner: 'Me', institution: 'GoPay', match_hint: '', opening_balance: 0 },
      { stream: 'Cash', type: 'Spending', owner: 'Me', institution: '', match_hint: 'manual', opening_balance: 0 },
      { stream: 'OVO', type: 'Spending', owner: 'Dewi', institution: 'OVO', match_hint: '', opening_balance: 0 },
      { stream: 'BCA Dewi', type: 'Spending', owner: 'Dewi', institution: 'BCA', match_hint: '99', opening_balance: 0 },
    ],
    [TABS.rules]: [], [TABS.connections]: [{ gmail: 'you@gmail.com', last_sync: '2026-11-10T03:00:00.000Z', last_status: 'live ok' }],
    [TABS.inboxLog]: [], [TABS.budgets]: [], [TABS.goals]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, language: '' };
  const slots = buildCategorySlots({ income: ['gaji'], expense: ['fnb', 'Transport'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, rows) => { t[tab].push(...rows.map((r) => ({ ...r }))); },
    update: (tab, updates) => updates.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, rows) => { t[tab] = rows.map((r) => ({ ...r })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}

let dom; let store; let doc;
const calls = [];
async function until(fn, what, ms = 1500) {
  for (const end = Date.now() + ms; Date.now() < end;) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!fn()) throw new Error(`timed out waiting for ${what}`);
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

beforeAll(async () => {
  store = memoryStore();
  const api = createApi(store, { now: () => new Date(2026, 10, 10, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
  dom = new JSDOM(await buildUiHtml(), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
    beforeParse(window) {
      window.confirm = () => true;
      // The Worker's /api/<method>: the app's own method on the store, answered as {data} or {error}
      window.fetch = async (url, init = {}) => {
        const name = String(url).replace('/api/', '');
        const args = JSON.parse(init.body || '{}');
        calls.push({ name, part: args.part });
        try {
          if (!(name in api)) throw new Error('unknown method ' + name);
          return { ok: true, status: 200, json: async () => ({ data: api[name](args) }) };
        } catch (e) { return { ok: false, status: 500, json: async () => ({ error: e.message }) }; }
      };
      Object.defineProperty(window.navigator, 'language', { value: 'id-ID' });
    },
  });
  doc = dom.window.document;
  await until(() => doc.querySelector('.txcard[data-id="s1"]'), 'review cards');
}, 20000);

describe('the page on Cloudflare', () => {
  it('starts without google.script: the start-up is several small requests, never one big "init", and the home screen comes in its three parts', () => {
    const names = calls.map((c) => c.name);
    expect(names).not.toContain('init');
    expect(names).toEqual(expect.arrayContaining(['bootstrap', 'review', 'incoming', 'dashboard']));
    expect(calls.filter((c) => c.name === 'dashboard').map((c) => c.part).sort()).toEqual(['bills', 'insights', 'main']);
    expect(doc.querySelector('.txcard[data-id="s1"]')).not.toBeNull(); // and the screen is built from them
  });
  it('a change goes to its own method; the screen follows', async () => {
    const before = calls.length;
    doc.querySelector('.txcard[data-id="t1"] [data-field=category]').value = 'fnb';
    doc.querySelector('.txcard[data-id="t1"] [data-action=approve]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await until(() => calls.slice(before).some((c) => c.name === 'approve'), 'approve call');
    await until(() => store.t[TABS.transactions].find((r) => r.id === 't1').status === 'approved', 'row approved');
    expect(store.t[TABS.transactions].find((r) => r.id === 't1').category).toBe('fnb');
  });
  it('a failed call shows its message instead of breaking the page', async () => {
    const { callCloud } = await import('../src/ui/cloud.js');
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'database is busy' }) });
    await expect(callCloud('approve', { id: 'x' })).rejects.toThrow('database is busy');
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(callCloud('approve', { id: 'x' })).rejects.toMatchObject({ retry: true });
    delete globalThis.fetch;
  });
});
