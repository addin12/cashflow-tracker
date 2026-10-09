// Round 9: every balance on one check (with the difference as real income/spending), big
// spending in the bell and the weekly email, the weekly self-test alert, the newest email rows.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { bigSpends, newestFromEmail } from '../src/core/app.js';
import { weeklySummary, summaryEmail } from '../src/core/summary.js';
import { alertEmail } from '../src/core/notices.js';
import { TABS } from '../src/core/schema.js';

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-10-02', time: '10:00:00', direction: 'out', amount: 4200000, stream: 'blu', category: 'Hobi', status: 'approved', description: 'Toko Dadu', gmail_id: 'g1', source: 'email' },
      { id: 'a_fee', date: '2026-10-02', time: '10:00:00', direction: 'out', amount: 1000, stream: 'blu', category: 'Biaya Admin', status: 'approved', description: 'Biaya', gmail_id: 'g1', source: 'email' },
      { id: 'b', date: '2026-10-05', time: '09:00:00', direction: 'out', amount: 21500, stream: 'BCA', category: 'Makan', status: 'approved', description: 'CIRCLEKA', gmail_id: 'g2', source: 'email' },
      { id: 'c', date: '2026-10-06', time: '', direction: 'out', amount: 5000000, stream: 'BCA', category: 'Transfer ke Bank Lain', status: 'approved', description: 'Ke Jago', gmail_id: 'g3', source: 'email' },
      { id: 'd', date: '2026-10-06', time: '', direction: 'out', amount: 1500000, stream: 'BCA', category: 'Hobi', status: 'ignored', description: 'Dobel', gmail_id: 'g4', source: 'email' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 10000000 },
      { stream: 'blu', type: 'Spending', owner: 'Me', opening_balance: 5000000 },
      { stream: 'Jago', type: 'Saving', owner: 'Me', opening_balance: 0 },
    ],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, cat_transfer: 'Transfer ke Bank Lain', opening_checks: '{"BCA":"2026-10-06"}', ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji', 'Pemasukan Lainnya'], expense: ['Makan', 'Hobi', 'Biaya Admin'] }, ['Penyesuaian', 'Transfer ke Bank Lain']);
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {},
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct9 = () => new Date(2026, 9, 9, 16, 0);

describe('every balance on one check', () => {
  it('only the filled accounts; the difference can be real income or spending', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const bal = Object.fromEntries(api.settings().balances.map((b) => [b.stream, b.balance]));
    expect(bal).toEqual({ BCA: 10000000 - 21500 - 5000000, blu: 5000000 - 4200000 - 1000, Jago: 0 });
    const r = api.balanceCheckAll({ date: '2026-10-09', items: [
      { stream: 'BCA', actual: bal.BCA + 750000, category: 'Pemasukan Lainnya' }, // money in that BCA never emailed
      { stream: 'blu', actual: bal.blu - 20000 }, // no category: Penyesuaian
      { stream: 'Jago', actual: 3000000, asOpening: true },
      { stream: 'BCA', actual: '' }, // empty: skipped
    ] });
    expect(r.results).toEqual([
      { ok: true, stream: 'BCA', category: 'Pemasukan Lainnya', adjusted: 750000 },
      { ok: true, stream: 'blu', category: 'Penyesuaian', adjusted: -20000 },
      { ok: true, stream: 'Jago', adjusted: 0, opening: 3000000, openingChange: 3000000 },
    ]);
    const added = store.t[TABS.transactions].slice(-2);
    expect(added[0]).toMatchObject({ stream: 'BCA', direction: 'in', amount: 750000, category: 'Pemasukan Lainnya', description: 'Cek saldo BCA' });
    expect(added[1]).toMatchObject({ stream: 'blu', direction: 'out', amount: 20000, category: 'Penyesuaian' });
    // The money in now counts as income; the adjustment doesn't count as spending.
    expect(api.dashboard({ month: '2026-10' }).summary).toMatchObject({ income: 750000, expense: 4200000 + 1000 + 21500 });
    expect(api.settings().lastChecks).toEqual({ BCA: '2026-10-09', blu: '2026-10-09', Jago: '2026-10-09' });
  });

  it('a wrong category stops the whole check before anything is saved', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const before = store.t[TABS.transactions].length;
    expect(() => api.balanceCheckAll({ date: '2026-10-09', items: [
      { stream: 'blu', actual: 1 }, { stream: 'BCA', actual: 99999999, category: 'Hobi' },
    ] })).toThrow(/BCA: "Hobi" is not an income category/);
    expect(store.t[TABS.transactions]).toHaveLength(before);
    expect(store.cfg.balance_checks).toBeUndefined();
    expect(() => api.balanceCheckAll({ date: '2026-10-09', items: [{ stream: 'BCA', actual: '' }] })).toThrow(/at least one balance/);
    expect(() => api.balanceCheckAll({ date: '2026-10-09', items: [{ stream: 'Nope', actual: 5 }] })).toThrow(/unknown account Nope/);
  });

  it('a check that matches still counts as checked', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const bca = api.settings().balances.find((b) => b.stream === 'BCA').balance;
    expect(api.balanceCheckAll({ date: '2026-10-09', items: [{ stream: 'BCA', actual: bca }] }).results[0]).toMatchObject({ adjusted: 0, category: '' });
    expect(api.settings().lastChecks.BCA).toBe('2026-10-09');
  });
});

