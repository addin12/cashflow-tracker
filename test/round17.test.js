// Round 17: subscription changes, yearly plans, the calendar, credit cards, money health, the SPT
// list, deposit vs SBN, "Pertama kali", closing yesterday until noon, paydays before holidays.
import { describe, expect, it } from 'vitest';
import { recurringCharges } from '../src/core/recurring.js';
import { weeklySummary, summaryEmail } from '../src/core/summary.js';
import { newPlaceIds } from '../src/core/insights.js';
import { financialHealth, interestCompare, upcomingBills } from '../src/core/wealth.js';
import { cardBills, cardProblems } from '../src/core/cards.js';
import { sptList } from '../src/core/spt.js';
import { findYearly, yearlyItems } from '../src/core/yearly.js';
import { calendarEvents } from '../src/gas/calendar.js';
import { isWorkday, workdayOnOrBefore } from '../src/core/holidays.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const out = (id, date, amount, description, extra = {}) => ({ id, date, amount, description, direction: 'out', status: 'approved', category: 'Langganan', stream: 'BCA', source: 'email', ...extra });
const oct16 = new Date(2026, 9, 16);

describe('subscription changes', () => {
  const rows = [
    out('a1', '2026-07-03', 54990, 'SPOTIFY'), out('a2', '2026-08-03', 54990, 'SPOTIFY'), out('a3', '2026-09-03', 54990, 'SPOTIFY'), out('a4', '2026-10-03', 64990, 'SPOTIFY'),
    out('b1', '2026-08-01', 119000, 'NETFLIX'), // a month and a half late: stopped?
    out('c1', '2026-10-10', 139000, 'CANVA PRO'),
  ];
  it('a price rise, one that looks stopped, and a new one', () => {
    const { items } = recurringCharges(rows, { today: oct16, start: '2026-06-01' });
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by.SPOTIFY).toMatchObject({ change: 'up', was: 54990, amount: 64990, basis: 'monthly' }); // still monthly after the rise
    expect(by.NETFLIX).toMatchObject({ change: 'late' });
    expect(by['CANVA PRO']).toMatchObject({ change: 'new' });
    // Nothing is "new" in the app's first 40 days.
    expect(recurringCharges(rows, { today: oct16, start: '2026-09-15' }).items.find((i) => i.name === 'CANVA PRO').change).toBe('');
  });
  it('the weekly email lists them', () => {
    const s = weeklySummary({ rows, cats: { income: [], expense: ['Langganan'] }, budgets: [], recurring: recurringCharges(rows, { today: oct16, start: '2026-06-01' }), today: oct16 });
    expect(s.changes.map((c) => c.name).sort()).toEqual(['CANVA PRO', 'NETFLIX', 'SPOTIFY']);
    const html = summaryEmail(s, { lang: 'id' }).html;
    expect(html).toContain('Langganan yang berubah');
    expect(html).toContain('Naik dari Rp54.990');
  });
});

describe('yearly plans from older receipts', () => {
  it('a receipt saying it renews in a year, or one yearly-looking charge; monthly ones are left out', () => {
    const found = findYearly([
      { date: '2025-11-20', amount: 199000, description: 'APPLE.COM/BILL', details: 'iCloud+ 200 GB (Yearly) · renews 20 November 2026' },
      { date: '2026-02-14', amount: 150000, description: 'NIAGAHOSTER DOMAIN', details: '' },
      { date: '2026-08-01', amount: 54990, description: 'SPOTIFY', details: '' }, { date: '2026-09-01', amount: 54990, description: 'SPOTIFY', details: '' },
      { date: '2026-05-05', amount: 75000, description: 'WARUNG MAKAN', details: '' }, // not a plan
    ], { today: oct16 });
    expect(found.map((f) => [f.name, f.nextDate, f.guess])).toEqual([['APPLE.COM/BILL', '2026-11-20', false], ['NIAGAHOSTER DOMAIN', '2027-02-14', true]]);
  });
  it('a charge near the renewal date rolls it a year on; a hidden one is left out', () => {
    const found = [{ key: 'niagahoster domain', name: 'NIAGAHOSTER DOMAIN', amount: 150000, lastDate: '2025-10-20', nextDate: '2026-10-20', guess: true }];
    const rows = [out('d1', '2026-10-15', 165000, 'NIAGAHOSTER DOMAIN')];
    expect(yearlyItems(found, rows, { today: oct16 })[0]).toMatchObject({ lastDate: '2026-10-15', nextDate: '2027-10-15', amount: 165000, cycle: 'year', basis: 'yearly-guess' });
    expect(yearlyItems(found, [], { today: oct16, hidden: ['NIAGAHOSTER DOMAIN'] })).toEqual([]);
  });
});

