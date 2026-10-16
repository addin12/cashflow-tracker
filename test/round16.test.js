// Round 16: notes by email, "the usual", bills due soon, more asset kinds, event budgets on tags,
// closing the day.
import { describe, expect, it } from 'vitest';
import { notesFromEmail, usualEntries } from '../src/core/quick.js';
import { upcomingBills, netWorth } from '../src/core/wealth.js';
import { closeDayEmail, billsEmail } from '../src/core/notices.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

describe('notes by email', () => {
  it('lines starting with "catat"/"log", or the whole body under a "catat" subject; quotes and signatures left out', () => {
    expect(notesFromEmail('catat kopi 28rb gopay', '')).toEqual(['kopi 28rb gopay']);
    expect(notesFromEmail('Catat', 'kopi 28rb gopay\nparkir 5rb cash\n\n--\nSent from my phone')).toEqual(['kopi 28rb gopay', 'parkir 5rb cash']);
    expect(notesFromEmail('Pengeluaran', 'catat: makan 25rb\nhalo\n> catat lama 5rb\nLog bensin 50rb')).toEqual(['makan 25rb', 'bensin 50rb']);
    expect(notesFromEmail('Re: catatan rapat', 'besok jam 9')).toEqual([]);
  });
});

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-10-01', direction: 'out', amount: 28000, stream: 'GoPay', category: 'Makan', status: 'approved', description: 'Kopi', source: 'manual' },
      { id: 'b', date: '2026-10-03', direction: 'out', amount: 28000, stream: 'GoPay', category: 'Makan', status: 'approved', description: 'kopi', source: 'note' },
      { id: 'c', date: '2026-10-05', direction: 'out', amount: 30000, stream: 'GoPay', category: 'Makan', status: 'approved', description: 'Kopi', source: 'manual' },
      { id: 'd', date: '2026-10-05', direction: 'out', amount: 5000, stream: 'Cash', category: 'Parkir', status: 'approved', description: 'Parkir', source: 'manual' },
      { id: 'e', date: '2026-10-06', direction: 'out', amount: 1500000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'Hotel #Bali', source: 'email' },
      { id: 'f', date: '2026-10-08', direction: 'out', amount: 500000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'Makan', details: '#bali', source: 'email' },
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 }, { stream: 'GoPay', type: 'Spending', owner: 'Me', opening_balance: 0 }, { stream: 'Cash', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [{ pattern: 'KOPI', category: 'Makan' }], [TABS.inboxLog]: [], [TABS.connections]: [],
    [TABS.owed]: [], [TABS.plans]: [{ id: 'p1', name: 'Kos', amount: 1500000, direction: 'out', stream: 'Cash', day: 18, last: '', active: true }], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan', 'Parkir'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct16 = () => new Date(2026, 9, 16, 20, 0);

describe('notes become transactions', () => {
  it('complete notes are saved; others wait in Review; notes without an amount are skipped', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    const r = api.addNotes({ gmailId: 'g9', sentMs: new Date(2026, 9, 16, 12).getTime(), notes: ['kopi 28rb gopay #pagi', 'bensin 50rb', 'kemarin parkir 5rb cash', 'halo'] });
    expect(r).toEqual({ added: 3, pending: 2, skipped: ['halo'] });
    const rows = store.t[TABS.transactions].filter((x) => x.gmail_id === 'g9');
    expect(rows.map((x) => [x.description, x.amount, x.stream, x.category, x.status, x.date, x.source])).toEqual([
      ['Kopi', 28000, 'GoPay', 'Makan', 'approved', '2026-10-16', 'note'],
      ['Bensin', 50000, '', '', 'pending', '2026-10-16', 'note'],
      ['Parkir', 5000, 'Cash', '', 'pending', '2026-10-15', 'note'],
    ]);
    expect(rows[0].details).toBe('Catatan #pagi');
  });
});

describe('the usual', () => {
  it('things typed by hand at least twice lately, with the most common amount', () => {
    const store = memoryStore();
    expect(usualEntries(store.read(TABS.transactions), { today: oct16() })).toEqual([
      { description: 'Kopi', count: 3, amount: 28000, stream: 'GoPay', category: 'Makan', direction: 'out' },
    ]);
    expect(createApi(store, { now: oct16 }).bootstrap().usual).toHaveLength(1);
  });
});

describe('bills due soon', () => {
  it('planned transactions and subscriptions in the next week, soonest first, one per name', () => {
    const b = upcomingBills(
      [{ name: 'Kos', amount: 1500000, direction: 'out', day: 18, active: true }, { name: 'Gaji', amount: 9, direction: 'in', day: 17 }, { name: 'Iuran', amount: 50000, direction: 'out', day: 30 }],
      [{ name: 'SPOTIFY', amount: 54990, nextDate: '2026-10-17', daysLeft: 1 }, { name: 'kos', amount: 1, nextDate: '2026-10-18', daysLeft: 2 }],
      new Date(2026, 9, 16),
    );
    expect(b.map((x) => [x.name, x.daysLeft, x.kind])).toEqual([['SPOTIFY', 1, 'sub'], ['Kos', 2, 'plan']]);
    expect(billsEmail(b.slice(0, 1), { lang: 'id' }).subject).toBe('Cashflow: tagihan besok Rp54.990');
  });
});

describe('net worth by kind', () => {
  it('paylater counts as debt; each kind has its total', () => {
    const w = netWorth([{ balance: 1000000 }], [
      { kind: 'deposit', unit_value: 5000000 }, { kind: 'fund', qty: 2, unit_value: 1000000 }, { kind: 'paylater', unit_value: 750000 }, { kind: 'receivable', unit_value: 300000 },
    ]);
    expect(w).toMatchObject({ owned: 7300000, debts: 750000, total: 7550000, byKind: { deposit: 5000000, fund: 2000000, paylater: 750000, receivable: 300000 } });
  });
});

describe('event budgets and closing the day', () => {
  it('a #tag budget shows what was spent against it, across months', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct16 });
    api.setTagBudget({ tag: '#Bali', amount: 1800000 });
    expect(api.dashboard({}).events).toEqual([{ tag: 'bali', budget: 1800000, out: 2000000, in: 0, count: 2, first: '2026-10-06', last: '2026-10-08' }]);
    api.setTagBudget({ tag: 'bali', amount: 0 });
    expect(api.dashboard({}).events).toEqual([]);
    expect(() => api.setTagBudget({ tag: 'two words', amount: 5 })).toThrow(/one word/);
  });

  it('closing days builds a streak; an open today keeps yesterday\'s streak; reopening undoes it', () => {
    const store = memoryStore({ closed_days: '2026-10-15,2026-10-14,2026-10-12' });
    const api = createApi(store, { now: oct16 });
    expect(api.review().day).toEqual({ date: '2026-10-16', closed: false, streak: 2, byHand: 0 });
    expect(api.closeDay({})).toMatchObject({ closed: true, streak: 3 });
    expect(api.reopenDay({})).toMatchObject({ closed: false, streak: 2 });
    expect(closeDayEmail({ lang: 'id' }).subject).toBe('Cashflow: ada pengeluaran tunai hari ini?');
  });
});
