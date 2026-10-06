// Round 4: the new year, the monthly report and payday reminder, sync alerts.
import { describe, expect, it } from 'vitest';
import { monthlyReport, monthlyEmail, paydayEmail, alertEmail, rolloverTarget, prevMonth } from '../src/core/notices.js';
import { isPayday } from '../src/core/payday.js';
import { streamBalances } from '../src/core/app.js';

const tx = (date, direction, amount, category, extra = {}) => ({ date, direction, amount, category, status: 'approved', stream: 'BCA', description: category, ...extra });

describe('the new year', () => {
  it('the spreadsheet moves on only once the calendar year is past its year', () => {
    expect(rolloverTarget(2026, new Date(2026, 11, 31))).toBeNull();
    expect(rolloverTarget(2026, new Date(2027, 0, 1))).toBe(2027);
    expect(rolloverTarget(2025, new Date(2027, 0, 1))).toBe(2026); // one year per run, the next run catches up
    expect(rolloverTarget('', new Date(2027, 0, 1))).toBeNull();
  });

  it('the app\'s balances keep running past New Year', () => {
    const rows = [tx('2026-12-30', 'in', 1000, 'Gaji'), tx('2027-01-02', 'out', 300, 'Makan')];
    const acc = [{ stream: 'BCA', type: 'Spending', opening_balance: 50 }];
    expect(streamBalances(rows, acc, { year: 2026, asOf: '2027-01-05' })[0].balance).toBe(750);
    expect(streamBalances(rows, acc, { year: 2026, asOf: '2026-12-31' })[0].balance).toBe(1050);
  });
});

describe('payday', () => {
  it('is the configured day, or the last day of a shorter month', () => {
    expect(isPayday(new Date(2026, 9, 28), 28)).toBe(true);
    expect(isPayday(new Date(2026, 9, 27), 28)).toBe(false);
    expect(isPayday(new Date(2027, 1, 28), 31)).toBe(true); // February has no 31st
    expect(isPayday(new Date(2027, 1, 27), 31)).toBe(false);
  });
});

describe('monthly report', () => {
  const cats = { income: ['Gaji'], expense: ['Makan', 'Hobi'] };
  const rows = [
    tx('2026-09-28', 'in', 9000000, 'Gaji'), tx('2026-09-10', 'out', 400000, 'Makan'),
    tx('2026-10-28', 'in', 9000000, 'Gaji'), tx('2026-10-05', 'out', 500000, 'Makan'), tx('2026-10-06', 'out', 1500000, 'Hobi'),
    tx('2026-10-07', 'out', 99, 'Makan', { status: 'pending' }), tx('2026-10-08', 'out', 5000000, 'Transfer ke Bank Lain'),
  ];
  const r = monthlyReport({ rows, cats, budgets: [{ category: 'Hobi', monthly_budget: 1000000 }], month: '2026-10' });

  it('compares the month with the one before, category by category', () => {
    expect(prevMonth('2027-01')).toBe('2026-12');
    expect(r).toMatchObject({ before: '2026-09', income: 9000000, expense: 2000000, net: 7000000, savingRate: 78, beforeExpense: 400000 });
    expect(r.categories).toEqual([
      { category: 'Hobi', amount: 1500000, before: 0, change: 1500000 },
      { category: 'Makan', amount: 500000, before: 400000, change: 100000 },
    ]);
    expect(r.budgets).toEqual([{ category: 'Hobi', budget: 1000000, spent: 1500000, over: true }]);
  });

  it('reads as plain words, in either language', () => {
    const e = monthlyEmail(r, { appUrl: 'https://example.invalid/app', lang: 'id' });
    expect(e.subject).toBe('Laporan bulanan Cashflow · Oktober 2026');
    for (const s of ['dibanding September 2026', 'Ditabung 78% dari pemasukan', 'naik Rp100.000', 'lebih Rp500.000']) expect(e.html).toContain(s);
    expect(monthlyEmail(r, { lang: 'en' }).subject).toBe('Cashflow monthly report · October 2026');
  });
});

describe('payday reminder and sync alerts', () => {
  it('the reminder lists the balances to compare with the bank apps', () => {
    const e = paydayEmail([{ stream: 'BCA', type: 'Spending', balance: 5538685 }, { stream: 'Jago', type: 'Saving', balance: -1 }], { lang: 'id' });
    expect(e.subject).toMatch(/^Gajian!/);
    expect(e.html).toContain('Rp5.538.685');
    expect(e.html).toContain('−Rp1');
    expect(e.html).toContain('Cek saldo akhir bulan');
  });

  it('an alert says what went wrong and what to do', () => {
    const e = alertEmail({ error: 'Gmail: quota exceeded' }, { lang: 'id' });
    expect(e.subject).toBe('Cashflow: sinkron Gmail bermasalah');
    expect(e.html).toContain('Gmail: quota exceeded');
    const u = alertEmail({ unread: [{ subject: 'Pembayaran Berhasil!', reason: 'no amount found' }] }, { lang: 'en' });
    expect(u.html).toContain('1 new bank email(s) couldn’t be read');
    expect(u.html).toContain('no amount found');
  });
});
