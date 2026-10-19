// Round 20: backup CSV, search by amount, insurance claims, a subscription that moved account,
// days under budget, warranties, the yearly-plan rule, and what the weekly email now lists.
import { describe, expect, it } from 'vitest';
import { csvCell, toCsv, backupCsv } from '../src/core/csv.js';
import { filterTransactions, parseSearch } from '../src/core/app.js';
import { claimDue, markClaim, openClaims } from '../src/core/claims.js';
import { recurringCharges } from '../src/core/recurring.js';
import { underBudget, categoryHabit } from '../src/core/insights.js';
import { warrantyEnds, assetProblems, parsePriceStatus } from '../src/core/wealth.js';
import { findYearly } from '../src/core/yearly.js';
import { weeklySummary, summaryEmail } from '../src/core/summary.js';
import { monthlyEmail } from '../src/core/notices.js';
import { claimsNotice, warrantyNotice } from '../src/core/push.js';
import { calendarEvents } from '../src/gas/calendar.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const oct19 = new Date(2026, 9, 19, 9);

describe('CSV', () => {
  it('text that starts like a formula gets a quote; numbers and plain text are left alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+62 812')).toBe("'+62 812");
    expect(csvCell('-Kopi')).toBe("'-Kopi");
    expect(csvCell(-5000)).toBe('-5000');
    expect(csvCell('Kopi, susu')).toBe('"Kopi, susu"');
    expect(csvCell(null)).toBe('');
  });
  it('the backup has every transaction, oldest first, with the columns that rebuild the sheet', () => {
    const csv = backupCsv([
      { id: 'b', date: '2026-10-02', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: 'Makan', description: 'Bakso', details: '', source: 'manual', status: 'approved' },
      { id: 'a', date: '2026-10-01', time: '', owner: 'Me', stream: 'BCA', direction: 'in', amount: 9000000, category: 'Gaji', description: 'Gaji', details: 'Gaji 2026-10', source: 'manual', status: 'approved', ref_no: 'salary:2026-10' },
    ]);
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toBe('id,date,time,owner,stream,direction,amount,category,description,details,source,status,ref_no,transfer_id');
    expect(lines[1]).toBe('a,2026-10-01,,Me,BCA,in,9000000,Gaji,Gaji,Gaji 2026-10,manual,approved,salary:2026-10,');
    expect(lines[2].startsWith('b,2026-10-02,10:00:00')).toBe(true);
    expect(toCsv(['x'], [['y']])).toBe('﻿x\r\ny');
  });
});

describe('search by amount', () => {
  const rows = [
    { id: 1, date: '2026-10-01', description: 'Kopi', details: '', category: 'Makan', stream: 'GoPay', amount: 28000 },
    { id: 2, date: '2026-10-02', description: 'Kopi Kenangan', details: '', category: 'Makan', stream: 'BCA', amount: 55000 },
    { id: 3, date: '2026-10-03', description: 'Servis motor', details: '', category: 'Kendaraan', stream: 'BCA', amount: 450000 },
    { id: 4, date: '2026-10-04', description: 'Order 7-Eleven', details: 'No 1234', category: 'Makan', stream: 'BCA', amount: 12000 },
  ];
  const ids = (q) => filterTransactions(rows, { q }).rows.map((r) => r.id).sort();
  it('greater, less, exact and range, with rb / k / jt', () => {
    expect(ids('>50rb')).toEqual([2, 3]);
    expect(ids('<=28rb')).toEqual([1, 4]);
    expect(ids('28rb')).toEqual([1]);
    expect(ids('=55k')).toEqual([2]);
    expect(ids('30rb-500rb')).toEqual([2, 3]);
    expect(ids('>=0,45jt')).toEqual([3]);
  });
  it('words and amounts together; a bare number matches an amount or the text; ordinary words still search', () => {
    expect(ids('kopi >30rb')).toEqual([2]);
    expect(ids('28000')).toEqual([1]);
    expect(ids('1234')).toEqual([4]); // the order number in the notes
    expect(ids('7-eleven')).toEqual([4]); // not mistaken for a range
    expect(ids('servis')).toEqual([3]);
    expect(ids('')).toEqual([1, 2, 3, 4]);
    expect(parseSearch('kopi >20rb').text).toBe('kopi');
  });
});

