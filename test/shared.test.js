// Shared costs (#bersama) between the two of you: who paid, who owes whom, settle-ups, the tag button.
import { describe, expect, it } from 'vitest';
import { isShared, toggleSharedTag, sharedBalance } from '../src/core/shared.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const row = (id, owner, amount, details = '#bersama', extra = {}) => ({ id, owner, amount, details, description: 'Belanja', direction: 'out', status: 'approved', date: '2026-10-10', category: 'Makan', stream: 'BCA', ...extra });

describe('the tag', () => {
  it('found in the name or the notes, as a whole word; toggled on and off', () => {
    expect(isShared({ details: 'makan malam #bersama' })).toBe(true);
    expect(isShared({ description: 'Listrik #BERSAMA' })).toBe(true);
    expect(isShared({ details: '#bersamaan' })).toBe(false);
    expect(isShared({ details: 'bersama' })).toBe(false);
    expect(isShared({ details: 'a#bersama' })).toBe(false);
    expect(toggleSharedTag('makan malam')).toBe('makan malam #bersama');
    expect(toggleSharedTag('')).toBe('#bersama');
    expect(toggleSharedTag('makan #bersama enak')).toBe('makan enak');
    expect(toggleSharedTag(toggleSharedTag('x #trip'))).toBe('x #trip');
  });
});

describe('who owes whom', () => {
  const people = ['Me', 'Dewi'];
  it('the one who paid more is owed the difference; half each by default', () => {
    const b = sharedBalance({ rows: [row(1, 'Me', 300000), row(2, 'Dewi', 100000)], people });
    expect(b).toMatchObject({ count: 2, total: 400000, owes: { from: 'Dewi', to: 'Me', amount: 100000 } });
    expect(b.people).toEqual([{ name: 'Me', paid: 300000, share: 200000, pct: 50 }, { name: 'Dewi', paid: 100000, share: 200000, pct: 50 }]);
  });
  it('another split; the other way round; even', () => {
    expect(sharedBalance({ rows: [row(1, 'Me', 300000), row(2, 'Dewi', 100000)], people, pct: 60 }).owes).toEqual({ from: 'Dewi', to: 'Me', amount: 60000 });
    expect(sharedBalance({ rows: [row(1, 'Dewi', 500000)], people }).owes).toEqual({ from: 'Me', to: 'Dewi', amount: 250000 });
    expect(sharedBalance({ rows: [row(1, 'Me', 100000), row(2, 'Dewi', 100000)], people }).owes).toBeNull();
    expect(sharedBalance({ rows: [], people })).toMatchObject({ count: 0, total: 0, owes: null });
  });
  it('only approved money out with the tag counts; someone else\'s row is the first person\'s; settle-ups count against it', () => {
    const rows = [row(1, 'Me', 300000), row(2, 'Dewi', 100000), row(3, 'Dewi', 999, '', {}), row(4, 'Dewi', 777, '#bersama', { status: 'pending' }), row(5, 'Dewi', 555, '#bersama', { direction: 'in' }), row(6, '', 100000)];
    const b = sharedBalance({ rows, people });
    expect(b.count).toBe(3);
    expect(b.people[0].paid).toBe(400000); // row 6 has no owner: the first person's
    expect(b.owes.amount).toBe(150000);
    // Dewi pays Me 100.000: 50.000 left. Me pays Dewi 20.000 back by mistake: 70.000.
    const one = sharedBalance({ rows, people, settlements: [{ id: 's1', date: '2026-10-11', from: 'Dewi', to: 'Me', amount: 100000 }] });
    expect(one.owes).toEqual({ from: 'Dewi', to: 'Me', amount: 50000 });
    const two = sharedBalance({ rows, people, settlements: [{ id: 's1', from: 'Dewi', to: 'Me', amount: 100000 }, { id: 's2', from: 'Me', to: 'Dewi', amount: 20000 }] });
    expect(two.owes.amount).toBe(70000);
    expect(two.settlements.map((s) => s.id)).toEqual(['s2', 's1']); // newest first
    const paidInFull = sharedBalance({ rows, people, settlements: [{ id: 's1', from: 'Dewi', to: 'Me', amount: 150000 }] });
    expect(paidInFull.owes).toBeNull();
  });
  it('what was shared in a range, for "this month"', () => {
    const rows = [row(1, 'Me', 100000, '#bersama', { date: '2026-10-05' }), row(2, 'Me', 50000, '#bersama', { date: '2026-09-05' })];
    expect(sharedBalance({ rows, people, range: { from: '2026-10-01', to: '2026-10-31' } })).toMatchObject({ total: 150000, monthTotal: 100000 });
  });
});

function memoryStore(cfgExtra = {}, rows = []) {
  const t = {
    [TABS.transactions]: rows,
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 }, { stream: 'BCA Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct20 = () => new Date(2026, 9, 20, 10);

describe('the API', () => {
  const seat = (extra) => memoryStore(extra, [row('a', 'Me', 300000), row('b', 'Dewi', 100000)]);
  it('the overview has the balance; with one person there is none', () => {
    const api = createApi(seat(), { now: oct20, isOwner: true, meName: 'Me' });
    expect(api.dashboard({}).shared).toMatchObject({ count: 2, total: 400000, owes: { from: 'Dewi', to: 'Me', amount: 100000 } });
    expect(createApi(seat({ partner_email: '' }), { now: oct20 }).dashboard({}).shared).toBeNull();
    expect(api.settings().household.split).toBe(50);
  });
  it('either of you settles all or part of it; too much, or nothing owed, is refused; a mistake can be undone', () => {
    const store = seat();
    const he = createApi(store, { now: oct20, isOwner: true, meName: 'Me' });
    const she = createApi(store, { now: oct20, isOwner: false, meName: 'Dewi' });
    expect(() => she.settleUp({ amount: 100001 })).toThrow(/at most 100000/);
    expect(() => she.settleUp({ amount: 0 })).toThrow(/above 0/);
    const first = she.settleUp({ amount: 40000 });
    expect(JSON.parse(store.cfg.settlements)).toEqual([expect.objectContaining({ id: first.id, date: '2026-10-20', from: 'Dewi', to: 'Me', amount: 40000, by: 'Dewi' })]);
    expect(he.dashboard({}).shared.owes.amount).toBe(60000);
    he.settleUp({}); // the rest
    expect(he.dashboard({}).shared.owes).toBeNull();
    expect(() => he.settleUp({})).toThrow(/even/);
    he.undoSettlement({ id: first.id });
    expect(he.dashboard({}).shared.owes.amount).toBe(40000);
    expect(() => he.undoSettlement({ id: 'nope' })).toThrow(/not found/);
    expect(() => createApi(seat({ partner_email: '' }), { now: oct20 }).settleUp({})).toThrow(/no partner/);
  });
  it('the split is part of the household settings, 1 to 99 percent', () => {
    const store = seat();
    const he = createApi(store, { now: oct20, isOwner: true, meName: 'Me', myEmail: 'me@example.com' });
    const people = { owner: { name: 'Me', emails: 'me@example.com' }, partner: { name: 'Dewi', emails: 'dewi@example.com' } };
    expect(() => he.saveHousehold({ ...people, split: 0 })).toThrow(/1-99/);
    expect(() => he.saveHousehold({ ...people, split: 100 })).toThrow(/1-99/);
    he.saveHousehold({ ...people, split: 60 });
    expect(store.cfg.shared_split).toBe(60);
    expect(he.dashboard({}).shared.owes.amount).toBe(60000);
    he.saveHousehold(people); // no split given: it stays
    expect(store.cfg.shared_split).toBe(60);
  });
});
