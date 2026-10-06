// Round 3: split transactions, repeating charges, the weekly summary.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { recurringCharges } from '../src/core/recurring.js';
import { weeklySummary, summaryEmail } from '../src/core/summary.js';
import { TABS } from '../src/core/schema.js';

function memoryStore(rows) {
  const t = {
    [TABS.transactions]: rows,
    [TABS.accounts]: [{ stream: 'Mandiri', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.rules]: [], [TABS.budgets]: [{ category: 'Hobi', monthly_budget: 500000 }], [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28 };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Buku', 'Hobi', 'Belanja Online', 'Langganan Digital', 'Pulsa & Internet'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, updates) => updates.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, r) => { t[tab] = r; },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; },
    slots: () => slots, setSlots() {},
  };
}
const tx = (id, extra) => ({
  id, date: '2026-09-28', time: '20:51:00', owner: 'Me', stream: 'Mandiri', direction: 'out', amount: 960811, category: 'Belanja Online',
  description: 'Periplus Bookshop', details: 'Batman; Watchmen · Tokopedia order 1', source: 'email', gmail_id: 'g1', ref_no: '', status: 'approved', ...extra,
});

describe('split', () => {
  it('splits one payment into parts with their own category; the email row keeps its gmail_id', () => {
    const store = memoryStore([tx('t1')]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    api.split({ id: 't1', parts: [{ amount: 700000, category: 'Buku' }, { amount: 260811, category: 'Hobi', description: 'Sleeves' }] });
    const all = store.t[TABS.transactions];
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: 't1', amount: 700000, category: 'Buku', gmail_id: 'g1', status: 'approved' });
    expect(all[1]).toMatchObject({ id: 't1_s1', amount: 260811, category: 'Hobi', description: 'Sleeves', ref_no: 'split:t1', source: 'split', gmail_id: '', stream: 'Mandiri', date: '2026-09-28' });
  });

  it('splitting again replaces the parts; joining back restores the total', () => {
    const store = memoryStore([tx('t1')]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    api.split({ id: 't1', parts: [{ amount: 700000, category: 'Buku' }, { amount: 260811, category: 'Hobi' }] });
    api.split({ id: 't1', parts: [{ amount: 500000, category: 'Buku' }, { amount: 200000, category: 'Buku' }, { amount: 260811.0, category: 'Hobi' }] });
    expect(store.t[TABS.transactions].map((r) => [r.id, r.amount])).toEqual([['t1', 500000], ['t1_s1', 200000], ['t1_s2', 260811]]);
    api.unsplit({ id: 't1' });
    expect(store.t[TABS.transactions]).toHaveLength(1);
    expect(store.t[TABS.transactions][0].amount).toBe(960811);
  });

  it('refuses parts that do not add up, empty parts, unknown categories, and splitting a part', () => {
    const store = memoryStore([tx('t1'), tx('p', { ref_no: 'split:t1', amount: 1 })]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    expect(() => api.split({ id: 't1', parts: [{ amount: 1, category: 'Buku' }, { amount: 2, category: 'Hobi' }] })).toThrow(/add up to 960812/);
    expect(() => api.split({ id: 't1', parts: [{ amount: 960812, category: 'Buku' }] })).toThrow(/at least 2/);
    expect(() => api.split({ id: 't1', parts: [{ amount: 960812, category: 'Buku' }, { amount: 0, category: 'Hobi' }] })).toThrow(/above 0/);
    expect(() => api.split({ id: 't1', parts: [{ amount: 960811, category: 'Buku' }, { amount: 1, category: 'Nope' }] })).toThrow(/unknown category/);
    expect(() => api.split({ id: 'p', parts: [{ amount: 0.5, category: 'Buku' }, { amount: 0.5, category: 'Hobi' }] })).toThrow(/already a part/);
  });
});

describe('repeating charges', () => {
  const rows = [
    tx('a', { date: '2026-08-05', amount: 54990, description: 'SPOTIFY P1234', category: 'Langganan Digital', details: '' }),
    tx('b', { date: '2026-09-05', amount: 54990, description: 'SPOTIFY P5678', category: 'Langganan Digital', details: '' }),
    tx('c', { date: '2026-10-05', amount: 19000, description: 'Getcontact', category: 'Langganan Digital', details: 'Premium (Monthly), renews 5 November 2026 · Apple order X' }),
    tx('d', { date: '2026-09-18', amount: 150000, description: 'TELKOMSEL', category: 'Pulsa & Internet', details: '' }),
    tx('e', { date: '2026-09-03', amount: 526000, description: 'UDEMY', category: 'Buku' }),
    tx('f', { date: '2026-09-08', amount: 318000, description: 'UDEMY', category: 'Buku' }),
    tx('g', { date: '2026-06-01', amount: 99000, description: 'NETFLIX', category: 'Langganan Digital', details: '' }),
    tx('h', { date: '2026-09-20', amount: 5000000, description: 'Ke Tabungan', category: 'Transfer ke Bank Lain', details: '' }),
  ];
  const r = recurringCharges(rows, { today: new Date(2026, 9, 6), skipCategories: ['Penyesuaian', 'Transfer ke Bank Lain'] });

  it('finds monthly payees, receipts that say "renews", and bills by category; not one-off purchases', () => {
    expect(r.items.map((i) => [i.name, i.basis, i.nextDate, i.daysLeft])).toEqual([
      ['SPOTIFY P5678', 'monthly', '2026-10-05', -1],
      ['TELKOMSEL', 'category', '2026-10-18', 12],
      ['Getcontact', 'renews', '2026-11-05', 30],
    ]);
    expect(r.monthlyTotal).toBe(54990 + 19000 + 150000);
  });

  it('a charge expected long ago that never came counts as stopped', () => {
    expect(r.items.some((i) => i.name === 'NETFLIX')).toBe(false);
  });
});

describe('weekly summary', () => {
  const cats = { income: ['Gaji'], expense: ['Buku', 'Hobi'] };
  const rows = [
    tx('a', { date: '2026-09-29', amount: 100000, category: 'Buku', description: 'Gramedia' }),
    tx('b', { date: '2026-10-04', amount: 450000, category: 'Hobi', description: 'Board game' }),
    tx('c', { date: '2026-10-05', amount: 9000000, direction: 'in', category: 'Gaji', description: 'Gaji' }),
    tx('d', { date: '2026-09-20', amount: 70000, category: 'Buku', description: 'Old' }),
    tx('e', { date: '2026-10-03', amount: 30000, category: '', status: 'pending', description: 'Unknown' }),
  ];
  const s = weeklySummary({ rows, cats, budgets: [{ category: 'Hobi', monthly_budget: 500000 }], recurring: { items: [{ name: 'Spotify', amount: 54990, nextDate: '2026-10-08', daysLeft: 2, category: 'Langganan' }] }, today: new Date(2026, 9, 6) });

  it('adds up last week only, and lists what needs attention', () => {
    expect(s).toMatchObject({ from: '2026-09-29', to: '2026-10-05', spent: 550000, income: 9000000, count: 2, pending: 1 });
    expect(s.topCategories).toEqual([{ category: 'Hobi', amount: 450000 }, { category: 'Buku', amount: 100000 }]);
    expect(s.budgetAlerts).toEqual([{ category: 'Hobi', budget: 500000, spent: 450000, ratio: 0.9 }]);
    expect(s.upcoming.map((u) => u.name)).toEqual(['Spotify']);
  });

  it('becomes a readable email with the app link', () => {
    const e = summaryEmail(s, { appUrl: 'https://example.invalid/app', lang: 'id' });
    expect(e.subject).toBe('Ringkasan mingguan Cashflow · 2026-09-29 s.d. 2026-10-05');
    expect(e.html).toContain('Rp550.000');
    expect(e.html).toContain('1 transaksi menunggu dicek');
    expect(e.html).toContain('90% terpakai');
    expect(e.html).toContain('href="https://example.invalid/app"');
    expect(summaryEmail(s, { lang: 'en' }).subject).toMatch(/^Cashflow weekly summary/);
  });

  it('the setting can switch it off', () => {
    const store = memoryStore([]);
    const api = createApi(store, { now: () => new Date(2026, 9, 6) });
    expect(api.settings().config.weekly_email).toBe('on');
    api.saveConfig({ weekly_email: 'off' });
    expect(api.settings().config.weekly_email).toBe('off');
    expect(api.weekly()).toMatchObject({ spent: 0, pending: 0 });
  });
});