describe('insurance claims', () => {
  it('the deadline is the payment date plus the window; re-opening keeps it', () => {
    expect(claimDue('2026-10-10', 30)).toBe('2026-11-09');
    expect(claimDue('2026-12-20', 30)).toBe('2027-01-19');
    const a = markClaim({}, 'x', 'open', { date: '2026-10-10', days: 30 });
    expect(a.x).toEqual({ s: 'open', due: '2026-11-09' });
    expect(markClaim(a, 'x', 'claimed', { date: '2026-10-10', days: 10 }).x.s).toBe('claimed');
    expect(markClaim({ x: { s: 'open', due: '2026-11-09' } }, 'x', 'open', { date: '2026-10-10', days: 10 }).x.due).toBe('2026-11-09');
    expect(markClaim(a, 'x', '', { date: '2026-10-10', days: 30 })).toEqual({});
  });
  it('open claims, the nearest deadline first, with the days left', () => {
    const rows = [{ id: 'a', description: 'Dokter', amount: 300000, date: '2026-10-01' }, { id: 'b', description: 'Apotek', amount: 80000, date: '2026-10-12' }, { id: 'c', description: 'Lab', amount: 1, date: '2026-10-01' }];
    const claims = { a: { s: 'open', due: '2026-10-31' }, b: { s: 'open', due: '2026-10-22' }, c: { s: 'claimed', due: '2026-10-25' }, gone: { s: 'open', due: '2026-10-20' } };
    expect(openClaims(rows, claims, oct19).map((c) => [c.id, c.daysLeft])).toEqual([['b', 3], ['a', 12]]);
  });
  it('the reminders: the notification text and the weekly email list them', () => {
    const list = [{ id: 'b', description: 'Apotek', amount: 80000, due: '2026-10-22', daysLeft: 3 }];
    expect(claimsNotice(list, 'id')).toMatchObject({ title: 'Batas klaim asuransi', body: 'Apotek Rp80.000 · 3 hari lagi' });
    expect(claimsNotice([], 'id')).toBeNull();
    const s = weeklySummary({ rows: [], cats: { income: [], expense: [] }, budgets: [], recurring: { items: [] }, today: oct19, claims: [...list, { ...list[0], id: 'far', daysLeft: 20 }] });
    expect(s.claims.map((c) => c.id)).toEqual(['b']);
    expect(summaryEmail(s, { lang: 'id' }).html).toContain('Klaim asuransi yang segera lewat batas');
  });
});

function memoryStore(cfgExtra = {}, extraRows = []) {
  const t = {
    [TABS.transactions]: [
      { id: 'd1', date: '2026-10-05', direction: 'out', amount: 300000, stream: 'BCA', category: 'Kesehatan', status: 'approved', description: 'Dokter', source: 'email', owner: 'Me' },
      ...extraRows,
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 5000000 }],
    [TABS.goals]: [], [TABS.budgets]: [{ category: 'Kesehatan', monthly_budget: 310000 }], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [],
    [TABS.assets]: [{ id: 'a1', name: 'Laptop', kind: 'goods', qty: 1, unit_value: 12000000, warranty: '2026-11-02' }],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Kesehatan', 'Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}

