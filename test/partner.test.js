// Two people in one app: each inbox's emails go to that person's own accounts, money between
// the two is a transfer, Kita / Aku / Dia views, and only the owner names the partner.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEmail } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';
import { filterTransactions } from '../src/core/app.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

function fixture(file, name) {
  const text = readFileSync(new URL(`./fixtures/emails/${file}`, import.meta.url), 'utf8');
  const chunk = text.split(/^=== /m).find((c) => c.startsWith(`${name}\n`) || c.startsWith(`${name}\r\n`));
  const [head, ...rest] = chunk.split(/^---$/m);
  const h = Object.fromEntries(head.split(/\r?\n/).slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  const e = { id: name, from: h.from, subject: h.subject, epochMs: Number(h.epoch), body: rest.join('---'), isHtml: false };
  return { id: e.id, from: e.from, epochMs: e.epochMs, gmail: 'inbox@example.com', result: parseEmail(e) };
}

// "Dewi" (the fixture's beneficiary) stands in for the partner.
const ACCOUNTS = [
  { stream: 'BCA', type: 'Spending', institution: 'BCA', match_hint: '1234567856', owner: 'Me' },
  { stream: 'GoPay', type: 'Spending', institution: 'GoPay', match_hint: '', owner: 'Me' },
  { stream: 'BCA Dewi', type: 'Spending', institution: 'BCA', match_hint: '6040000003', owner: 'Dewi' },
];
const config = (owner) => ({ owner, ownerNames: ['BUDI SANTOSO PUTRA', 'DEWI LESTARI'], categories: { transfer: 'trf ke bank lain', fee: 'Biaya Admin', dividend: 'Dividen & Bunga' } });
const plan = (emails, owner, existing = []) => planSync({ emails, existing, accounts: ACCOUNTS, rules: [], config: config(owner), nowIso: '2026-10-16T10:00:00Z' });

describe('two inboxes', () => {
  it('money to the partner is a transfer: one leg each, each on its owner', () => {
    const { add } = plan([fixture('bca.txt', 'bca-transfer-bca')], 'Me');
    expect(add.map((r) => [r.stream, r.direction, r.category, r.owner])).toEqual([
      ['BCA', 'out', 'trf ke bank lain', 'Me'], ['BCA Dewi', 'in', 'trf ke bank lain', 'Dewi'],
    ]);
  });
  it("an email in the partner's inbox only matches the partner's accounts", () => {
    const { add } = plan([fixture('bca.txt', 'bca-qris')], 'Dewi');
    expect(add[0]).toMatchObject({ stream: 'BCA Dewi', owner: 'Dewi' }); // her only BCA, never the owner's
    expect(plan([fixture('bca.txt', 'bca-qris')], 'Me').add[0]).toMatchObject({ stream: 'BCA', owner: 'Me' });
  });
  it('the list filters by owner', () => {
    const rows = [{ id: 1, owner: 'Me', date: '2026-10-01' }, { id: 2, owner: 'Dewi', date: '2026-10-02' }];
    expect(filterTransactions(rows, { owner: 'Dewi' }).rows.map((r) => r.id)).toEqual([2]);
  });
});

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-10-05', direction: 'out', amount: 100000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', owner: 'Me' },
      { id: 'b', date: '2026-10-06', direction: 'out', amount: 40000, stream: 'BCA Dewi', category: 'Makan', status: 'approved', description: 'KOPI', owner: 'Dewi' },
    ],
    [TABS.accounts]: ACCOUNTS.map((a) => ({ ...a, opening_balance: 500000 })),
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [{ gmail: 'me@example.com' }], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, partner_email: 'dewi@example.com', partner_name: 'Dewi', ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, ups) => ups.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)), remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct16 = () => new Date(2026, 9, 16, 10);

