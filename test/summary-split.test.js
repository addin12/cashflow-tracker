// A wallet's monthly total waiting in "Perlu dicek" can be split by category right from its card; accounts show whose they are and can be deleted in Settings.
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

describe('whose account it is', () => {
  it('with two people, the name of an account shows its owner on the cards, unless the name already says it', () => {
    expect(doc.querySelector('.txcard[data-id="t1"] .meta').textContent).toContain('BCA · Me');
  });
});

describe('accounts in Settings', () => {
  const legends = () => [...doc.querySelectorAll('form[data-form=accounts] legend')].map((l) => l.textContent);
  const goAccounts = async () => {
    click(doc.querySelector('.nav [data-tab=settings]'));
    await until(() => doc.querySelector('[data-action=setsection][data-section=accounts]'), 'settings list');
    click(doc.querySelector('[data-action=setsection][data-section=accounts]'));
    await until(() => doc.querySelector('form[data-form=accounts]'), 'accounts form');
  };
  const rowOf = (name) => [...doc.querySelectorAll('form[data-form=accounts] .acct')].find((r) => r.querySelector('[data-a=stream]').value === name);
  const save = () => doc.querySelector('form[data-form=accounts]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  it('each account is titled with its owner, except one whose name already has it', async () => {
    await goAccounts();
    expect(legends()).toEqual(expect.arrayContaining(['BCA · Me', 'GoPay · Me', 'Cash · Me', 'OVO · Dewi', 'BCA Dewi']));
    expect([...doc.querySelectorAll('select[data-a=owner]')].length).toBeGreaterThan(0);
  });
  it('the delete button takes an account off the list, and it is gone once the list is saved', async () => {
    click(rowOf('Cash').querySelector('[data-action=delacct]'));
    expect(rowOf('Cash')).toBeUndefined();
    expect(store.t[TABS.accounts].some((a) => a.stream === 'Cash')).toBe(true); // not yet: saving does it
    save();
    await until(() => !store.t[TABS.accounts].some((a) => a.stream === 'Cash'), 'cash account deleted');
    expect(store.t[TABS.accounts].map((a) => a.stream)).toEqual(['BCA', 'GoPay', 'OVO', 'BCA Dewi']);
  });
  it('an account that has transactions is not deleted: the list is refused and says why', async () => {
    await goAccounts();
    click(rowOf('BCA').querySelector('[data-action=delacct]'));
    save();
    await until(() => /can't be removed/.test(doc.querySelector('form[data-form=accounts] .state').textContent + doc.body.textContent), 'refusal');
    expect(store.t[TABS.accounts].some((a) => a.stream === 'BCA')).toBe(true);
  });
});

describe('budgets in Settings', () => {
  const goBudgets = async () => {
    click(doc.querySelector('.nav [data-tab=settings]'));
    await until(() => doc.querySelector('[data-action=setsection][data-section=budgets]'), 'settings list');
    click(doc.querySelector('[data-action=setsection][data-section=budgets]'));
    await until(() => doc.querySelector('form[data-form=budgets]'), 'budgets form');
  };
  const input = (cat) => doc.querySelector(`form[data-form=budgets] [data-b="${cat}"]`);
  const pick = (scope) => click(doc.querySelector(`[data-action=budgetscope][data-scope="${scope}"]`));
  it('offers Kita and each person, starting on Kita', async () => {
    await goBudgets();
    const buttons = [...doc.querySelectorAll('[data-action=budgetscope]')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Kita', 'Me', 'Dewi']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });
  it('each view has its own amounts; what was typed stays when you switch; one save keeps them all', async () => {
    input('fnb').value = '1000000';
    pick('Dewi');
    expect(input('fnb').value).toBe(''); // Dewi has none yet
    input('fnb').value = '50000';
    input('Transport').value = '20000';
    pick('');
    expect(input('fnb').value).toBe('1000000');
    expect(input('Transport').value).toBe('');
    doc.querySelector('form[data-form=budgets]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.t[TABS.budgets].length === 3, 'budgets saved');
    expect(store.t[TABS.budgets]).toEqual(expect.arrayContaining([
      { category: 'fnb', monthly_budget: 1000000, scope: '' },
      { category: 'fnb', monthly_budget: 50000, scope: 'Dewi' },
      { category: 'Transport', monthly_budget: 20000, scope: 'Dewi' },
    ]));
  });
});
