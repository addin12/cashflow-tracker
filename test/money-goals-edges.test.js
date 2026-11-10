// Edges of amount and date reading, and of goal progress, that a mutation run (Stryker, 2026-11-09: money 82%, goals 86%) showed nothing was checking.
import { describe, expect, it } from 'vitest';
import { parseAmount, parseDateTime, parseTime, monthNumber, trailingDigits, wibFromEpoch } from '../src/core/money.js';
import { goalProgress, goalProblems } from '../src/core/goals.js';

describe('parseAmount', () => {
  it.each([
    [null, NaN], [undefined, NaN], ['', NaN], ['no amount here', NaN], [',50', 50],
    ['12,5', 12.5], ['12,50', 12.5], ['12,505', 12505], ['1,234,567', 1234567], ['1,234.56', 1234.56], ['1.234,56', 1234.56],
    ['12.5', 12.5], ['12.50', 12.5], ['12.505', 12505], ['5.000.000', 5000000], ['Rp100.', 100], ['Rp 1.000,', 1000], ['1 000 000', 1000000],
    ['0,5', 0.5], ['-Rp2.500,00', 2500], ['IDR 20,500.00', 20500],
  ])('%j -> %j', (raw, want) => (Number.isNaN(want) ? expect(parseAmount(raw)).toBeNaN() : expect(parseAmount(raw)).toBe(want)));
  it('a comma group that is not 1 or 2 digits is thousands, even after other groups ("1,234,56" is 123456, not a decimal)', () => {
    expect(parseAmount('1,234,56')).toBe(123456);
    expect(parseAmount('1.234.56')).toBe(123456);
  });
  it('rounds to 2 decimals', () => {
    expect(parseAmount('12,345.678')).toBe(12345.68);
  });
});

describe('monthNumber', () => {
  it('Indonesian and English names, short and long, any case, with a trailing dot; 0 for anything else', () => {
    expect([monthNumber('Okt'), monthNumber('OCTOBER'), monthNumber('Des.'), monthNumber('mei'), monthNumber('Agu'), monthNumber('Nopember')]).toEqual([10, 10, 12, 5, 8, 11]);
    expect([monthNumber('Foo'), monthNumber(''), monthNumber(undefined)]).toEqual([0, 0, 0]);
  });
});

describe('parseDateTime', () => {
  it('reads the date and the time whatever the spacing, comma and separator', () => {
    expect(parseDateTime('05 Oct 2026 09:17:32')).toEqual({ date: '2026-10-05', time: '09:17:32' });
    expect(parseDateTime('05  Oct  2026')).toEqual({ date: '2026-10-05', time: '' });
    expect(parseDateTime('5 Okt. 2026, 9:17')).toEqual({ date: '2026-10-05', time: '09:17:00' });
    expect(parseDateTime('27 Sep 2026 , 00.00.51 WIB')).toEqual({ date: '2026-09-27', time: '00:00:51' });
    expect(parseDateTime('28 September 2026 20:49 WIB')).toEqual({ date: '2026-09-28', time: '20:49:00' });
    expect(parseDateTime('on 02 Nov 2026 at noon')).toEqual({ date: '2026-11-02', time: '' });
  });
  it('is null for anything that is not a real date', () => {
    for (const bad of ['', null, 'no date', '05 Foo 2026', '00 Oct 2026', '32 Oct 2026', '30 Feb 2026', '29 Feb 2027', '31 Apr 2026', '5 Oct 26']) expect(parseDateTime(bad), String(bad)).toBeNull();
    expect(parseDateTime('29 Feb 2028')).toEqual({ date: '2028-02-29', time: '' });
    expect(parseDateTime('31 Dec 2026')).toEqual({ date: '2026-12-31', time: '' });
    expect(parseDateTime('1 Jan 2026')).toEqual({ date: '2026-01-01', time: '' });
  });
});

