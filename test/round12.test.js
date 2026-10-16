// Round 12: typing a transaction as a sentence, sums in amounts, Tagih, spending patterns, tags,
// subscriptions keep/stop, planned recurring transactions, assets / net worth / collectibles.
import { describe, expect, it } from 'vitest';
import { parseQuick, evalAmount, amountOf } from '../src/core/quick.js';
import { netWorth, assetProblems, duePlans, planDate } from '../src/core/wealth.js';
import { spendingPattern, tagTotals } from '../src/core/insights.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const accounts = [{ stream: 'BCA', institution: 'BCA' }, { stream: 'GoPay' }, { stream: 'Cash' }, { stream: 'Jago Dana Darurat', institution: 'Jago' }];
const rules = [{ pattern: 'KOPI|COFFEE', category: 'Food & Beverages' }, { pattern: 'PARKIR', category: 'Transportasi' }];

describe('typing a transaction', () => {
  it('a sentence gives the amount, account, money in or out, category, date and tags', () => {
    const q = (t) => parseQuick(t, { accounts, rules, today: '2026-10-16', salaryCategory: 'Gaji' });
    expect(q('kopi 28rb gopay')).toEqual({ amount: 28000, direction: 'out', stream: 'GoPay', description: 'kopi', category: 'Food & Beverages', date: '2026-10-16', tags: [] });
    expect(q('gaji 8,5jt di BCA')).toMatchObject({ amount: 8500000, direction: 'in', stream: 'BCA', category: 'Gaji' });
    expect(q('parkir 5k kemarin #trip')).toMatchObject({ amount: 5000, stream: '', category: 'Transportasi', date: '2026-10-15', tags: ['trip'] });
    expect(q('jajan 15.000 tunai')).toMatchObject({ amount: 15000, stream: 'Cash', description: 'jajan', category: '' });
    expect(q('makan 25rb+5rb')).toMatchObject({ amount: 30000 });
    expect(q('nabung 1jt ke Jago Dana Darurat')).toMatchObject({ amount: 1000000, stream: 'Jago Dana Darurat', description: 'nabung' });
    expect(q('kopi').amount).toBeNaN();
  });

  it('amounts: rb/k/jt, both number styles, and small sums', () => {
    expect(['28rb', '8,5jt', '1.250.000', '1,500,000.50', 'Rp 25.000', '2 juta', '12.5'].map(amountOf)).toEqual([28000, 8500000, 1250000, 1500000.5, 25000, 2000000, 12.5]);
    expect(['12000+3500', '3x25rb', '100rb/4', '50.000 - 12.500', '10rb+2x5rb', '5/0', 'abc', ''].map(evalAmount)).toEqual([15500, 75000, 25000, 37500, 20000, NaN, NaN, NaN]);
  });
});

describe('patterns and tags', () => {
  const rows = [
    { date: '2026-10-03', time: '20:15:00', direction: 'out', amount: 100000, category: 'Makan', status: 'approved', description: 'Pizza #trip' }, // Saturday evening
    { date: '2026-10-05', time: '08:00:00', direction: 'out', amount: 20000, category: 'Makan', status: 'approved', description: 'Kopi', details: '#Trip' }, // Monday morning
    { date: '2026-10-05', time: '', direction: 'out', amount: 5000, category: 'Makan', status: 'approved', description: 'Parkir' },
    { date: '2026-10-06', time: '12:00:00', direction: 'in', amount: 50000, category: 'Refund', status: 'approved', description: 'Balik #trip' },
  ];
  const range = { from: '2026-10-01', to: '2026-10-31' };
  it('by weekday (Monday first) and time of day; untimed rows count only for the weekday', () => {
    const p = spendingPattern(rows, { expense: ['Makan'] }, range);
    expect(p.weekdays).toEqual([25000, 0, 0, 0, 0, 100000, 0]);
    expect(p.parts).toEqual({ morning: 20000, noon: 0, afternoon: 0, evening: 100000, night: 0 });
  });
  it('#tags from the name or notes, any case, money out and in', () => {
    expect(tagTotals(rows, range)).toEqual([{ tag: 'trip', out: 120000, in: 50000, count: 3 }]);
  });
});

describe('wealth', () => {
  it('net worth: accounts + assets + collectibles − debts; a market price beats the typed value', () => {
    const w = netWorth([{ balance: 10000000 }, { balance: -500000 }], [
      { name: 'Motor', kind: 'vehicle', qty: 1, unit_value: 15000000 },
      { name: 'BBCA', kind: 'stock', qty: 100, unit_value: 9000, ticker: 'IDX:BBCA', price: 9500 },
      { name: 'Board games', kind: 'collectible', qty: 1, unit_value: 3000000, paid: 2500000 },
      { name: 'Cicilan', kind: 'debt', qty: 1, unit_value: 4000000 },
    ]);
    expect(w).toMatchObject({ accounts: 9500000, owned: 15950000, collectibles: 3000000, debts: 4000000, total: 24450000 });
    expect(w.items.find((a) => a.kind === 'collectible').gain).toBe(500000);
  });
  it('asset checks, and tickers only in the Google Finance form', () => {
    expect(assetProblems([{ name: '', kind: 'car', unit_value: 0, ticker: 'BBCA";=1' }])).toEqual([
      'item 1: name is required', 'item 1: unknown kind car', 'item 1: ticker must look like BBCA or IDX:BBCA', 'item 1: enter a value',
    ]);
    expect(assetProblems([{ name: 'BBCA', kind: 'stock', qty: 100, ticker: 'IDX:BBCA' }])).toEqual([]);
  });
  it('planned transactions: due on their day (last day in short months), once per month', () => {
    expect(planDate('2027-02', 31)).toBe('2027-02-28');
    const plans = [{ id: 'p1', day: 5, active: true }, { id: 'p2', day: 20 }, { id: 'p3', day: 1, active: false }, { id: 'p4', day: 1, last: '2026-10' }];
    expect(duePlans(plans, [], new Date(2026, 9, 16)).map((x) => [x.plan.id, x.date])).toEqual([['p1', '2026-10-05']]);
    expect(duePlans(plans, [{ ref_no: 'plan:p1:2026-10' }], new Date(2026, 9, 16))).toEqual([]);
  });
});

