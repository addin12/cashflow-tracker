// A transfer with only one side: found when exactly one row looks like the other side, joined only when the person asks.
import { describe, expect, it } from 'vitest';
import { linkableTransfers } from '../src/core/transfers.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const row = (o) => ({ id: 'r', date: '2026-11-02', time: '', owner: 'Dewi', stream: 'BCA Dewi', direction: 'out', amount: 4500000, category: 'trf ke bank lain', description: '', status: 'approved', transfer_id: '', ...o });
const lone = row({ id: 'a', stream: 'BRI Dewi', direction: 'in', transfer_id: 't1', description: 'Transfer Antar Rekening' });
const other = row({ id: 'b', stream: 'Mandiri Dewi', direction: 'out', time: '11:46:21', category: 'Lain' });

describe('linkableTransfers', () => {
  it('finds the other side: same amount, opposite direction, same owner, another account, within a day', () => {
    expect(linkableTransfers([lone, other])).toEqual([{ id: 'a', withId: 'b', amount: 4500000, date: '2026-11-02', stream: 'BRI Dewi', withStream: 'Mandiri Dewi' }]);
    expect(linkableTransfers([lone, { ...other, date: '2026-11-03' }])).toHaveLength(1);
  });
  it('says nothing when there is no candidate, or more than one (it must not guess)', () => {
    expect(linkableTransfers([lone])).toEqual([]);
    expect(linkableTransfers([lone, other, { ...other, id: 'c' }])).toEqual([]);
  });
  it('does not match a different amount, direction, owner, account or day, an ignored row, or a transfer that is complete', () => {
    for (const change of [{ amount: 4400000 }, { direction: 'in' }, { owner: 'Me' }, { stream: 'BRI Dewi' }, { date: '2026-11-05' }, { status: 'ignored' }, { transfer_id: 't1' }]) {
      expect(linkableTransfers([lone, { ...other, ...change }]), JSON.stringify(change)).toEqual([]);
    }
  });
});

function store(rows) {
  const t = {
    [TABS.transactions]: rows, [TABS.accounts]: [{ stream: 'BRI Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 0 }, { stream: 'Mandiri Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.assets]: [], [TABS.plans]: [],
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01' };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append(tab, r) { t[tab].push(...r.map((x) => ({ ...x }))); },
    update(tab, changes) { for (const c of changes) Object.assign(t[tab].find((r) => r.id === c.id), c.changes); },
    remove() {}, replace() {}, config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {},
  };
}
const apiFor = (s, name, isOwner) => createApi(s, { now: () => new Date(2026, 10, 4, 10), isOwner, meName: name, myEmail: `${name.toLowerCase()}@example.com` });

describe('linking through the API', () => {
  it('shows it to the person whose rows they are, and not to the other person', () => {
    const s = store([{ ...lone }, { ...other }]);
    expect(apiFor(s, 'Dewi', false).review().linkable).toHaveLength(1);
    expect(apiFor(s, 'Me', true).review().linkable).toEqual([]);
  });
  it('joins the two sides: the other row takes the transfer id and category, and the pair is complete', () => {
    const s = store([{ ...lone }, { ...other }]);
    const api = apiFor(s, 'Dewi', false);
    api.linkTransfer({ id: 'a', withId: 'b' });
    expect(s.t[TABS.transactions].find((r) => r.id === 'b')).toMatchObject({ transfer_id: 't1', category: 'trf ke bank lain', status: 'approved' });
    expect(api.review().linkable).toEqual([]);
  });
  it('refuses two rows that are not a match', () => {
    const s = store([{ ...lone }, { ...other }]);
    expect(() => apiFor(s, 'Dewi', false).linkTransfer({ id: 'a', withId: 'zzz' })).toThrow(/no longer be linked/);
  });
});