describe('parseTime, trailingDigits, wibFromEpoch', () => {
  it('reads one or two digit hours, with or without seconds, with a colon or a dot', () => {
    expect([parseTime('09:23:59 WIB'), parseTime('9:05'), parseTime('19:05'), parseTime('09.23.59'), parseTime('09:23'), parseTime('x'), parseTime('')]).toEqual(['09:23:59', '09:05:00', '19:05:00', '09:23:59', '09:23:00', '', '']);
  });
  it('the last run of digits, with masks and letters after it ignored', () => {
    expect([trailingDigits('TAHAPAN - 1234****56'), trailingDigits('ABC 1234xx'), trailingDigits('1111xxxx22'), trailingDigits('12 34'), trailingDigits('no digits'), trailingDigits(null)]).toEqual(['56', '1234', '22', '1234', '', '']);
  });
  it('shows an email\'s own timestamp as a WIB (UTC+7) date and time, across midnight', () => {
    expect(wibFromEpoch(Date.UTC(2026, 10, 5, 17, 30, 15))).toEqual({ date: '2026-11-06', time: '00:30:15' });
    expect(wibFromEpoch(Date.UTC(2026, 11, 31, 16, 59, 59))).toEqual({ date: '2026-12-31', time: '23:59:59' });
  });
});

describe('goalProgress', () => {
  const goal = (o) => ({ stream: 'Tabungan', name: 'Dana', target: 1000000, target_date: '2026-12-31', ...o });
  const balances = [{ stream: 'Tabungan', balance: 250000 }];
  const today = new Date(2026, 0, 15);

  it('counts only goals with an account and a target above zero', () => {
    const list = [goal(), goal({ stream: '' }), goal({ target: 0 }), goal({ target: '0' }), goal({ target: 'abc' }), goal({ target: -5 }), goal({ stream: undefined })];
    expect(goalProgress(list, balances, today)).toHaveLength(1);
  });
  it('shows what is saved, what is left, the percent, and what to save each month including this one', () => {
    expect(goalProgress([goal({ target_date: '2026-03-31T00:00:00Z' })], balances, today)[0]).toEqual({
      stream: 'Tabungan', name: 'Dana', target: 1000000, targetDate: '2026-03-31', saved: 250000, left: 750000, percent: 25, monthsLeft: 3, perMonth: 250000, done: false,
    });
  });
  it('rounds the monthly amount up, floors the percent, and never shows a negative balance as saved', () => {
    const g = goalProgress([goal({ target: 1000000, target_date: '2026-03-31' })], [{ stream: 'Tabungan', balance: 333333 }], today)[0];
    expect(g).toMatchObject({ percent: 33, left: 666667, perMonth: 222223 });
    expect(goalProgress([goal()], [{ stream: 'Tabungan', balance: -50 }], today)[0]).toMatchObject({ saved: 0, left: 1000000, percent: 0 });
    expect(goalProgress([goal()], [], today)[0].saved).toBe(0);
  });
  it('is done at or over the target (100%, nothing left), and has no monthly amount without a date or after it', () => {
    expect(goalProgress([goal({ target: 200000 })], balances, today)[0]).toMatchObject({ done: true, left: 0, percent: 100 });
    expect(goalProgress([goal({ target_date: '' })], balances, today)[0]).toMatchObject({ monthsLeft: 0, perMonth: 0 });
    expect(goalProgress([goal({ target_date: '2025-12-31' })], balances, today)[0]).toMatchObject({ monthsLeft: 0, perMonth: 0 });
    expect(goalProgress([goal()], balances, new Date(2026, 11, 20))[0]).toMatchObject({ monthsLeft: 1, perMonth: 750000 });
  });
  it('the month is counted by its number across a year boundary, and names the goal after its account when it has no name', () => {
    expect(goalProgress([goal({ target_date: '2027-02-10', name: '' })], balances, new Date(2026, 10, 5))[0]).toMatchObject({ name: 'Tabungan', monthsLeft: 4 });
  });
});

describe('goalProblems', () => {
  const accounts = [{ stream: 'Tabungan' }];
  it('says what is wrong with goal N, counting from 1', () => {
    const list = [{ stream: 'Tabungan', target: 1, target_date: '' }, { stream: 'Nope', target: 0, target_date: '2027-3-1' }];
    expect(goalProblems(list, accounts)).toEqual(['goal 2: choose an account', 'goal 2: the target must be above 0', 'goal 2: the date must be YYYY-MM-DD']);
  });
  it('accepts an empty date or a full ISO date, and rejects anything around or short of one', () => {
    const bad = (d) => goalProblems([{ stream: 'Tabungan', target: 1, target_date: d }], accounts);
    expect(bad('')).toEqual([]);
    expect(bad('2027-03-31')).toEqual([]);
    for (const d of ['2027-3-31', '2027-03-31x', 'x2027-03-31', '2027-03-31 ', '31-03-2027']) expect(bad(d), d).toEqual(['goal 1: the date must be YYYY-MM-DD']);
  });
});
