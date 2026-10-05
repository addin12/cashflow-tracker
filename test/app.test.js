import { describe, expect, it } from 'vitest';
import {
  summarizeMonth, streamBalances, budgetPerDay, reviewItems, manualRows, balanceCorrection, renamedCategories,
  budgetUsage, filterTransactions, ruleFromApproval, pendingMatching, categoryLists,
} from '../src/core/app.js';
import { buildCategorySlots } from '../src/core/categories.js';

const slots = buildCategorySlots({ income: ['gaji', 'Dividen'], expense: ['fnb', 'Belanja Online', 'Biaya Admin'] });
const cats = categoryLists(slots);
const r = (id, date, stream, direction, amount, category, status = 'approved', extra = {}) => ({
  id, date, time: '10:00:00', stream, direction, amount, category, status, owner: 'Me', description: id, details: '', updated_by: 'sync', ...extra,
});
const ROWS = [
  r('a', '2026-09-28', 'BCA', 'in', 8000000, 'gaji'),
  r('b', '2026-10-01', 'BCA', 'out', 50000, 'fnb'),
  r('c', '2026-10-02', 'BCA', 'out', 1000000, 'trf ke bank lain', 'approved', { transfer_id: 'x1' }),
  r('d', '2026-10-02', 'blu', 'in', 1000000, 'trf ke bank lain', 'approved', { transfer_id: 'x1' }),
  r('e', '2026-10-02', 'BCA', 'out', 2500, 'Biaya Admin'),
  r('f', '2026-10-03', 'blu', 'out', 300000, 'Belanja Online', 'approved', { rule_id: 'r2' }),
  r('g', '2026-10-04', 'blu', 'out', 99999, 'fnb', 'pending'),
  r('h', '2026-10-04', 'Saham', 'in', 6600, 'Dividen'),
  r('i', '2026-10-05', 'GoPay', 'out', 15000, 'Penyesuaian'),
];
const ACC = [
  { stream: 'BCA', type: 'Spending', opening_balance: 1000000 },
  { stream: 'blu', type: 'Spending', opening_balance: 0 },
  { stream: 'GoPay', type: 'Spending', opening_balance: 100000 },
  { stream: 'Saham', type: 'Saving', opening_balance: 500000 },
];

describe('dashboard numbers', () => {
  it('month totals leave transfers, adjustments and pending rows out', () => {
    const s = summarizeMonth(ROWS, cats, '2026-10');
    expect([s.income, s.expense, s.balance]).toEqual([6600, 352500, -345900]);
    expect(s.byCategory).toEqual([
      { category: 'Belanja Online', kind: 'expense', amount: 300000 },
      { category: 'fnb', kind: 'expense', amount: 50000 },
      { category: 'Dividen', kind: 'income', amount: 6600 },
      { category: 'Biaya Admin', kind: 'expense', amount: 2500 },
    ]);
    expect(summarizeMonth(ROWS, cats, '2026-09').income).toBe(8000000);
  });

  it('account balances: opening + every approved movement, transfers included', () => {
    const b = streamBalances(ROWS, ACC, { year: 2026, asOf: '2026-10-05' });
    expect(b.map((x) => [x.stream, x.balance])).toEqual([
      ['BCA', 1000000 + 8000000 - 50000 - 1000000 - 2500], ['blu', 1000000 - 300000], ['GoPay', 85000], ['Saham', 506600],
    ]);
    expect(streamBalances(ROWS, ACC, { year: 2026, asOf: '2026-09-30' })[0].balance).toBe(9000000);
  });

  it('budget per day uses spending accounts and the days to payday', () => {
    const b = streamBalances(ROWS, ACC, { year: 2026, asOf: '2026-10-05' });
    const p = budgetPerDay(b, new Date(2026, 9, 5), 28);
    expect(p).toEqual({ spending: 7947500 + 700000 + 85000, daysLeft: 23, nextPayday: '2026-10-28', perDay: Math.floor(8732500 / 23) });
  });

  it('budget usage, most-used first', () => {
    const s = summarizeMonth(ROWS, cats, '2026-10');
    expect(budgetUsage(s, [{ category: 'fnb', monthly_budget: 100000 }, { category: 'Belanja Online', monthly_budget: 200000 }, { category: 'x', monthly_budget: 0 }]))
      .toEqual([{ category: 'Belanja Online', budget: 200000, spent: 300000, ratio: 1.5 }, { category: 'fnb', budget: 100000, spent: 50000, ratio: 0.5 }]);
  });
});

