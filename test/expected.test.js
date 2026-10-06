import { describe, expect, it } from 'vitest';
import { expectedReport } from '../src/core/expected.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { SAMPLE_ACCOUNTS, SAMPLE_CATEGORIES, sampleTransactions, SAMPLE_YEAR } from '../src/core/sample.js';

// Small data set whose totals are worked out by hand in the comments.
const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
const accounts = [
  { stream: 'Bank', type: 'Spending', opening_balance: 1000 },
  { stream: 'Tab', type: 'Saving', opening_balance: 500 },
];
const t = (date, stream, direction, amount, category, status = 'approved') => ({ date, stream, direction, amount, category, status });
const transactions = [
  t('2026-01-05', 'Bank', 'in', 5000, 'Gaji'),
  t('2026-01-10', 'Bank', 'out', 1200, 'Makan'),
  t('2026-05-31', 'Bank', 'out', 300, 'Makan'), // last day of May
  t('2026-05-20', 'Bank', 'out', 2000, 'trf ke bank lain'),
  t('2026-05-20', 'Tab', 'in', 2000, 'trf ke bank lain'),
  t('2026-12-31', 'Bank', 'out', 100, 'Penyesuaian'),
  t('2026-01-07', 'Bank', 'out', 999, 'Makan', 'pending'), // not approved
  t('2025-12-31', 'Bank', 'out', 777, 'Makan'), // last year: not in 2026's months, but lowers Bank's 2026 opening (1000 - 777 = 223)
];
const r = expectedReport({ year: 2026, slots, accounts, transactions, budgetMonth: 1 });
const v = (k) => r.get(k);

describe('expectedReport (hand-calculated)', () => {
  it('category matrix by month', () => {
    expect(v('CASHFLOW!L5')).toBe(5000); // Gaji, Jan
    expect(v('CASHFLOW!L11')).toBe(1200); // Makan, Jan (pending 999 excluded)
    expect(v('CASHFLOW!P11')).toBe(300); // Makan, May (31st counts)
    expect(v('CASHFLOW!P40')).toBe(2000); // transfer row counts only the "out" leg
    expect(v('CASHFLOW!W39')).toBe(100); // Penyesuaian, Dec
    expect(v('CASHFLOW!L6')).toBe(0); // "-" slot
  });

  it('income / expense / balance leave adjustment and transfer out', () => {
    expect([v('CASHFLOW!L3'), v('CASHFLOW!L4'), v('CASHFLOW!L41')]).toEqual([5000, 1200, 3800]);
    expect([v('CASHFLOW!P3'), v('CASHFLOW!P4'), v('CASHFLOW!P41')]).toEqual([0, 300, -300]);
    expect(v('CASHFLOW!W4')).toBe(0);
    expect([v('CASHFLOW!X3'), v('CASHFLOW!Y3'), v('CASHFLOW!X41')]).toEqual([5000, 1500, 3500]);
  });

  it('streams include every category and the opening balance', () => {
    expect(v('CASHFLOW!L46')).toBe(3800); // 5000 - 1200
    expect(v('CASHFLOW!P46')).toBe(-2300); // -300 - 2000
    expect(v('CASHFLOW!W46')).toBe(-100);
    expect(v('CASHFLOW!X46')).toBe(1623); // 3800 - 2300 - 100 + 223 (opening carried from last year)
    expect(v('CASHFLOW!P55')).toBe(2000);
    expect(v('CASHFLOW!X55')).toBe(2500);
    expect([v('CASHFLOW!X63'), v('CASHFLOW!X64'), v('CASHFLOW!X65')]).toEqual([1623, 2500, 4123]);
    expect(v('CASHFLOW!X47')).toBe(0); // "-" slot
  });

  it('quarter report', () => {
    expect([v('QUARTER REPORT!E9'), v('QUARTER REPORT!E15')]).toEqual([5000, 5000]);
    expect([v('QUARTER REPORT!E17'), v('QUARTER REPORT!E45'), v('QUARTER REPORT!E46')]).toEqual([1200, 1200, 3800]);
    expect([v('QUARTER REPORT!P17'), v('QUARTER REPORT!P46')]).toEqual([300, -300]);
    expect(v('QUARTER REPORT!AL46')).toBe(0);
  });

  it('final statement', () => {
    expect([v('FINAL STATEMENT!D6'), v('FINAL STATEMENT!D12')]).toEqual([5000, 5000]);
    expect([v('FINAL STATEMENT!F6'), v('FINAL STATEMENT!F34'), v('FINAL STATEMENT!F35')]).toEqual([1500, 1500, 3500]);
    expect([v('FINAL STATEMENT!S6'), v('FINAL STATEMENT!S7'), v('FINAL STATEMENT!S14')]).toEqual([1623, 0, 1623]);
    expect([v('FINAL STATEMENT!U6'), v('FINAL STATEMENT!U14'), v('FINAL STATEMENT!U15')]).toEqual([2500, 2500, 4123]);
  });

  it('budget tracker for January', () => {
    expect([v('BUDGET TRACKER!E29'), v('BUDGET TRACKER!E35')]).toEqual([5000, 5000]);
    expect([v('BUDGET TRACKER!H29'), v('BUDGET TRACKER!H57')]).toEqual([1200, 1200]);
    expect([v('BUDGET TRACKER!J29'), v('BUDGET TRACKER!J37')]).toEqual([4023, 4023]); // 3800 + 223 opening
    expect([v('BUDGET TRACKER!L29'), v('BUDGET TRACKER!L37')]).toEqual([500, 500]);
  });
});

describe('expectedReport on the self-test sample', () => {
  const s = buildCategorySlots(SAMPLE_CATEGORIES);
  const tx = sampleTransactions();
  const rep = expectedReport({ year: SAMPLE_YEAR, slots: s, accounts: SAMPLE_ACCOUNTS, transactions: tx });

  it('yearly income equals the sum of approved in-year income rows', () => {
    const incomeNames = new Set(SAMPLE_CATEGORIES.income);
    const want = tx.filter((x) => x.status === 'approved' && x.date.startsWith('2026-') && x.direction === 'in' && incomeNames.has(x.category))
      .reduce((a, x) => a + x.amount, 0);
    expect(rep.get('CASHFLOW!X3')).toBe(want);
  });

  it('every month has income and expense (catches a month silently summing to 0)', () => {
    for (const col of ['L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W']) {
      expect(rep.get(`CASHFLOW!${col}3`)).toBeGreaterThan(0);
      expect(rep.get(`CASHFLOW!${col}4`)).toBeGreaterThan(0);
    }
  });

  it('checks a meaningful number of cells', () => {
    expect(rep.size).toBeGreaterThan(900);
  });
});
