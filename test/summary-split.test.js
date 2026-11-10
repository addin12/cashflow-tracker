// A wallet's monthly total waiting in "Perlu dicek" can be split by category right from its card.
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
    ],
    [TABS.rules]: [], [TABS.connections]: [{ gmail: 'you@gmail.com', last_sync: '2026-11-10T03:00:00.000Z', last_status: 'live ok' }],
    [TABS.inboxLog]: [], [TABS.budgets]: [], [TABS.goals]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, language: '' };
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
      const runner = () => {
        let ok;
        const r = {
          withSuccessHandler(f) { ok = f; return r; }, withFailureHandler() { return r; },
          api(name, json) { setTimeout(() => { try { ok(JSON.stringify({ data: api[name](JSON.parse(json)) })); } catch (e) { ok(JSON.stringify({ error: e.message })); } }, 0); },
        };
        return r;
      };
      window.google = { script: { get run() { return runner(); } } };
      Object.defineProperty(window.navigator, 'language', { value: 'id-ID' });
    },
  });
  doc = dom.window.document;
  await until(() => doc.querySelector('.txcard[data-id="s1"]'), 'review cards');
}, 20000);

describe('a wallet summary card', () => {
  it('says why there is only a total, and offers to split it; an ordinary card offers neither', () => {
    const card = doc.querySelector('.txcard[data-id="s1"]');
    expect(card.textContent).toContain('hanya mengirim total bulanan');
    expect(card.querySelector('[data-action=splitsummary]').textContent).toBe('Bagi per kategori');
    const other = doc.querySelector('.txcard[data-id="t1"]');
    expect(other.querySelector('[data-action=splitsummary]')).toBeNull();
    expect(other.querySelector('.hint')).toBeNull();
  });
  it('the button opens the split form for that total, and saving it files each part under its category', async () => {
    click(doc.querySelector('[data-action=splitsummary][data-id=s1]'));
    expect(doc.querySelector('#modal').classList.contains('open')).toBe(true);
    const rows = doc.querySelectorAll('.split-row');
    expect(rows).toHaveLength(2);
    rows[0].querySelector('[data-s=amount]').value = '80000';
    rows[0].querySelector('[data-s=category]').value = 'fnb';
    rows[1].querySelector('[data-s=amount]').value = '35419';
    rows[1].querySelector('[data-s=category]').value = 'Transport';
    rows[1].querySelector('[data-s=amount]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(doc.querySelector('#splitLeft').textContent).toContain('Pas dengan total');
    doc.querySelector('form[data-form=split]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.t[TABS.transactions].some((r) => r.id === 's1_s1'), 'split saved');
    expect(store.t[TABS.transactions].find((r) => r.id === 's1')).toMatchObject({ amount: 80000, category: 'fnb', status: 'approved' });
    expect(store.t[TABS.transactions].find((r) => r.id === 's1_s1')).toMatchObject({ amount: 35419, category: 'Transport', stream: 'GoPay', status: 'approved' });
  });
});
