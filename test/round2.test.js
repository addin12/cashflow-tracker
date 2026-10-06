// Category changes (setup v5), the dashboard trend, filtering by direction, and what approve
// returns so the web app can update its screen without asking again.
import { describe, expect, it } from 'vitest';
import { createApi, changeCategorySlots } from '../src/core/api.js';
import { buildCategorySlots, slotsAfterChanges } from '../src/core/categories.js';
import { filterTransactions, renamedCategories } from '../src/core/app.js';
import { validateSeed } from '../src/core/seed.js';
import { TABS } from '../src/core/schema.js';

function memoryStore(rows = []) {
  const t = {
    [TABS.transactions]: rows,
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.rules]: [{ id: 'r1', pattern: 'KOPI', category: 'fnb', auto_approve: true }],
    [TABS.budgets]: [{ category: 'fnb', monthly_budget: 100000 }],
    [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, cat_fee: 'Biaya Admin' };
  let slots = buildCategorySlots({ income: ['Gaji'], expense: ['fnb', 'Biaya Admin'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r); },
    update: (tab, updates) => updates.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove() {}, replace: (tab, r) => { t[tab] = r; },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; },
    slots: () => ({ income: [...slots.income], expense: [...slots.expense] }), setSlots: (s) => { slots = s; },
  };
}
const tx = (id, extra) => ({ id, date: '2026-10-02', time: '10:00:00', stream: 'BCA', direction: 'out', amount: 10000, category: 'fnb', description: 'KOPI', status: 'approved', ...extra });

describe('category changes (setup v5)', () => {
  const change = [{ since: 5, rename: { fnb: 'Food & Beverages' }, add: { expense: ['Barber'] } }];

  it('renames in place and adds into the first free slot', () => {
    const before = buildCategorySlots({ income: ['Gaji'], expense: ['fnb', 'Biaya Admin'] });
    const next = slotsAfterChanges(before, change);
    expect(next.expense.slice(0, 3)).toEqual(['Food & Beverages', 'Biaya Admin', 'Barber']);
    expect(next.expense).toHaveLength(before.expense.length);
    expect(slotsAfterChanges(next, change)).toEqual(next); // running it again changes nothing
  });

  it('carries the rename into transactions, rules, budgets but leaves the new category alone', () => {
    const store = memoryStore([tx('a'), tx('b', { category: 'Biaya Admin' })]);
    const renamed = changeCategorySlots(store, slotsAfterChanges(store.slots(), change));
    expect(renamed).toEqual({ fnb: 'Food & Beverages' });
    expect(store.t[TABS.transactions].map((r) => r.category)).toEqual(['Food & Beverages', 'Biaya Admin']);
    expect(store.t[TABS.rules][0].category).toBe('Food & Beverages');
    expect(store.t[TABS.budgets][0].category).toBe('Food & Beverages');
    expect(store.cfg.cat_fee).toBe('Biaya Admin');
  });

  it('a renamed default category follows in the settings', () => {
    const store = memoryStore();
    changeCategorySlots(store, slotsAfterChanges(store.slots(), [{ since: 5, rename: { 'Biaya Admin': 'Bank fees' } }]));
    expect(store.cfg.cat_fee).toBe('Bank fees');
  });

  it('the seed checks that changes name real categories', () => {
    const seed = {
      year: 2026, start_date: '2026-09-01', payday_day: 28, owner_name: 'Me',
      categories: { income: ['Gaji'], expense: ['Food & Beverages', 'Barber', 'Biaya Admin', 'Dividen & Bunga'] },
      accounts: [{ stream: 'BCA', type: 'Spending' }], category_changes: change,
    };
    expect(() => validateSeed(seed)).not.toThrow();
    expect(() => validateSeed({ ...seed, category_changes: [{ since: 5, add: { expense: ['Nope'] } }] })).toThrow(/"Nope" is not a category/);
  });
});

describe('renames', () => {
  const was = buildCategorySlots({ income: ['Gaji'], expense: ['fnb', 'skincare', 'Tagihan', 'Pulsa', 'Biaya Admin', 'Lainnya'] });

  it('inserting a category in the middle renames nothing below it (the 2026-10-06 bug)', () => {
    const next = buildCategorySlots({ income: ['Gaji'], expense: ['Food & Beverages', 'Skincare', 'Barber', 'Tagihan', 'Pulsa', 'Biaya Admin', 'Lainnya'] });
    expect(renamedCategories(was, next)).toEqual({ fnb: 'Food & Beverages', skincare: 'Skincare' });
  });

  it('moving and removing lines are not renames either', () => {
    const next = buildCategorySlots({ income: ['Gaji'], expense: ['Lainnya', 'fnb', 'skincare', 'Tagihan', 'Pulsa'] });
    expect(renamedCategories(was, next)).toEqual({});
  });

  it('an inserted category no longer drags transactions along when saved', () => {
    const store = memoryStore([tx('a', { category: 'Biaya Admin' })]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    expect(api.saveCategories({ income: ['Gaji'], expense: ['fnb', 'Barber', 'Biaya Admin'] }).renamed).toEqual({});
    expect(store.t[TABS.transactions][0].category).toBe('Biaya Admin');
  });

  it('data fixes in the seed must be well formed', () => {
    const seed = {
      year: 2026, start_date: '2026-09-01', payday_day: 28, owner_name: 'Me',
      categories: { income: ['Gaji'], expense: ['Biaya Admin', 'Barber', 'Dividen & Bunga'] }, accounts: [{ stream: 'BCA', type: 'Spending' }],
    };
    expect(() => validateSeed({ ...seed, data_fixes: [{ since: 6, transactions: [['t1', 'Pendidikan', 'Biaya Admin']], rules: [{ pattern: 'X', from: 'Barber', to: 'Biaya Admin' }] }] })).not.toThrow();
    expect(() => validateSeed({ ...seed, data_fixes: [{ since: 6, transactions: [['t1', 'Biaya Admin']] }] })).toThrow(/must be \[id, from, to\]/);
    expect(() => validateSeed({ ...seed, data_fixes: [{ since: 6, rules: [{ pattern: 'X', from: 'a', to: 'Nope' }] }] })).toThrow(/"Nope" is not a category/);
  });
});

describe('web app data', () => {
  it('filters by money in or out', () => {
    const rows = [tx('a'), tx('b', { direction: 'in', category: 'Gaji' })];
    expect(filterTransactions(rows, { direction: 'in' }).rows.map((r) => r.id)).toEqual(['b']);
    expect(filterTransactions(rows, {}).total).toBe(2);
  });

  it('the dashboard has a trend from the start month up to the shown month', () => {
    const store = memoryStore([tx('a', { date: '2026-09-05', amount: 5000 }), tx('b'), tx('c', { direction: 'in', category: 'Gaji', amount: 70000 })]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    const d = api.dashboard({ month: '2026-10' });
    expect(d.trend).toEqual([{ month: '2026-09', income: 0, expense: 5000 }, { month: '2026-10', income: 70000, expense: 10000 }]);
    expect(api.bootstrap().start).toBe('2026-09-01');
  });

  it('approve with "always" says which other rows it filed', () => {
    const store = memoryStore([tx('a', { status: 'pending', category: '', description: 'WARUNG X' }), tx('b', { status: 'pending', category: '', description: 'WARUNG X' })]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    expect(api.approve({ id: 'a', category: 'fnb', always: true })).toEqual({ ok: true, alsoApproved: 1, alsoIds: ['b'] });
  });
});
