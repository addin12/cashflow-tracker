// Round 6: opening balances from the first balance check, savings goals.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { goalProgress, goalProblems } from '../src/core/goals.js';
import { validateSeed } from '../src/core/seed.js';
import { monthlyEmail } from '../src/core/notices.js';
import { TABS } from '../src/core/schema.js';

function memoryStore() {
  const t = {
    [TABS.transactions]: [{ id: 'a', date: '2026-09-10', direction: 'out', amount: 300000, stream: 'BCA', category: 'Makan', status: 'approved' }],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 },
      { stream: 'Dana Darurat', type: 'Saving', owner: 'Me', opening_balance: 60000000 },
    ],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28 };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r); }, update() {}, remove() {},
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {},
  };
}

describe('first balance check as the opening balance', () => {
  it('sets the opening balance so today\'s balance is the real one, without an adjustment row', () => {
    const store = memoryStore();
    const api = createApi(store, { now: () => new Date(2026, 9, 7) });
    // App: 0 - 300.000 = -300.000; the bank says 5.000.000 -> opening 5.300.000
    expect(api.balanceCheck({ stream: 'BCA', actual: 5000000, date: '2026-10-07', asOpening: true })).toMatchObject({ opening: 5300000, adjusted: 0 });
    expect(store.t[TABS.accounts][0].opening_balance).toBe(5300000);
    expect(store.t[TABS.transactions]).toHaveLength(1);
    expect(api.dashboard({}).balances[0].balance).toBe(5000000);
  });

  it('without the option the difference is still a Penyesuaian row', () => {
    const store = memoryStore();
    const api = createApi(store, { now: () => new Date(2026, 9, 7) });
    expect(api.balanceCheck({ stream: 'BCA', actual: 5000000, date: '2026-10-07' }).adjusted).toBe(5300000);
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ category: 'Penyesuaian', amount: 5300000 });
  });

  it('a repair that moves adjustments into opening balances must be well formed', () => {
    const seed = {
      year: 2026, start_date: '2026-09-01', payday_day: 28, owner_name: 'Me',
      categories: { income: ['Gaji'], expense: ['Biaya Admin', 'Dividen & Bunga'] }, accounts: [{ stream: 'BCA', type: 'Spending' }],
    };
    expect(() => validateSeed({ ...seed, data_fixes: [{ since: 11, move_to_opening: [['m1', 'BCA', 11037024.6]] }] })).not.toThrow();
    expect(() => validateSeed({ ...seed, data_fixes: [{ since: 11, move_to_opening: [['m1', 'BCA']] }] })).toThrow(/must be \[id, stream, amount\]/);
  });
});

describe('savings goals', () => {
  const balances = [{ stream: 'Dana Darurat', balance: 60365788 }, { stream: 'BCA', balance: -5 }];
  const today = new Date(2026, 9, 7);

  it('shows saved, left, percent and what to put aside each month until the date', () => {
    const [g] = goalProgress([{ stream: 'Dana Darurat', name: 'Dana Darurat', target: 100000000, target_date: '2027-12-31' }], balances, today);
    // Oct 2026 .. Dec 2027 = 15 months
    expect(g).toMatchObject({ saved: 60365788, left: 39634212, percent: 60, monthsLeft: 15, perMonth: 2642281, done: false });
  });

  it('a reached goal, a goal without a date, and a date already past', () => {
    const r = goalProgress([
      { stream: 'Dana Darurat', name: 'Done', target: 50000000 },
      { stream: 'BCA', name: 'No date', target: 1000000 },
      { stream: 'BCA', name: 'Late', target: 1000000, target_date: '2026-09-30' },
    ], balances, today);
    expect(r[0]).toMatchObject({ done: true, percent: 100, left: 0 });
    expect(r[1]).toMatchObject({ saved: 0, monthsLeft: 0, perMonth: 0 }); // a negative balance counts as nothing saved
    expect(r[2]).toMatchObject({ monthsLeft: 0, done: false });
  });

  it('saving checks the account and the target; the dashboard and monthly report carry the goals', () => {
    const store = memoryStore();
    const api = createApi(store, { now: () => new Date(2026, 9, 7) });
    expect(goalProblems([{ stream: 'Nope', target: 0 }], store.t[TABS.accounts])).toEqual(['goal 1: choose an account', 'goal 1: the target must be above 0']);
    expect(() => api.saveGoals({ goals: [{ stream: 'Nope', target: 5 }] })).toThrow(/choose an account/);
    api.saveGoals({ goals: [{ stream: 'Dana Darurat', name: 'Dana Darurat', target: 100000000, target_date: '2027-12-31' }] });
    expect(api.dashboard({}).goals[0]).toMatchObject({ name: 'Dana Darurat', saved: 60000000, percent: 60 });
    const report = api.monthly({ month: '2026-09' });
    expect(report.goals).toHaveLength(1);
    expect(monthlyEmail(report, { lang: 'id' }).html).toContain('Target tabungan');
  });
});