describe('big spending', () => {
  it('from Rp1.000.000 up by default; transfers, ignored rows and small ones are left out', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    expect(api.dashboard({ month: '2026-10' }).big.map((b) => b.description)).toEqual(['Toko Dadu']);
    store.cfg.big_amount = 20000;
    expect(api.dashboard({ month: '2026-10' }).big.map((b) => b.description)).toEqual(['Toko Dadu', 'CIRCLEKA']);
    store.cfg.big_amount = 0;
    expect(api.dashboard({ month: '2026-10' }).big).toEqual([]);
    expect(() => api.saveConfig({ big_amount: -5 })).toThrow(/number/);
  });

  it('the weekly email lists them on their own', () => {
    const store = memoryStore();
    const w = weeklySummary({ rows: store.read(TABS.transactions), cats: { income: [], expense: ['Makan', 'Hobi', 'Biaya Admin'] }, budgets: [], recurring: { items: [] }, today: new Date(2026, 9, 7), bigAmount: 1000000 });
    expect(w.big.map((b) => b.description)).toEqual(['Toko Dadu']);
    expect(w.biggest.map((b) => b.description)).toEqual(['CIRCLEKA', 'Biaya']);
    expect(summaryEmail(w, { lang: 'id' }).html).toContain('Pengeluaran besar (Rp1.000.000 ke atas)');
    expect(bigSpends([], { from: '2026-10-01', to: '2026-10-31', threshold: 0 })).toEqual([]);
  });
});

describe('weekly self-test alert', () => {
  it('says how many report cells were wrong, with examples', () => {
    const mail = alertEmail({ selftest: { ok: false, checks: 11829, failures: ['CASHFLOW L12: expected 5, got 6', 'BUDGET C4: #REF!'] } }, { lang: 'id' });
    expect(mail.subject).toBe('Cashflow: uji otomatis menemukan masalah');
    expect(mail.html).toContain('11829 sel laporan');
    expect(mail.html).toContain('CASHFLOW L12: expected 5, got 6');
  });
});

describe('the newest rows from email', () => {
  it('newest first, without bank fees and ignored rows; part of the first-screen data', () => {
    const store = memoryStore();
    expect(newestFromEmail(store.read(TABS.transactions)).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(createApi(store, { now: oct9 }).init().incoming[0]).toEqual({ id: 'c', description: 'Ke Jago', amount: 5000000, direction: 'out' });
  });
});