describe('review', () => {
  it('pending rows, recent automatic rows, and unread emails not handled yet', () => {
    const log = [{ gmail_id: 'm1', status: 'error', reason: 'no amount' }, { gmail_id: 'm2', status: 'skip' }, { gmail_id: 'm3', status: 'error' }];
    const rows = [...ROWS, r('z', '2026-10-05', 'BCA', 'out', 1, 'fnb', 'pending', { gmail_id: 'm3' })];
    const v = reviewItems(rows, log, { today: new Date(2026, 9, 5) });
    expect(v.pending.map((x) => x.id)).toEqual(['z', 'g']);
    expect(v.recentAuto.map((x) => x.id)).toEqual(['f']);
    expect(v.errors.map((x) => x.gmail_id)).toEqual(['m1']);
  });

  it('"always for this merchant" makes a literal rule that also fits other pending rows', () => {
    const row = { description: 'CIRCLE K (JKT)' };
    const rule = ruleFromApproval(row, 'fnb', 'r_x', 'Me', 'now');
    expect(rule).toMatchObject({ pattern: 'CIRCLE K \\(JKT\\)', category: 'fnb', auto_approve: true });
    const rows = [
      { id: '1', status: 'pending', stream: 'BCA', description: 'CIRCLE K (JKT)' },
      { id: '2', status: 'pending', stream: '', description: 'CIRCLE K (JKT)' },
      { id: '3', status: 'approved', stream: 'BCA', description: 'CIRCLE K (JKT)' },
    ];
    expect(pendingMatching(rows, rule).map((x) => x.id)).toEqual(['1']);
  });
});

describe('manual entries', () => {
  const ctx = { owner: 'Me', nowIso: 'now', now: 1 };
  it('expense, income, transfer, adjustment', () => {
    expect(manualRows({ kind: 'out', amount: '25000', date: '2026-10-05', stream: 'Cash', category: 'fnb', description: 'kopi' }, ctx))
      .toEqual([expect.objectContaining({ direction: 'out', amount: 25000, stream: 'Cash', category: 'fnb', source: 'manual', status: 'approved' })]);
    const t = manualRows({ kind: 'transfer', amount: 100000, date: '2026-10-05', stream: 'BCA', toStream: 'GoPay' }, ctx);
    expect(t.map((x) => [x.stream, x.direction, x.category])).toEqual([['BCA', 'out', 'trf ke bank lain'], ['GoPay', 'in', 'trf ke bank lain']]);
    expect(t[0].transfer_id).toBe(t[1].transfer_id);
    expect(manualRows({ kind: 'adjust', amount: -15000, date: '2026-10-05', stream: 'GoPay' }, ctx)[0]).toMatchObject({ direction: 'out', amount: 15000, category: 'Penyesuaian' });
  });
  it('rejects incomplete input', () => {
    expect(() => manualRows({ kind: 'out', amount: 0, date: '2026-10-05', stream: 'Cash', category: 'fnb' }, ctx)).toThrow(/amount/);
    expect(() => manualRows({ kind: 'out', amount: 1, date: '5/10/2026', stream: 'Cash', category: 'fnb' }, ctx)).toThrow(/date/);
    expect(() => manualRows({ kind: 'out', amount: 1, date: '2026-10-05', stream: 'Cash' }, ctx)).toThrow(/category/);
    expect(() => manualRows({ kind: 'transfer', amount: 1, date: '2026-10-05', stream: 'Cash', toStream: 'Cash' }, ctx)).toThrow(/different/);
  });
  it('ids are unique', () => {
    const ids = new Set(Array.from({ length: 50 }, () => manualRows({ kind: 'out', amount: 1, date: '2026-10-05', stream: 'Cash', category: 'fnb' }, ctx)[0].id));
    expect(ids.size).toBe(50);
  });
});

describe('month-end and settings', () => {
  it('balance check posts the difference as Penyesuaian', () => {
    const b = streamBalances(ROWS, ACC, { year: 2026, asOf: '2026-10-05' });
    const fix = balanceCorrection(b, 'GoPay', 60000, { owner: 'Me', nowIso: 'now', date: '2026-10-05' });
    expect(fix).toMatchObject({ stream: 'GoPay', direction: 'out', amount: 25000, category: 'Penyesuaian' });
    expect(balanceCorrection(b, 'GoPay', 85000, { owner: 'Me', nowIso: 'now', date: '2026-10-05' })).toBeNull();
    expect(balanceCorrection(b, 'GoPay', 100000, { owner: 'Me', nowIso: 'now', date: '2026-10-05' })).toMatchObject({ direction: 'in', amount: 15000 });
  });
  it('renaming a category slot maps old to new', () => {
    const next = buildCategorySlots({ income: ['Gaji Bulanan', 'Dividen'], expense: ['fnb', 'Belanja Online', 'Biaya Admin', 'Baru'] });
    expect(renamedCategories(slots, next)).toEqual({ gaji: 'Gaji Bulanan' });
  });
  it('filters and searches transactions, newest first', () => {
    // Same date and time (c, e) keep their sheet order.
    expect(filterTransactions(ROWS, { month: '2026-10', stream: 'BCA' }).rows.map((x) => x.id)).toEqual(['c', 'e', 'b']);
    expect(filterTransactions(ROWS, { q: 'belanja' }).rows.map((x) => x.id)).toEqual(['f']);
    expect(filterTransactions(ROWS, { status: 'pending' }).total).toBe(1);
  });
});
