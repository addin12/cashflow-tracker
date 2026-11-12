// The "ask" method of the app's API over a real store: a sentence in, an answer built from the household's own rows out, nothing written.
import { describe, expect, it } from 'vitest';
import { API_METHODS, createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const tx = (id, date, amount, category, description, owner = 'Me', extra = {}) => ({ id, date, time: '10:00', direction: 'out', amount, stream: 'BCA', category, status: 'approved', description, details: '', owner, source: 'manual', ...extra });
function store(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      tx('a', '2026-10-30', 40000, 'Makan', 'Bakso'), tx('b', '2026-10-29', 60000, 'Makan', 'Warung', 'Dewi'), tx('c', '2026-10-15', 100000, 'Parkir', 'Grab Bike'),
      tx('d', '2026-10-16', 999, 'Makan', 'Waiting', 'Me', { status: 'pending' }),
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [{ scope: '', category: 'Makan', monthly_budget: 300000 }], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan', 'Parkir'] });
  const writes = [];
  return {
    t, cfg, writes,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (...a) => writes.push(a), update: (...a) => writes.push(a), remove: (...a) => writes.push(a), replace: (...a) => writes.push(a),
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => writes.push([k, v]), slots: () => slots, setSlots() {},
  };
}
const NOW = () => new Date(2026, 9, 31, 12, 0); // Saturday 31 October 2026
const apiOf = (s, meName = 'Me') => createApi(s, { now: NOW, meName });

describe('api.ask', () => {
  it('is a method of the API', () => { expect(API_METHODS).toContain('ask'); });
  it('answers from the rows; "this month" is the calendar month, or the payday period (28 Oct to 27 Nov) when the app is set that way', () => {
    expect(apiOf(store()).ask({ text: 'berapa pengeluaran bulan ini' })).toMatchObject({ kind: 'spend', from: '2026-10-01', total: 200000, count: 3 });
    expect(apiOf(store({ summary_period: 'payday' })).ask({ text: 'berapa pengeluaran bulan ini' })).toMatchObject({ kind: 'spend', from: '2026-10-28', total: 100000, count: 2 });
  });
  it('"aku" is the person asking, and "dia" the other one', () => {
    expect(apiOf(store(), 'Me').ask({ text: 'pengeluaranku bulan ini' })).toMatchObject({ total: 140000 });
    expect(apiOf(store(), 'Dewi').ask({ text: 'pengeluaranku bulan ini' })).toMatchObject({ total: 60000 });
    expect(apiOf(store(), 'Me').ask({ text: 'pengeluaran dia bulan ini' })).toMatchObject({ total: 60000 });
  });
  it('budget and who-spends questions use the household\'s settings and people', () => {
    expect(apiOf(store()).ask({ text: 'sisa budget makan' })).toMatchObject({ kind: 'budget', items: [{ category: 'Makan', budget: 300000, spent: 100000, left: 200000 }] });
    expect(apiOf(store()).ask({ text: 'siapa paling banyak jajan bulan ini' })).toMatchObject({ kind: 'who', people: [{ name: 'Dewi', total: 60000 }, { name: 'Me', total: 40000 }] });
  });
  it('an unreadable question says so and hands over the names that exist (never amounts) for the AI', () => {
    const a = apiOf(store()).ask({ text: 'ceritakan lelucon' });
    expect(a).toMatchObject({ kind: 'unknown', context: { members: ['Me', 'Dewi'], me: 'Me', today: '2026-10-31' } });
    expect(a.context.categories.expense).toContain('Makan');
    expect(JSON.stringify(a.context)).not.toMatch(/40000|100000|Bakso/);
  });
  it('what the AI understood is checked, then answered like any other question', () => {
    const api = apiOf(store());
    const text = 'tolong hitung duit Dewi untuk makan bulan ini';
    expect(api.ask({ text, parsed: { intent: 'spend', period: 'this_month', category: 'Makan', person: 'Dewi' } })).toMatchObject({ kind: 'spend', total: 60000, drill: { category: 'Makan', owner: 'Dewi' } });
    expect(api.ask({ text, parsed: { intent: 'do something else' } })).toMatchObject({ kind: 'unknown' });
    expect(api.ask({ text: 'tolong hitung duit bulan ini', parsed: { intent: 'spend', category: 'Makan', person: 'Dewi' } })).toMatchObject({ total: 200000, drill: { category: '', owner: '' } }); // neither is in the question
  });
  it('writes nothing', () => {
    const s = store();
    const api = apiOf(s);
    for (const text of ['berapa pengeluaran bulan ini', 'tagihan minggu ini', 'cek langganan', 'tinjau minggu ini', 'ke mana uangnya']) api.ask({ text });
    expect(s.writes).toEqual([]);
  });
});
