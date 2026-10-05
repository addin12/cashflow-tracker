import { describe, expect, it } from 'vitest';
import { nextPayday, daysUntilPayday, nextPaydayFormula } from '../src/core/payday.js';
import { buildCategorySlots, nameProblems, validateAccounts } from '../src/core/categories.js';
import { validateSeed } from '../src/core/seed.js';
import { colLetter, TX_COL } from '../src/core/schema.js';
import { sampleTransactions } from '../src/core/sample.js';
import { readFileSync } from 'node:fs';

const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('nextPayday (payday on the 28th)', () => {
  it('is this month while the 28th is ahead', () => expect(iso(nextPayday(d('2026-10-05'), 28))).toBe('2026-10-28'));
  it('moves to next month on payday itself', () => expect(iso(nextPayday(d('2026-10-28'), 28))).toBe('2026-11-28'));
  it('moves to next month after payday', () => expect(iso(nextPayday(d('2026-10-30'), 28))).toBe('2026-11-28'));
  it('rolls over the year', () => expect(iso(nextPayday(d('2026-12-29'), 28))).toBe('2027-01-28'));
  it('uses the last day when the month is short', () => {
    expect(iso(nextPayday(d('2026-02-10'), 31))).toBe('2026-02-28');
    expect(iso(nextPayday(d('2026-01-31'), 31))).toBe('2026-02-28');
  });
  it('counts days left (never 0)', () => {
    expect(daysUntilPayday(d('2026-10-05'), 28)).toBe(23);
    expect(daysUntilPayday(d('2026-10-28'), 28)).toBe(31);
  });
  it('rejects bad days', () => expect(() => nextPayday(d('2026-10-05'), 0)).toThrow());
  it('builds the matching sheet formula', () => {
    expect(nextPaydayFormula('CFG_PAYDAY')).toBe('=LET(t,TODAY(),p,CFG_PAYDAY,IF(t<DATE(YEAR(t),MONTH(t),MIN(p,DAY(EOMONTH(t,0)))),DATE(YEAR(t),MONTH(t),MIN(p,DAY(EOMONTH(t,0)))),DATE(YEAR(t),MONTH(t)+1,MIN(p,DAY(EOMONTH(t,1))))))');
  });
});

describe('category and account names', () => {
  it('pads to the template slot counts with "-"', () => {
    const s = buildCategorySlots({ income: ['a'], expense: ['b', 'c'] });
    expect(s.income).toHaveLength(6);
    expect(s.expense).toHaveLength(28);
    expect(s.income.slice(1).every((x) => x === '-')).toBe(true);
  });
  it('rejects SUMIFS-breaking names', () => {
    expect(nameProblems('50% off*')).not.toHaveLength(0);
    expect(nameProblems('>100k')).not.toHaveLength(0);
    expect(nameProblems('-')).not.toHaveLength(0);
    expect(nameProblems(' fnb')).not.toHaveLength(0);
    expect(nameProblems('Hadiah & Sosial')).toHaveLength(0);
    expect(nameProblems('Proyek / Freelance')).toHaveLength(0);
  });
  it('rejects duplicates across income and expense, and the fixed names', () => {
    expect(() => buildCategorySlots({ income: ['Lainnya'], expense: ['lainnya'] })).toThrow(/more than once/);
    expect(() => buildCategorySlots({ income: [], expense: ['Penyesuaian'] })).toThrow(/more than once/);
  });
  it('enforces slot limits', () => {
    expect(() => buildCategorySlots({ income: Array.from({ length: 7 }, (_, i) => `i${i}`), expense: [] })).toThrow(/at most 6/);
    expect(() => validateAccounts(Array.from({ length: 9 }, (_, i) => ({ stream: `s${i}`, type: 'Spending' })))).toThrow(/at most 8/);
  });
});

describe('seeds', () => {
  it('the public example seed is valid', () => {
    const seed = JSON.parse(readFileSync(new URL('../config/seed.example.json', import.meta.url), 'utf8'));
    expect(() => validateSeed(seed)).not.toThrow();
  });
  it('reports every problem at once', () => {
    expect(() => validateSeed({ year: 26, start_date: '1-9-2026', payday_day: 40, categories: {}, accounts: [] }))
      .toThrow(/year[\s\S]*start_date[\s\S]*payday_day[\s\S]*owner_name/);
  });
});

describe('schema helpers', () => {
  it('column letters', () => {
    expect([colLetter(0), colLetter(25), colLetter(26), colLetter(27)]).toEqual(['A', 'Z', 'AA', 'AB']);
    expect([TX_COL.date, TX_COL.amount, TX_COL.status]).toEqual(['B', 'G', 'P']);
  });
});

describe('self-test sample', () => {
  const tx = sampleTransactions();
  it('covers all 12 months and the rows that must not count', () => {
    const months = new Set(tx.filter((t) => t.date.startsWith('2026-')).map((t) => t.date.slice(5, 7)));
    expect(months.size).toBe(12);
    expect(tx.some((t) => t.status === 'pending')).toBe(true);
    expect(tx.some((t) => t.status === 'ignored')).toBe(true);
    expect(tx.some((t) => !t.date.startsWith('2026-'))).toBe(true);
  });
  it('has unique ids', () => expect(new Set(tx.map((t) => t.id)).size).toBe(tx.length));
});
