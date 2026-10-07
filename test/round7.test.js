// Round 7: salary (no email reports it), payday periods, subscriptions, budget suggestions.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { missingSalaries, paydayPeriod, currentPaydayMonth, salaryCategory } from '../src/core/salary.js';
import { suggestBudgets, summarizeMonth, filterTransactions } from '../src/core/app.js';
import { recurringCharges } from '../src/core/recurring.js';
import { validateSeed } from '../src/core/seed.js';
import { TABS } from '../src/core/schema.js';

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-09-10', direction: 'out', amount: 300000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG' },
      { id: 'b', date: '2026-09-29', direction: 'out', amount: 57000, stream: 'BCA', category: 'Iuran & Kas', status: 'approved', description: 'AFIFAH KHOERIAH' },
      { id: 'c', date: '2026-10-02', direction: 'out', amount: 120000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'BAKSO' },
      { id: 'd', date: '2026-09-15', direction: 'out', amount: 54990, stream: 'BCA', category: 'Langganan', status: 'approved', description: 'SPOTIFY' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 11000000 },
      { stream: 'Cash', type: 'Spending', owner: 'Me', opening_balance: 0 },
    ],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, salary_stream: 'BCA', ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji', 'Lainnya'], expense: ['Makan', 'Iuran & Kas', 'Langganan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, list) => list.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct7 = () => new Date(2026, 9, 7, 10, 0);

describe('salary that no email reports', () => {
  it('asks for every payday since the start date without a salary', () => {
    const base = { start: '2026-09-01', payday: 28, category: 'Gaji' };
    expect(missingSalaries([], { ...base, today: new Date(2026, 8, 27) })).toEqual([]); // before the first payday
    expect(missingSalaries([], { ...base, today: new Date(2026, 9, 7) })).toEqual([{ month: '2026-09', date: '2026-09-28', amount: 0 }]);
    expect(missingSalaries([], { ...base, today: new Date(2026, 9, 28), expected: 9000000 }).map((s) => s.month)).toEqual(['2026-09', '2026-10']);
    // A salary a few days early counts; so does a skipped month; an ignored row doesn't.
    const early = [{ direction: 'in', category: 'Gaji', date: '2026-09-25', amount: 8500000, status: 'approved' }];
    expect(missingSalaries(early, { ...base, today: new Date(2026, 9, 28) })).toEqual([{ month: '2026-10', date: '2026-10-28', amount: 8500000 }]);
    expect(missingSalaries(early, { ...base, today: new Date(2026, 9, 28), skipped: ['2026-10'] })).toEqual([]);
    expect(missingSalaries([{ ...early[0], status: 'ignored' }], { ...base, today: new Date(2026, 9, 7) })).toHaveLength(1);
    // February has no 30th: payday falls on its last day.
    expect(missingSalaries([], { ...base, payday: 30, start: '2027-02-01', today: new Date(2027, 1, 28) })).toEqual([{ month: '2027-02', date: '2027-02-28', amount: 0 }]);
  });

  it('the salary category is "Gaji" whatever its case', () => {
    expect(salaryCategory(['Proyek', 'gaji'])).toBe('gaji');
    expect(salaryCategory(['Gaji Bulanan', 'Lainnya'])).toBe('Gaji Bulanan');
    expect(salaryCategory(['Lainnya'])).toBe('Lainnya');
  });

  it('recording a salary from before the first balance check keeps today\'s balance', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct7 });
    // The first BCA check (6 Oct) became the opening balance: it already holds the September salary.
    api.balanceCheck({ stream: 'BCA', actual: 10523010, date: '2026-10-06', asOpening: true });
    expect(JSON.parse(store.cfg.opening_checks)).toEqual({ BCA: '2026-10-06' });
    const before = api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance;
    expect(api.review().salary).toEqual([{ month: '2026-09', date: '2026-09-28', amount: 0, stream: 'BCA' }]);
    const r = api.recordSalary({ month: '2026-09', amount: 9000000, stream: 'BCA', date: '2026-09-28' });
    expect(r.openingChange).toBe(-9000000);
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ category: 'Gaji', direction: 'in', amount: 9000000, ref_no: 'salary:2026-09', status: 'approved' });
    expect(api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance).toBe(before);
    expect(api.review().salary).toEqual([]);
    expect(store.cfg.salary_amount).toBe(9000000);
    expect(() => api.recordSalary({ month: '2026-09', amount: 1, stream: 'BCA', date: '2026-09-28' })).toThrow(/already recorded/);
  });

  it('a salary after the check (or without one) simply adds to the balance', () => {
    const store = memoryStore({ opening_checks: '{"BCA":"2026-10-06"}' });
    const api = createApi(store, { now: () => new Date(2026, 9, 28, 9) });
    const before = api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance;
    api.recordSalary({ month: '2026-09', amount: 9000000, stream: 'BCA', date: '2026-09-28' });
    expect(api.review().salary).toEqual([{ month: '2026-10', date: '2026-10-28', amount: 9000000, stream: 'BCA' }]); // suggested: the last one
    expect(api.recordSalary({ month: '2026-10', amount: 9000000, stream: 'BCA', date: '2026-10-28' }).openingChange).toBe(0);
    expect(api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance).toBe(before + 9000000);
  });

  it('"no salary this month" removes the card, and can be undone', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct7 });
    api.skipSalary({ month: '2026-09' });
    expect(api.review().salary).toEqual([]);
    api.unskipSalary({ month: '2026-09' });
    expect(api.review().salary).toHaveLength(1);
    expect(() => api.recordSalary({ month: '2026-09', amount: 0, stream: 'BCA', date: '2026-09-28' })).toThrow(/more than 0/);
    expect(() => api.recordSalary({ month: '2026-09', amount: 5, stream: 'Nope', date: '2026-09-28' })).toThrow(/choose an account/);
  });
});

