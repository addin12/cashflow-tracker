// Past top-ups to a wallet that is now an account become transfers into it, when asked: its balance and its own spending are then right.
import { describe, expect, it } from 'vitest';
import { convertibleTopups, topupsByWallet } from '../src/core/transfers.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const row = (o) => ({ id: 'r', date: '2026-11-05', time: '20:15:00', owner: 'Dewi', stream: 'BRI Dewi', direction: 'out', amount: 100000, category: 'Belanja', description: 'Top-up OVO', status: 'approved', transfer_id: '', ref_no: 'R1', ...o });
const ACCOUNTS = [{ stream: 'BRI Dewi', institution: 'BRI', owner: 'Dewi' }, { stream: 'OVO Dewi', institution: 'OVO', owner: 'Dewi' }, { stream: 'DANA Dewi', institution: 'DANA', owner: 'Dewi' }];

describe('convertibleTopups', () => {
  it('finds top-ups, in any spelling, to a wallet that is one of the person\'s accounts', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b', description: 'Top up OVO' }), row({ id: 'c', description: 'TOP-UP DANA', amount: 5 }), row({ id: 'd', description: 'topup ovo' })];
    expect(convertibleTopups(rows, ACCOUNTS).map((x) => [x.id, x.wallet, x.institution])).toEqual([['a', 'OVO Dewi', 'OVO'], ['b', 'OVO Dewi', 'OVO'], ['c', 'DANA Dewi', 'DANA'], ['d', 'OVO Dewi', 'OVO']]);
  });
  it('leaves out everything that is not a plain recorded top-up', () => {
    const none = [
      row({ id: '1', direction: 'in' }), row({ id: '2', status: 'ignored' }), row({ id: '3', transfer_id: 't1' }),
      row({ id: '5', description: 'Biaya: Top-up OVO' }), row({ id: '6', description: 'Top-up Warung' }), row({ id: '7', description: 'Top-up' }), row({ id: '8', stream: 'OVO Dewi' }),
    ];
    expect(convertibleTopups(none, ACCOUNTS)).toEqual([]);
  });
  it('a top-up already in the transfer category, with no wallet side, is offered too (its spending is already out; the wallet side is missing)', () => {
    expect(convertibleTopups([row({ id: 'k', category: 'trf' })], ACCOUNTS)).toHaveLength(1);
  });
  it('needs exactly one account of that wallet that is the person\'s: none or two is not decided for them', () => {
    expect(convertibleTopups([row()], [ACCOUNTS[0]])).toEqual([]); // no OVO account yet
    expect(convertibleTopups([row()], [...ACCOUNTS, { stream: 'OVO 2', institution: 'OVO', owner: 'Dewi' }])).toEqual([]);
    expect(convertibleTopups([row()], [...ACCOUNTS, { stream: 'OVO Me', institution: 'OVO', owner: 'Me' }])).toHaveLength(1); // another person's wallet is not hers
  });
  it('counts per wallet, the biggest first', () => {
    const list = convertibleTopups([row({ id: 'a' }), row({ id: 'b', amount: 50000 }), row({ id: 'c', description: 'Top-up DANA', amount: 300000 })], ACCOUNTS);
    expect(topupsByWallet(list)).toEqual([{ wallet: 'DANA Dewi', institution: 'DANA', count: 1, total: 300000 }, { wallet: 'OVO Dewi', institution: 'OVO', count: 2, total: 150000 }]);
  });
});

function store(rows, accounts = ACCOUNTS) {
  const t = {
    [TABS.transactions]: rows, [TABS.accounts]: accounts.map((a) => ({ type: 'Spending', opening_balance: 0, match_hint: '', ...a })),
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.assets]: [], [TABS.plans]: [],
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', cat_transfer: 'trf' };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append(tab, r) { t[tab].push(...r.map((x) => ({ ...x }))); },
    update(tab, changes) { for (const c of changes) Object.assign(t[tab].find((r) => r.id === c.id), c.changes); },
    remove() {}, replace() {}, config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {},
  };
}
const apiFor = (s, name, isOwner) => createApi(s, { now: () => new Date(2026, 10, 10, 10), isOwner, meName: name, myEmail: `${name.toLowerCase()}@example.com` });

describe('converting through the API', () => {
  it('is offered to the person whose top-ups they are, per wallet, and not to anyone else', () => {
    const s = store([row({ id: 'a' }), row({ id: 'b', amount: 50000 })]);
    expect(apiFor(s, 'Dewi', false).review().topups).toEqual([{ wallet: 'OVO Dewi', institution: 'OVO', count: 2, total: 150000 }]);
    expect(apiFor(s, 'Me', true).review().topups).toEqual([]);
  });
  it('turns the bank rows into transfers and gives the wallet the matching rows, once', () => {
    const s = store([row({ id: 'a' }), row({ id: 'b', amount: 50000, date: '2026-11-06', time: '' })]);
    const api = apiFor(s, 'Dewi', false);
    expect(api.convertTopups({ wallet: 'OVO Dewi' })).toEqual({ ok: true, converted: 2 });
    const rows = s.t[TABS.transactions];
    expect(rows.find((r) => r.id === 'a')).toMatchObject({ category: 'trf', transfer_id: 'tp_a', status: 'approved', stream: 'BRI Dewi', direction: 'out' });
    expect(rows.find((r) => r.id === 'a_w')).toMatchObject({ stream: 'OVO Dewi', direction: 'in', amount: 100000, category: 'trf', transfer_id: 'tp_a', status: 'approved', date: '2026-11-05', time: '20:15:00', owner: 'Dewi', description: 'Top-up dari BRI Dewi', source: 'app', ref_no: 'R1' });
    expect(rows.find((r) => r.id === 'b_w')).toMatchObject({ amount: 50000, time: '' });
    expect(rows).toHaveLength(4);
    expect(api.review().topups).toEqual([]);
    expect(() => api.convertTopups({ wallet: 'OVO Dewi' })).toThrow(/no top-ups/);
    expect(rows).toHaveLength(4); // nothing happens twice
  });
  it('converts only the wallet asked for, or all when none is named', () => {
    const rows = [row({ id: 'a' }), row({ id: 'c', description: 'Top-up DANA', amount: 7 })];
    const s = store(rows);
    apiFor(s, 'Dewi', false).convertTopups({ wallet: 'DANA Dewi' });
    expect(s.t[TABS.transactions].map((r) => r.id)).toEqual(['a', 'c', 'c_w']);
    apiFor(s, 'Dewi', false).convertTopups();
    expect(s.t[TABS.transactions].map((r) => r.id)).toEqual(['a', 'c', 'c_w', 'a_w']);
  });
  it('does not touch the other person\'s top-ups, and says so when there is nothing to do', () => {
    const s = store([row({ id: 'a' })]);
    expect(() => apiFor(s, 'Me', true).convertTopups()).toThrow(/no top-ups/);
    expect(s.t[TABS.transactions]).toHaveLength(1);
  });
});