function memoryStore() {
  const t = {
    [TABS.transactions]: [
      { id: 'd', date: '2026-10-10', time: '19:00', direction: 'out', amount: 300000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'Makan bareng' },
      { id: 's', date: '2026-09-15', direction: 'out', amount: 54990, stream: 'BCA', category: 'Langganan', status: 'approved', description: 'SPOTIFY' },
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 1000000 }, { stream: 'Cash', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28 };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan', 'Langganan', 'Kos'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, list) => list.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => String(r.id) === String(id)) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => String(r.id) !== String(id)); },
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct16 = () => new Date(2026, 9, 16, 9, 0);

describe('Tagih', () => {
  it('friends owe their share of a payment; paid back is marked; undo puts it back', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    api.tagih({ txId: 'd', people: [{ who: 'Andi', amount: 100000 }, { who: 'Budi', amount: 100000 }] });
    let o = api.dashboard({}).owed;
    expect(o).toMatchObject({ total: 200000 });
    expect(o.open.map((x) => [x.who, x.payment, x.date])).toEqual([['Andi', 'Makan bareng', '2026-10-10'], ['Budi', 'Makan bareng', '2026-10-10']]);
    api.owedSet({ id: o.open[0].id, status: 'paid' });
    o = api.dashboard({}).owed;
    expect(o.total).toBe(100000);
    expect(o.paid[0]).toMatchObject({ who: 'Andi', paid_at: '2026-10-16' });
    expect(() => api.tagih({ txId: 'd', people: [{ who: '', amount: 5 }] })).toThrow(/name is required/);
    expect(() => api.tagih({ txId: 'zz', people: [{ who: 'A', amount: 5 }] })).toThrow(/not found/);
  });
});

describe('planned transactions', () => {
  it('saved, then added on their day (waiting in Review, or saved when "auto"), never twice', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    api.savePlans({ plans: [
      { name: 'Kos', amount: 1500000, direction: 'out', stream: 'Cash', category: 'Kos', day: 20, auto: true },
      { name: 'Iuran', amount: 50000, direction: 'out', stream: 'Cash', category: '', day: 10 }, // day passed: starts next month
    ] });
    expect(store.t[TABS.plans].map((p) => p.last)).toEqual(['', '2026-10']);
    expect(api.createDuePlanned()).toEqual({ created: 0 });
    const on20 = createApi(store, { now: () => new Date(2026, 9, 20, 7) });
    expect(on20.createDuePlanned()).toEqual({ created: 1 });
    expect(on20.createDuePlanned()).toEqual({ created: 0 });
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ description: 'Kos', amount: 1500000, date: '2026-10-20', category: 'Kos', status: 'approved', ref_no: expect.stringMatching(/^plan:p_.*:2026-10$/) });
    const nov10 = createApi(store, { now: () => new Date(2026, 10, 10, 7) });
    expect(nov10.createDuePlanned()).toEqual({ created: 1 });
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ description: 'Iuran', status: 'pending', category: '' });
    expect(() => api.savePlans({ plans: [{ name: 'X', amount: 5, direction: 'out', stream: 'Cash', category: 'Gaji', day: 3 }] })).toThrow(/doesn't fit/);
  });
});

describe('assets and subscriptions', () => {
  it('a ticker is kept (upper case) for the script to price; net worth shows on the summary', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    api.saveAssets({ assets: [{ name: 'BBCA', kind: 'stock', qty: 100, unit_value: 9000, ticker: 'idx:bbca' }, { name: 'Motor', kind: 'vehicle', unit_value: 15000000 }] });
    expect(store.t[TABS.assets][0]).toMatchObject({ ticker: 'IDX:BBCA', price: '', price_at: '' });
    expect(store.t[TABS.assets][1]).toMatchObject({ qty: 1, price: '' });
    expect(api.dashboard({}).wealth.owned).toBe(15900000);
    // a fetched price stays while the ticker is the same, and goes when it changes
    store.t[TABS.assets][0].price = 9500; store.t[TABS.assets][0].price_at = 1;
    const [bbca, motor] = store.read(TABS.assets);
    api.saveAssets({ assets: [bbca, motor] });
    expect(store.t[TABS.assets][0]).toMatchObject({ price: 9500, price_at: 1 });
    api.saveAssets({ assets: [{ ...bbca, ticker: 'BBRI' }, motor] });
    expect(store.t[TABS.assets][0]).toMatchObject({ price: '', price_at: '' });
    expect(() => api.saveAssets({ assets: [{ name: 'X', kind: 'stock', ticker: 'A:B")&HYPERLINK("x' }] })).toThrow(/ticker/);
  });
  it('keep / stop marks on subscriptions', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    api.markRecurring({ name: 'SPOTIFY', mark: 'stop' });
    expect(api.dashboard({}).recurringMarks).toEqual({ spotify: 'stop' });
    api.markRecurring({ name: 'Spotify', mark: '' });
    expect(api.dashboard({}).recurringMarks).toEqual({});
  });
});