describe('the API', () => {
  it('marks a claim, lists it on the overview and on the row, and checks the window', () => {
    const store = memoryStore({ claim_days: 20 });
    const api = createApi(store, { now: () => oct19 });
    expect(api.markClaim({ id: 'd1', status: 'open' })).toEqual({ ok: true, due: '2026-10-25' });
    expect(() => api.markClaim({ id: 'd1', status: 'nope' })).toThrow(/open, claimed or skip/);
    expect(() => api.markClaim({ id: 'missing', status: 'open' })).toThrow(/not found/);
    expect(api.dashboard({}).claims).toEqual([expect.objectContaining({ id: 'd1', due: '2026-10-25', daysLeft: 6, amount: 300000 })]);
    expect(api.list({}).rows[0]).toMatchObject({ id: 'd1', claim: 'open', claimDue: '2026-10-25' });
    api.markClaim({ id: 'd1', status: 'claimed' });
    expect(api.dashboard({}).claims).toEqual([]);
    expect(() => api.saveConfig({ claim_days: 0 })).toThrow(/1-365/);
    api.saveConfig({ claim_days: '45' });
    expect(store.cfg.claim_days).toBe(45);
  });
  it('warranties: saved with the asset, shown when ending, a bad date refused', () => {
    const store = memoryStore();
    const api = createApi(store, { now: () => oct19 });
    expect(api.dashboard({}).warranties).toEqual([{ name: 'Laptop', date: '2026-11-02', daysLeft: 14 }]);
    expect(() => api.saveAssets({ assets: [{ name: 'X', kind: 'goods', unit_value: 1, warranty: 'next year' }] })).toThrow(/warranty must be a date/);
    api.saveAssets({ assets: [{ id: 'a1', name: 'Laptop', kind: 'goods', unit_value: 12000000, warranty: '2027-03-01' }] });
    expect(store.t[TABS.assets][0].warranty).toBe('2027-03-01');
    expect(api.dashboard({}).warranties).toEqual([]); // 133 days away: beyond the 60-day window
  });
  it('days under the budget\'s daily share, and no-spend days', () => {
    const rows = [
      { id: 'e1', date: '2026-10-17', direction: 'out', amount: 20000, stream: 'BCA', category: 'Makan', status: 'approved', owner: 'Me' },
      { id: 'e2', date: '2026-10-18', direction: 'out', amount: 400000, stream: 'BCA', category: 'Makan', status: 'approved', owner: 'Me' },
    ];
    const api = createApi(memoryStore({}, rows), { now: () => oct19 });
    const u = api.dashboard({}).under;
    expect(u.elapsed).toBe(19);
    expect(u.allowance).toBe(Math.round(310000 / 31));
    expect(u.noSpend).toBe(16); // 19 days so far minus the 5th, 17th and 18th
    expect(u.under).toBe(16); // the daily share is Rp10.000: the 5th (300k), 17th (20k) and 18th (400k) went over it
  });
});

describe('the habit line of a category', () => {
  it('times, total, average and the days between, over the last 90 days', () => {
    const rows = [{ date: '2026-10-10', amount: 50000 }, { date: '2026-09-10', amount: 70000 }, { date: '2026-08-10', amount: 30000 }, { date: '2026-01-01', amount: 999999 }];
    expect(categoryHabit(rows, { today: '2026-10-19' })).toEqual({ n: 3, sum: 150000, avg: 50000, every: 30 });
    expect(categoryHabit(rows.slice(0, 1), { today: '2026-10-19' })).toBeNull();
    expect(categoryHabit([...rows.slice(0, 1), { date: '2026-10-25', amount: 1 }], { today: '2026-10-19' })).toBeNull(); // nothing after today
  });
});

describe('underBudget', () => {
  it('counts only the days so far and after the first day of data', () => {
    const daily = [{ date: '2026-10-01', amount: 0 }, { date: '2026-10-02', amount: 50 }, { date: '2026-10-03', amount: 500 }, { date: '2026-10-04', amount: 0 }];
    expect(underBudget(daily, { today: '2026-10-03', from: '2026-10-02', allowance: 100 })).toEqual({ elapsed: 2, noSpend: 0, under: 1, allowance: 100 });
    expect(underBudget(daily, { today: '2026-10-04', allowance: 0 })).toEqual({ elapsed: 4, noSpend: 2, under: null, allowance: 0 });
    expect(underBudget(daily, { today: '2026-09-30' })).toBeNull();
  });
});