describe('Kita / Aku / Dia', () => {
  it('the household, or one person: their rows and their accounts', () => {
    const api = createApi(memoryStore(), { now: oct16 });
    expect(api.bootstrap()).toMatchObject({ me: 'Me', members: ['Me', 'Dewi'] });
    expect(api.dashboard({}).summary.expense).toBe(140000);
    const dewi = api.dashboard({ owner: 'Dewi' });
    expect(dewi.summary.expense).toBe(40000);
    expect(dewi.balances.map((b) => b.stream)).toEqual(['BCA Dewi']);
  });
  it('the partner adds rows as themselves; only one person when there is no partner', () => {
    const store = memoryStore();
    createApi(store, { now: oct16, meName: 'Dewi' }).add({ kind: 'out', amount: 5000, category: 'Makan', stream: 'BCA Dewi', date: '2026-10-16', description: 'Parkir' });
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ owner: 'Dewi', updated_by: 'Dewi' });
    expect(createApi(memoryStore({ partner_email: '' }), { now: oct16 }).bootstrap().members).toEqual(['Me']);
  });
});

describe('the household', () => {
  const seat = (extra) => memoryStore({ partner_email: '', partner_name: '', owner_email: 'me@example.com', ...extra });
  it('names, emails and the rest are checked, and you cannot lock yourself out', () => {
    const store = seat();
    let shared = 0;
    const me = createApi(store, { now: oct16, isOwner: true, myEmail: 'me@example.com', share: () => { shared += 1; } });
    const ok = { name: 'Me', emails: 'me@example.com' };
    expect(() => me.saveHousehold({ owner: ok, partner: { name: 'Dewi', emails: 'not-an-email' } })).toThrow(/not an email/);
    expect(() => me.saveHousehold({ owner: ok, partner: { name: '', emails: 'dewi@example.com' } })).toThrow(/partner name: required/);
    expect(() => me.saveHousehold({ owner: ok, partner: { name: 'me', emails: 'dewi@example.com' } })).toThrow(/must differ/);
    expect(() => me.saveHousehold({ owner: ok, partner: { name: 'Dewi', emails: 'me@example.com' } })).toThrow(/one person only/);
    expect(() => me.saveHousehold({ owner: { name: 'Me', emails: 'other@example.com' }, partner: { name: 'Dewi', emails: 'dewi@example.com' } })).toThrow(/lose your own access/);
    expect(() => me.saveHousehold({ owner: { name: '', emails: 'me@example.com' }, partner: {} })).toThrow(/owner name: required/);
    me.saveHousehold({ owner: { ...ok, bankNames: 'BUDI SANTOSO' }, partner: { name: 'Dewi', emails: ' Dewi@Example.com, dewi.work@example.com, dewi@example.com', bankNames: 'DEWI LESTARI' } });
    expect(store.cfg).toMatchObject({ owner_email: 'me@example.com', owner_bank_names: 'BUDI SANTOSO', partner_name: 'Dewi', partner_email: 'dewi@example.com, dewi.work@example.com', partner_bank_names: 'DEWI LESTARI' });
    expect(shared).toBe(1);
    const h = me.settings().household;
    expect(h).toMatchObject({ me: 'Me', myRole: 'owner' });
    expect(h.members.map((m) => [m.role, m.name, m.emails.length])).toEqual([['owner', 'Me', 1], ['partner', 'Dewi', 2]]);
  });
  it('either of you can change it; a new name carries the rows and accounts along', () => {
    const store = seat({ partner_email: 'dewi@example.com', partner_name: 'Dewi' });
    const she = createApi(store, { now: oct16, isOwner: false, meName: 'Dewi', myEmail: 'dewi@example.com' });
    const r = she.saveHousehold({ owner: { name: 'Budi', emails: 'me@example.com' }, partner: { name: 'Dewi', emails: 'dewi@example.com' } });
    expect(r).toEqual({ ok: true, renamed: 1 });
    expect(store.t[TABS.transactions].map((x) => [x.id, x.owner])).toEqual([['a', 'Budi'], ['b', 'Dewi']]);
    expect(store.t[TABS.accounts].map((x) => [x.stream, x.owner])).toEqual([['BCA', 'Budi'], ['GoPay', 'Budi'], ['BCA Dewi', 'Dewi']]);
    expect(store.cfg.owner_name).toBe('Budi');
    expect(she.settings().household).toMatchObject({ me: 'Dewi', myRole: 'partner', isOwner: false });
  });
});