describe('"Pertama kali"', () => {
  it('the first payment to a place, from email, after the first 30 days', () => {
    const rows = [
      out('1', '2026-09-05', 20000, 'KOPI KENANGAN 12'), out('2', '2026-10-12', 25000, 'Kopi Kenangan 99'),
      out('3', '2026-10-14', 80000, 'TOKO BARU'), out('4', '2026-10-15', 15000, 'Bakso', { source: 'manual' }),
      out('5', '2026-09-10', 30000, 'LAMA SEKALI'),
    ];
    expect([...newPlaceIds(rows, { start: '2026-09-01', today: oct16 })]).toEqual(['3']);
  });
});

describe('money health', () => {
  it('months of emergency fund, share kept, debt against what is owned', () => {
    const h = financialHealth({
      balances: [{ stream: 'Jago Dana Darurat', balance: 30000000 }, { stream: 'BCA', balance: 5000000 }, { stream: 'Kartu', balance: -1000000 }],
      trend: [{ month: '2026-08', expense: 4000000 }, { month: '2026-09', expense: 6000000 }, { month: '2026-10', expense: 1000000 }],
      month: '2026-10', summary: { income: 10000000, expense: 7000000 }, wealth: { owned: 15000000, collectibles: 0, debts: 5000000 },
    });
    expect(h).toMatchObject({ fund: 30000000, monthly: 5000000, months: 6, monthsLevel: 'good', saving: 0.3, savingLevel: 'good', debts: 6000000, debt: 0.12, debtLevel: 'good' });
    expect(financialHealth({ balances: [], trend: [], month: '2026-10', summary: { income: 0, expense: 0 } })).toMatchObject({ months: null, saving: null, debt: 0 });
  });
  it('deposit vs SBN after tax; no deposit tax at Rp7,5 jt or less', () => {
    expect(interestCompare({ amount: 60000000, months: 12, depositRate: 4.5, sbnRate: 6.5 })).toEqual({
      deposit: { gross: 2700000, tax: 540000, net: 2160000, perMonth: 180000 }, sbn: { gross: 3900000, tax: 390000, net: 3510000, perMonth: 292500 },
    });
    expect(interestCompare({ amount: 5000000, months: 12, depositRate: 4 }).deposit.tax).toBe(0);
    expect(interestCompare({ amount: 5000000, months: 12 }).sbn).toBeNull();
  });
});

describe('credit cards', () => {
  const rows = [
    { stream: 'Kartu', direction: 'out', amount: 300000, date: '2026-09-20', status: 'approved', category: 'Makan' },
    { stream: 'Kartu', direction: 'in', amount: 50000, date: '2026-09-22', status: 'approved', category: 'Cashback' },
    { stream: 'Kartu', direction: 'out', amount: 100000, date: '2026-10-08', status: 'approved', category: 'Makan' },
    { stream: 'Kartu', direction: 'out', amount: 70000, date: '2026-10-12', status: 'approved', category: 'Makan' },
    { stream: 'Kartu', direction: 'in', amount: 100000, date: '2026-10-14', status: 'approved', category: 'trf ke bank lain' },
  ];
  it('the last statement bill, what is paid, the due date, and spending since', () => {
    const [c] = cardBills([{ stream: 'Kartu', statement: 10, due: 25 }], rows, oct16, 'trf ke bank lain');
    // Statement 10 Oct covers 11 Sep..10 Oct: 300k + 100k − 50k refund; 100k paid after it.
    expect(c).toEqual({ stream: 'Kartu', statementDate: '2026-10-10', dueDate: '2026-10-25', bill: 350000, paid: 100000, left: 250000, current: 70000, daysLeft: 9 });
    expect(upcomingBills([], [], oct16, 10, [c])).toEqual([{ name: 'Kartu', amount: 250000, date: '2026-10-25', daysLeft: 9, kind: 'card' }]);
  });
  it('checks the settings', () => {
    expect(cardProblems([{ stream: 'X', statement: 40, due: 5 }], [{ stream: 'Kartu' }])).toEqual(['X: choose an account', 'X: statement day must be 1-31']);
  });
});