describe('a subscription paid from another account', () => {
  const out = (id, date, amount, stream) => ({ id, date, amount, stream, description: 'SPOTIFY', direction: 'out', status: 'approved', category: 'Langganan', source: 'email' });
  it('says where it was paid from before', () => {
    const rows = [out('1', '2026-08-03', 54990, 'GoPay'), out('2', '2026-09-03', 54990, 'GoPay'), out('3', '2026-10-03', 54990, 'BCA')];
    expect(recurringCharges(rows, { today: oct19 }).items[0]).toMatchObject({ change: 'moved', from: 'GoPay', stream: 'BCA' });
    // A price rise outranks a move; the same account says nothing.
    expect(recurringCharges([...rows.slice(0, 2), out('3', '2026-10-03', 64990, 'BCA')], { today: oct19 }).items[0].change).toBe('up');
    expect(recurringCharges(rows.map((r) => ({ ...r, stream: 'BCA' })), { today: oct19 }).items[0].change).toBe('');
  });
});

describe('warranties', () => {
  it('ending within the window, nearest first; debts and past dates left out', () => {
    const w = warrantyEnds([
      { name: 'HP', kind: 'goods', warranty: '2026-10-25' }, { name: 'TV', kind: 'goods', warranty: '2026-10-19' }, { name: 'Lama', kind: 'goods', warranty: '2026-09-01' },
      { name: 'Jauh', kind: 'goods', warranty: '2027-06-01' }, { name: 'Cicilan', kind: 'debt', warranty: '2026-10-22' }, { name: 'Tanpa', kind: 'goods', warranty: '' },
    ], oct19, 30);
    expect(w).toEqual([{ name: 'TV', date: '2026-10-19', daysLeft: 0 }, { name: 'HP', date: '2026-10-25', daysLeft: 6 }]);
    expect(assetProblems([{ name: 'X', kind: 'goods', unit_value: 1, warranty: '12/2026' }])).toEqual(['item 1: warranty must be a date']);
    expect(warrantyNotice(w, 'en').body).toBe('TV · today\nHP · in 6 days');
  });
});

describe('the yearly-plan rule', () => {
  it('a yearly-sounding word counts only in the merchant name, not in a transfer\'s notes', () => {
    const found = findYearly([
      { date: '2025-12-30', amount: 500000, description: 'BUDI SANTOSO', details: 'iuran tahunan keluarga' },
      { date: '2026-02-14', amount: 150000, description: 'NIAGAHOSTER DOMAIN', details: '' },
    ], { today: oct19 });
    expect(found.map((f) => f.name)).toEqual(['NIAGAHOSTER DOMAIN']);
  });
  it('plans already saved that were only a guess without a yearly word in the name no longer show', () => {
    const store = memoryStore({ yearly_subs: JSON.stringify([
      { key: 'budi santoso', name: 'BUDI SANTOSO', amount: 500000, lastDate: '2025-12-30', nextDate: '2026-12-30', guess: true },
      { key: 'niagahoster domain', name: 'NIAGAHOSTER DOMAIN', amount: 150000, lastDate: '2026-02-14', nextDate: '2027-02-14', guess: true },
      { key: 'icloud', name: 'APPLE.COM/BILL', amount: 199000, lastDate: '2025-11-20', nextDate: '2026-11-20', guess: false },
    ]) });
    const names = createApi(store, { now: () => oct19 }).dashboard({}).recurring.items.map((i) => i.name);
    expect(names).toContain('NIAGAHOSTER DOMAIN');
    expect(names).toContain('APPLE.COM/BILL'); // a receipt said so: kept
    expect(names).not.toContain('BUDI SANTOSO');
  });
});