describe('summary from payday to payday', () => {
  it('"October" is 28 Sep to 27 Oct, and the current one follows payday', () => {
    expect(paydayPeriod('2026-10', 28)).toEqual({ from: '2026-09-28', to: '2026-10-27' });
    expect(paydayPeriod('2027-03', 30)).toEqual({ from: '2027-02-28', to: '2027-03-29' });
    expect(currentPaydayMonth(new Date(2026, 9, 7), 28)).toBe('2026-10');
    expect(currentPaydayMonth(new Date(2026, 9, 28), 28)).toBe('2026-11');
    expect(currentPaydayMonth(new Date(2026, 11, 30), 28)).toBe('2027-01');
  });

  it('the dashboard counts the period, and the list filters the same dates', () => {
    const store = memoryStore({ summary_period: 'payday' });
    const api = createApi(store, { now: oct7 });
    api.recordSalary({ month: '2026-09', amount: 9000000, stream: 'BCA', date: '2026-09-28' });
    const d = api.dashboard({});
    expect(d.month).toBe('2026-10');
    expect(d.summary).toMatchObject({ from: '2026-09-28', to: '2026-10-27', income: 9000000, expense: 57000 + 120000 });
    expect(api.bootstrap()).toMatchObject({ currentMonth: '2026-10', summaryPeriod: 'payday' });
    expect(filterTransactions(store.read(TABS.transactions), { from: d.summary.from, to: d.summary.to }).total).toBe(3);
    // Calendar months are unchanged when the setting is off.
    store.cfg.summary_period = 'month';
    expect(api.dashboard({}).summary).toMatchObject({ income: 0, expense: 120000 });
    expect(api.dashboard({}).summary.from).toBeUndefined();
    expect(() => api.saveConfig({ summary_period: 'payday', salary_stream: 'Nope' })).toThrow(/unknown account/);
  });
});

describe('subscriptions', () => {
  it('one transfer for dues is not a monthly bill; a real subscription still is', () => {
    const store = memoryStore();
    const r = recurringCharges(store.read(TABS.transactions), { today: oct7() });
    expect(r.items.map((i) => i.name)).toEqual(['SPOTIFY']);
  });

  it('"not a subscription" hides a payee until undone', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct7 });
    expect(api.dashboard({}).recurring.items.map((i) => i.name)).toEqual(['SPOTIFY']);
    api.hideRecurring({ name: 'SPOTIFY' });
    expect(api.dashboard({}).recurring.items).toEqual([]);
    expect(api.weekly().upcoming).toEqual([]);
    api.unhideRecurring({ name: 'Spotify' });
    expect(api.dashboard({}).recurring.items).toHaveLength(1);
  });
});

describe('budget suggestions', () => {
  it('average of the complete months since the start, rounded up to Rp50.000', () => {
    const store = memoryStore();
    const cats = { income: ['Gaji'], expense: ['Makan', 'Iuran & Kas', 'Langganan'] };
    const s = suggestBudgets(store.read(TABS.transactions), cats, { start: '2026-09-01', today: oct7() });
    expect(s).toEqual([
      { category: 'Makan', amount: 300000, months: 1 },
      { category: 'Iuran & Kas', amount: 100000, months: 1 },
      { category: 'Langganan', amount: 100000, months: 1 },
    ]);
    expect(suggestBudgets(store.read(TABS.transactions), cats, { start: '2026-10-01', today: oct7() })).toEqual([]); // no complete month yet
    expect(createApi(store, { now: oct7 }).settings().budgetSuggestions).toHaveLength(3);
    expect(summarizeMonth(store.read(TABS.transactions), cats, '2026-09').expense).toBe(300000 + 57000 + 54990);
  });
});

describe('seed config', () => {
  const seed = {
    year: 2026, start_date: '2026-09-01', payday_day: 28, owner_name: 'Me',
    categories: { income: ['Gaji'], expense: ['Biaya Admin', 'Dividen & Bunga'] }, accounts: [{ stream: 'BCA', type: 'Spending' }],
  };
  it('only Config keys', () => {
    expect(() => validateSeed({ ...seed, config: { salary_stream: 'BCA', summary_period: 'payday' } })).not.toThrow();
    expect(() => validateSeed({ ...seed, config: { salary: 'BCA' } })).toThrow(/config.salary is not a Config key/);
  });
});
