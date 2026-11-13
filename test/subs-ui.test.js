// "Kelola langganan": tapping "Mau berhenti" / "Masih dipakai" updates the open sheet in place (it must not close or jump), keeps the focus where the finger was,
// updates the saving, persists, and a second tap takes the mark off again.
import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildUiHtml } from '../scripts/ui-build.mjs';
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { buildCategorySlots } from '../src/core/categories.js';

const tx = (id, date, amount, description) => ({ id, date, time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount, category: 'Langganan', description, details: '', status: 'approved', source: 'email' });
function memoryStore() {
  const t = {
    [TABS.transactions]: [
      ...['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10'].map((d, i) => tx(`n${i}`, d, 54000, 'NETFLIX')),
      ...['2026-07-12', '2026-08-12', '2026-09-12', '2026-10-12'].map((d, i) => tx(`s${i}`, d, 40000, 'SPOTIFY')),
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', institution: 'BCA', match_hint: '56', opening_balance: 5000000 }],
    [TABS.rules]: [], [TABS.connections]: [], [TABS.inboxLog]: [], [TABS.budgets]: [], [TABS.goals]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-07-01', payday_day: 28, language: '' };
  const slots = buildCategorySlots({ income: ['gaji'], expense: ['Langganan'] });
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

let dom; let doc; let store;
async function until(fn, what, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end;) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!fn()) throw new Error(`timed out waiting for ${what}`);
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const marks = () => [...doc.querySelectorAll('#modal [data-action=submark]')];
const rowOf = (name) => [...doc.querySelectorAll('#modal .sub-row')].find((r) => r.textContent.includes(name));

beforeAll(async () => {
  store = memoryStore();
  const api = createApi(store, { now: () => new Date(2026, 10, 10, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet', meName: 'Me' });
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
  await until(() => doc.querySelector('#view h1') && !doc.querySelector('#view .skeleton'), 'the first screen');
  click(doc.querySelector('.nav [data-tab=dashboard]'));
  await until(() => doc.querySelector('#view .ask'), 'the overview');
  await until(() => doc.querySelector('#view [data-action=subs]'), 'the subscriptions card');
  click(doc.querySelector('#view [data-action=subs]'));
  await until(() => doc.querySelector('#modal .sub-row'), 'the manager');
}, 20000);

describe('Kelola langganan', () => {
  it('lists the subscriptions, the dearest a month first', () => {
    expect([...doc.querySelectorAll('#modal .sub-row b')].map((b) => b.textContent).filter((t) => /NETFLIX|SPOTIFY/.test(t))).toEqual(['NETFLIX', 'SPOTIFY']);
    expect(doc.querySelector('#modal .lead').textContent).toContain('94.000'); // 54.000 + 40.000 a month
  });

  it('"Mau berhenti" marks it in place, shows the saving, keeps the sheet open and the focus on the same button', async () => {
    const stop = rowOf('SPOTIFY').querySelector('[data-mark=stop]');
    stop.focus();
    click(stop);
    expect(doc.querySelector('#modal .sheet')).not.toBeNull(); // still open
    const after = rowOf('SPOTIFY').querySelector('[data-action=submark]:nth-of-type(2)');
    expect(rowOf('SPOTIFY').querySelector('[aria-pressed=true]').dataset.mark).toBe('');
    expect(rowOf('SPOTIFY').querySelector('[aria-pressed=true]').textContent).toMatch(/berhenti/i);
    expect(after).not.toBeNull();
    expect(doc.querySelector('#modal .lead').textContent).toContain('Hemat Rp40.000'); // what stopping it saves a month
    expect(doc.activeElement.dataset.action).toBe('submark'); // the finger's place
    expect(rowOf('NETFLIX').querySelector('[aria-pressed=true]')).toBeNull(); // the other one is untouched
    await until(() => JSON.parse(store.cfg.recurring_marks || '{}').spotify === 'stop', 'the mark saved');
  });

  it('tapping the same mark again takes it off, and it is saved', async () => {
    click(rowOf('SPOTIFY').querySelector('[aria-pressed=true]'));
    expect(rowOf('SPOTIFY').querySelector('[aria-pressed=true]')).toBeNull();
    expect(doc.querySelector('#modal .lead').textContent).not.toContain('Hemat');
    await until(() => !JSON.parse(store.cfg.recurring_marks || '{}').spotify, 'the mark taken off');
  });

  it('"Masih dipakai" works the same way', async () => {
    click(rowOf('NETFLIX').querySelector('[data-mark=keep]'));
    expect(rowOf('NETFLIX').querySelector('[aria-pressed=true]').textContent).toMatch(/dipakai/i);
    await until(() => JSON.parse(store.cfg.recurring_marks || '{}').netflix === 'keep', 'keep saved');
  });
});