describe('emails and the calendar', () => {
  it('the monthly email says the backup is attached', () => {
    const r = { month: '2026-09', before: '2026-08', income: 0, expense: 0, net: 0, beforeIncome: 0, beforeExpense: 0, savingRate: null, categories: [], budgets: [], goals: [] };
    expect(monthlyEmail(r, { lang: 'id', backup: true }).html).toContain('Cadangan semua transaksi terlampir');
    expect(monthlyEmail(r, { lang: 'id' }).html).not.toContain('Cadangan');
  });
  it('claim deadlines and warranty ends go to the calendar', () => {
    const keys = calendarEvents({
      plans: [], recurringItems: [], cards: [], payday: 28, today: oct19, lang: 'id',
      claims: [{ description: 'Dokter', amount: 300000, due: '2026-10-25', daysLeft: 6 }], warranties: [{ name: 'Laptop', date: '2026-11-02', daysLeft: 14 }],
    });
    expect(keys).toContain('2026-10-25|Batas klaim · Dokter Rp300.000');
    expect(keys).toContain('2026-11-02|Garansi habis · Laptop');
  });
});

describe('the small things', () => {
  it('the price status as numbers: how many were asked for, how many found, why not', () => {
    expect(parsePriceStatus('2026-10-19 09:59 UTC: 0 of 1 priced')).toEqual({ at: '2026-10-19 09:59', n: 0, tried: 1, failed: 1, reasons: [] });
    expect(parsePriceStatus('2026-10-19 09:59 UTC: 1 of 2 priced; emas: harga Antam tidak terbaca; harga-emas.org HTTP 403')).toMatchObject({ failed: 1, reasons: ['emas: harga Antam tidak terbaca', 'harga-emas.org HTTP 403'] });
    expect(parsePriceStatus('2026-10-19 09:08 UTC: 1 of 1 priced').failed).toBe(0);
    expect(parsePriceStatus('')).toBeNull();
    expect(parsePriceStatus('something else')).toBeNull();
  });
  it('the API says who has not connected their Gmail, and how the last price run went', () => {
    const store = memoryStore({ partner_name: 'Dewi', partner_email: 'dewi@example.com', owner_email: 'me@example.com', price_status: '2026-10-19 09:59 UTC: 0 of 1 priced; harga-emas.org HTTP 403' });
    store.t[TABS.connections] = [{ gmail: 'me@example.com', last_sync: '2026-10-19T01:00:00.000Z', last_status: 'live ok' }];
    const api = createApi(store, { now: () => oct19, myEmail: 'me@example.com' });
    expect(api.bootstrap().notConnected).toEqual(['Dewi']);
    expect(api.settings().prices).toMatchObject({ failed: 1, reasons: ['harga-emas.org HTTP 403'] });
    store.t[TABS.connections].push({ gmail: 'dewi@example.com', last_sync: '2026-10-19T02:00:00.000Z', last_status: 'live ok' });
    expect(api.bootstrap().notConnected).toEqual([]);
    expect(createApi(memoryStore(), { now: () => oct19 }).bootstrap().notConnected).toEqual([]); // nobody with an address set: nothing to say
  });
  it('the weekly email shows what each person spent, only with two people', () => {
    const rows = [
      { id: 1, date: '2026-10-14', direction: 'out', amount: 100000, category: 'Makan', status: 'approved', owner: 'Me' },
      { id: 2, date: '2026-10-15', direction: 'out', amount: 40000, category: 'Makan', status: 'approved', owner: 'Dewi' },
      { id: 3, date: '2026-10-15', direction: 'in', amount: 500000, category: 'Gaji', status: 'approved', owner: 'Dewi' },
    ];
    const input = { rows, cats: { income: ['Gaji'], expense: ['Makan'] }, budgets: [], recurring: { items: [] }, today: oct19 };
    const s = weeklySummary({ ...input, members: ['Me', 'Dewi'] });
    expect(s.byPerson).toEqual([{ name: 'Me', spent: 100000, income: 0 }, { name: 'Dewi', spent: 40000, income: 500000 }]);
    const html = summaryEmail(s, { lang: 'id' }).html;
    expect(html).toContain('Per orang minggu lalu');
    expect(html).toContain('Dewi');
    expect(weeklySummary({ ...input, members: ['Me'] }).byPerson).toEqual([]);
    expect(summaryEmail(weeklySummary(input), { lang: 'id' }).html).not.toContain('Per orang');
  });
});