describe('SPT list', () => {
  it('accounts and assets with their SPT codes; a card below zero is a debt', () => {
    const s = sptList({
      balances: [{ stream: 'BCA', balance: 4000000 }, { stream: 'GoPay', balance: 100000 }, { stream: 'Cash', balance: 50000 }, { stream: 'Saham (Mandiri Sekuritas)', balance: 3700000 }, { stream: 'Kartu Kredit', balance: -200000 }],
      assets: [{ name: 'Motor Beat', kind: 'vehicle', unit_value: 12000000, paid: 17000000 }, { name: 'Emas Antam', kind: 'gold', qty: 2, price: 1200000 }, { name: 'Cicilan KTA', kind: 'debt', unit_value: 3000000 }],
      year: 2026, asOf: '2026-10-16',
    });
    expect(s.harta.map((x) => [x.code, x.name, x.value, x.cost])).toEqual([
      ['011', 'Cash', 50000, 50000], ['012', 'BCA', 4000000, 4000000], ['019', 'GoPay', 100000, 100000], ['032', 'Saham (Mandiri Sekuritas)', 3700000, 3700000],
      ['042', 'Motor Beat', 12000000, 17000000], ['051', 'Emas Antam', 2400000, null],
    ]);
    expect(s.utang.map((x) => [x.code, x.name, x.value])).toEqual([['101', 'Cicilan KTA', 3000000], ['102', 'Kartu Kredit', 200000]]);
    expect(s.harta[0].label).toBe('Uang tunai');
  });
});

describe('the Cashflow calendar', () => {
  it('bills for 45 days and the next paydays (moved before weekends)', () => {
    const keys = calendarEvents({
      plans: [{ name: 'Kos', amount: 1500000, direction: 'out', day: 1, active: true }], recurringItems: [{ name: 'SPOTIFY', amount: 54990, nextDate: '2026-11-03', daysLeft: 18 }],
      cards: [], payday: 28, today: oct16,
    });
    expect(keys).toEqual(['2026-11-01|Kos · Rp1.500.000', '2026-11-03|SPOTIFY · Rp54.990', '2026-10-28|💼 Gajian', '2026-11-27|💼 Gajian']);
  });
});

describe('holidays', () => {
  it('weekends, national holidays and cuti bersama are not working days', () => {
    expect(isWorkday(new Date(2026, 7, 17))).toBe(false); // 17 Agustus
    expect(isWorkday(new Date(2026, 11, 24))).toBe(false); // cuti bersama Natal
    expect(isWorkday(new Date(2026, 9, 16))).toBe(true);
    expect(workdayOnOrBefore(new Date(2026, 11, 26)).getDate()).toBe(23); // Sat 26 → Wed 23 (24, 25 off)
  });
});

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'x1', date: '2026-09-02', direction: 'out', amount: 20000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', source: 'email' },
      { id: 'x2', date: '2026-10-14', direction: 'out', amount: 80000, stream: 'BCA', category: '', status: 'pending', description: 'TOKO BARU', source: 'email' },
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 1000000 }, { stream: 'Kartu', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}

describe('the API', () => {
  it('marks first payments in Review and the list; saves cards; builds the SPT list', () => {
    const store = memoryStore();
    const api = createApi(store, { now: () => new Date(2026, 9, 16, 9) });
    expect(api.review().pending[0]).toMatchObject({ id: 'x2', first: true });
    expect(api.list({}).rows.find((r) => r.id === 'x2').first).toBe(true);
    expect(() => api.saveCards({ cards: [{ stream: 'Nope', statement: 5, due: 20 }] })).toThrow(/choose an account/);
    api.saveCards({ cards: [{ stream: 'Kartu', statement: 5, due: 20 }] });
    expect(api.dashboard({}).cards[0]).toMatchObject({ stream: 'Kartu', dueDate: '2026-10-20' });
    expect(api.spt({ year: 2026 })).toMatchObject({ year: 2026, asOf: '2026-10-16', harta: [{ code: '012', name: 'BCA' }] });
  });
  it('yesterday can be closed until 12:00 to keep the streak', () => {
    const store = memoryStore({ closed_days: '2026-10-14,2026-10-13' });
    const morning = createApi(store, { now: () => new Date(2026, 9, 16, 9) });
    expect(morning.review().day).toMatchObject({ streak: 0, yesterday: '2026-10-15' });
    expect(morning.closeDay({ date: '2026-10-15' })).toMatchObject({ streak: 3 });
    expect(createApi(memoryStore({ closed_days: '2026-10-14' }), { now: () => new Date(2026, 9, 16, 13) }).review().day.yesterday).toBeUndefined();
  });
});
