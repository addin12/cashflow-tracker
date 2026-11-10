// Edges of the app's own rules found by mutation testing api.js: the day streak, "Tagih", plans, assets, the people on the settings page, the phone code.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

function memoryStore(cfgExtra = {}, extra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-10-05', direction: 'out', amount: 100000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', source: 'email', owner: 'Me' },
      { id: 'b', date: '2026-10-06T08:00:00', direction: 'out', amount: 40000, stream: 'BCA', category: 'Makan', status: 'approved', description: '', details: 'KOPI DETAIL', source: 'email', owner: 'Me' },
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 1000000 }, { stream: 'BCA Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 0 }],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.owed]: [], [TABS.assets]: [], [TABS.connections]: [],
    [TABS.plans]: [{ id: 'p1', name: 'Kos', amount: 1500000, direction: 'out', stream: 'BCA', category: 'Makan', day: 18, last: '2026-09', active: true }],
    ...extra,
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, ups) => ups.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => String(r.id) !== String(id)); },
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const OCT19 = () => new Date(2026, 9, 19, 10);
const me = (store, extra = {}) => createApi(store, { now: OCT19, isOwner: true, meName: 'Me', myEmail: 'me@example.com', ...extra });

describe('the daily close and its streak', () => {
  it('closing with no date (or a date that is not a date) closes today, once', () => {
    const store = memoryStore();
    const api = me(store);
    expect(api.closeDay({})).toMatchObject({ ok: true, date: '2026-10-19', closed: true, streak: 1 });
    expect(store.cfg.closed_days).toBe('2026-10-19');
    api.closeDay({ date: '2026-10-1x' });
    api.closeDay({ date: 'tomorrow' });
    api.closeDay({ date: '' });
    expect(store.cfg.closed_days).toBe('2026-10-19');
  });
  it('days are kept newest first, each once, and the streak counts the days in a row', () => {
    const store = memoryStore();
    const api = me(store);
    api.closeDay({ date: '2026-10-17' });
    api.closeDay({ date: '2026-10-18' });
    expect(api.closeDay({ date: '2026-10-17' }).streak).toBe(2); // today is still open: yesterday's streak stands
    expect(store.cfg.closed_days).toBe('2026-10-18,2026-10-17');
    expect(api.closeDay({}).streak).toBe(3);
    expect(store.cfg.closed_days).toBe('2026-10-19,2026-10-18,2026-10-17');
  });
  it('reopening with no date reopens today; a date reopens that day only; a bad date touches today only', () => {
    const store = memoryStore({ closed_days: '2026-10-19,2026-10-18,2026-10-17' });
    const api = me(store);
    expect(api.reopenDay({ date: '2026-10-18' })).toMatchObject({ closed: true });
    expect(store.cfg.closed_days).toBe('2026-10-19,2026-10-17');
    expect(api.reopenDay({}).closed).toBe(false);
    expect(store.cfg.closed_days).toBe('2026-10-17');
    api.reopenDay({ date: 'nonsense' });
    expect(store.cfg.closed_days).toBe('2026-10-17');
  });
  it('before noon a streak can be saved by closing yesterday', () => {
    const store = memoryStore({ closed_days: '2026-10-17' });
    expect(me(store).closeDay({ date: '2026-10-16' })).toMatchObject({ yesterday: '2026-10-18' });
    const early = createApi(memoryStore({ closed_days: '2026-10-17' }), { now: () => new Date(2026, 9, 19, 11), isOwner: true, meName: 'Me' });
    expect(early.reopenDay({ date: '2026-10-01' })).toMatchObject({ yesterday: '2026-10-18' });
    const noon = createApi(memoryStore({ closed_days: '2026-10-17' }), { now: () => new Date(2026, 9, 19, 12), isOwner: true, meName: 'Me' });
    expect(noon.reopenDay({ date: '2026-10-01' })).not.toHaveProperty('yesterday');
  });
});

describe('small replies and date checks', () => {
  it('the close, reopen, plans and assets calls answer ok: true', () => {
    const api = me(memoryStore());
    expect(api.closeDay({})).toHaveProperty('ok', true);
    expect(api.reopenDay({})).toHaveProperty('ok', true);
    expect(api.savePlans({ plans: [] })).toEqual({ ok: true });
    expect(api.saveAssets({ assets: [] })).toEqual({ ok: true, fetch: false });
  });
  it('only a whole date (YYYY-MM-DD, nothing around it) is taken as the day to close or reopen', () => {
    const store = memoryStore();
    const api = me(store);
    api.closeDay({ date: 'x2026-10-18' });
    api.closeDay({ date: '2026-10-17x' });
    expect(store.cfg.closed_days).toBe('2026-10-19'); // both fell back to today, once
    api.reopenDay({ date: '2026-10-19x' });
    expect(store.cfg.closed_days).toBe(''); // fell back to today and reopened it
  });
});

describe('planned transactions that fall due', () => {
  const plan = (extra = {}) => ({ id: 'p1', name: 'Kos', amount: 1500000, direction: 'out', stream: 'BCA', category: 'Makan', day: 18, last: '2026-09', active: true, ...extra });
  it('with no plans, or none due, it makes nothing', () => {
    expect(me(memoryStore({}, { [TABS.plans]: [] })).createDuePlanned()).toEqual({ created: 0 });
    expect(me(memoryStore({}, { [TABS.plans]: [plan({ last: '2026-10' })] })).createDuePlanned()).toEqual({ created: 0 });
  });
  it('a due plan becomes one pending row with its category and reference, and is marked done for the month', () => {
    const store = memoryStore({}, { [TABS.plans]: [plan()] });
    const api = me(store);
    expect(api.createDuePlanned()).toEqual({ created: 1 });
    const row = store.t[TABS.transactions].find((r) => r.source === 'plan');
    expect(row).toMatchObject({ direction: 'out', amount: 1500000, stream: 'BCA', category: 'Makan', description: 'Kos', details: 'Rutin', ref_no: 'plan:p1:2026-10', status: 'pending', owner: 'Me' });
    expect(store.t[TABS.plans][0].last).toBe('2026-10');
    expect(api.createDuePlanned()).toEqual({ created: 0 });
  });
  it('is approved by itself only when the plan is "auto" and has a category; a plan with no category leaves it empty', () => {
    const run = (p) => { const store = memoryStore({}, { [TABS.plans]: [p] }); me(store).createDuePlanned(); return store.t[TABS.transactions].find((r) => r.source === 'plan'); };
    expect(run(plan({ auto: true })).status).toBe('approved');
    expect(run(plan({ auto: false })).status).toBe('pending');
    expect(run(plan({ auto: true, category: '' }))).toMatchObject({ status: 'pending', category: '' });
  });
  it('only the plans that were due are marked; the others keep their month', () => {
    const store = memoryStore({}, { [TABS.plans]: [plan(), plan({ id: 'p2', name: 'Air', day: 25, last: '' })] });
    me(store).createDuePlanned();
    expect(store.t[TABS.plans].map((p) => p.last)).toEqual(['2026-10', '']);
  });
});

describe('"Tagih": who owes you for a payment', () => {
  const pay = { txId: 'a', people: [{ who: ' Ani ', amount: 25000 }] };
  it('makes an open entry from the payment: its text, its day, nothing paid yet', () => {
    const store = memoryStore();
    const r = me(store).tagih(pay);
    expect(r.ids).toHaveLength(1);
    expect(store.t[TABS.owed][0]).toMatchObject({ id: r.ids[0], tx_id: 'a', who: 'Ani', amount: 25000, note: 'WARUNG', date: '2026-10-05', status: 'open', paid_at: '' });
  });
  it('the note falls back to the details, the day is cut to the date, amounts are positive with two decimals', () => {
    const store = memoryStore();
    me(store).tagih({ txId: 'b', people: [{ who: 'Budi', amount: -100.126 }] });
    expect(store.t[TABS.owed][0]).toMatchObject({ note: 'KOPI DETAIL', date: '2026-10-06', amount: 100.13 });
  });
  it('asks for a name and an amount above 0 for each person, with a clear message', () => {
    const api = me(memoryStore());
    expect(() => api.tagih({ txId: 'zz', people: pay.people })).toThrow('transaction zz not found');
    expect(() => api.tagih({ txId: 'a', people: [] })).toThrow('add at least one name');
    expect(() => api.tagih({ txId: 'a' })).toThrow('add at least one name');
    expect(() => api.tagih({ txId: 'a', people: [{ who: 'Ani', amount: 5 }, { who: '  ', amount: 5 }] })).toThrow('person 2: name is required');
    expect(() => api.tagih({ txId: 'a', people: [{ who: 'Ani', amount: 0 }] })).toThrow('Ani: amount must be more than 0');
    expect(() => api.tagih({ txId: 'a', people: [{ who: 'Ani', amount: 'abc' }] })).toThrow('Ani: amount must be more than 0');
  });
  it('marks an entry paid with today\'s date, or open again with none; an unknown entry or status is refused (the entry is checked first)', () => {
    const store = memoryStore();
    const api = me(store);
    const [id] = api.tagih(pay).ids;
    api.owedSet({ id, status: 'paid' });
    expect(store.t[TABS.owed][0]).toMatchObject({ status: 'paid', paid_at: '2026-10-19' });
    api.owedSet({ id, status: 'open' });
    expect(store.t[TABS.owed][0]).toMatchObject({ status: 'open', paid_at: '' });
    expect(() => api.owedSet({ id, status: 'later' })).toThrow('status must be paid or open');
    expect(() => api.owedSet({ id: 'nope', status: 'later' })).toThrow('not found');
  });
  it('removes an entry; an unknown one is refused', () => {
    const store = memoryStore();
    const api = me(store);
    const [id] = api.tagih(pay).ids;
    expect(() => api.owedRemove({ id: 'nope' })).toThrow('not found');
    expect(api.owedRemove({ id })).toEqual({ ok: true });
    expect(store.t[TABS.owed]).toHaveLength(0);
  });
});

describe('planned transactions', () => {
  const plan = (extra = {}) => ({ name: 'Listrik', amount: 300000, direction: 'out', stream: 'BCA', category: 'Makan', day: 25, ...extra });
  const save = (plans, store = memoryStore()) => { me(store).savePlans({ plans }); return store.t[TABS.plans]; };
  it('says what is wrong with a plan, numbered', () => {
    const api = me(memoryStore());
    const fail = (p, msg) => expect(() => api.savePlans({ plans: [plan(), p] }), msg).toThrow(msg);
    fail(plan({ name: '  ' }), 'plan 2: name is required');
    fail(plan({ amount: 0 }), 'plan 2: amount must be more than 0');
    fail(plan({ direction: 'sideways' }), 'plan 2: choose money in or out');
    fail(plan({ stream: 'Nowhere' }), 'plan 2: choose an account');
    fail(plan({ category: 'Gaji' }), 'plan 2: "Gaji" doesn\'t fit');
    fail(plan({ direction: 'in', category: 'Makan' }), 'plan 2: "Makan" doesn\'t fit');
    for (const day of [0, 32, 1.5, 'x']) fail(plan({ day }), 'plan 2: day must be 1-31');
  });
  it('accepts the first and the last day, a category of the right side, and none at all', () => {
    expect(save([plan({ day: 1 }), plan({ day: 31 }), plan({ direction: 'in', category: 'Gaji' }), plan({ category: '' })])).toHaveLength(4);
  });
  it('cleans what it keeps: trimmed name, a positive amount with two decimals, "auto" only with a category, active unless switched off', () => {
    const [p, q, r] = save([plan({ name: ' Air ', amount: -12.346, auto: true }), plan({ auto: true, category: '' }), plan({ active: false })]);
    expect(p).toMatchObject({ name: 'Air', amount: 12.35, category: 'Makan', day: 25, auto: true, active: true });
    expect(q).toMatchObject({ category: '', auto: false, active: true });
    expect(r.active).toBe(false);
  });
  it('a new plan whose day has passed this month starts next month; one that is still to come (or is today) starts this month', () => {
    const [passed, today, later] = save([plan({ day: 10 }), plan({ day: 19 }), plan({ day: 25 })]);
    expect(passed.last).toBe('2026-10');
    expect(today.last).toBe('');
    expect(later.last).toBe('');
  });
  it('a plan that already exists keeps its id and its "last" month', () => {
    const [kept] = save([plan({ id: 'p1', name: 'Kos', day: 10 })]);
    expect(kept).toMatchObject({ id: 'p1', last: '2026-09' });
    const store = memoryStore({}, { [TABS.plans]: [{ id: 7, name: 'Kos', amount: 1, direction: 'out', stream: 'BCA', category: '', day: 3, last: undefined, active: true }] });
    expect(save([plan({ id: '7', day: 10 })], store)[0]).toMatchObject({ id: 7, last: '' });
  });
});

describe('assets and what they keep', () => {
  const asset = (extra = {}) => ({ name: 'Emas', kind: 'gold', qty: 2, unit_value: 1000000, ...extra });
  const save = (list, before = [], api) => {
    const store = memoryStore({}, { [TABS.assets]: before });
    const r = (api || me(store)).saveAssets({ assets: list });
    return { r, rows: store.t[TABS.assets] };
  };
  it('a price already fetched stays while the ticker stays the same (whatever its case or spaces)', () => {
    const { rows } = save([{ ...asset({ id: 'x', kind: 'stock', ticker: ' bbca ' }) }], [{ id: 'x', kind: 'stock', ticker: 'BBCA', price: 9000, price_at: '2026-10-18' }]);
    expect(rows[0]).toMatchObject({ ticker: 'BBCA', price: 9000, price_at: '2026-10-18' });
  });
  it('a new ticker clears the old price; so does an asset that did not exist', () => {
    const { rows } = save([asset({ id: 'x', kind: 'stock', ticker: 'TLKM' }), asset({ id: 'y', kind: 'stock', ticker: 'BBCA' })], [{ id: 'x', kind: 'stock', ticker: 'BBCA', price: 9000, price_at: 'd' }]);
    expect(rows[0]).toMatchObject({ price: '', price_at: '' });
    expect(rows[1]).toMatchObject({ price: '', price_at: '' });
  });
  it('gold without a ticker keeps its price while it stays gold without a ticker, and only then', () => {
    const before = [{ id: 'g', kind: 'gold', ticker: '', price: 1100000, price_at: 'd' }, { id: 'h', kind: 'goods', ticker: '', price: 5, price_at: 'd' }, { id: 'i', kind: 'goods', ticker: 'BBCA', price: 5, price_at: 'd' }];
    const { rows } = save([asset({ id: 'g' }), asset({ id: 'h', kind: 'goods', unit_value: 10 }), asset({ id: 'i', kind: 'gold', ticker: '' })], before);
    expect(rows[0]).toMatchObject({ price: 1100000 });
    expect(rows[1].price).toBe(''); // not gold: a price that was typed is not a fetched one
    expect(rows[2].price).toBe(''); // it had a ticker before
    expect(save([asset({ id: 'g', ticker: 'XAU' })], [{ id: 'g', kind: 'gold', ticker: '', price: 7, price_at: 'd' }]).rows[0].price).toBe('');
  });
  it('says whether prices need fetching: a ticker or gold, not other things', () => {
    expect(save([asset()]).r.fetch).toBe(true);
    expect(save([asset({ kind: 'stock', ticker: 'BBCA', unit_value: 0 })]).r.fetch).toBe(true);
    expect(save([asset({ kind: 'goods', unit_value: 10 })]).r.fetch).toBe(false);
    expect(save([]).r.fetch).toBe(false);
  });
  it('a missing quantity is one; zero is refused; the other fields are cleaned', () => {
    const { rows } = save([asset({ id: 'a', kind: 'goods', qty: '', unit_value: '25', paid: '20', notes: ' hi ', warranty: ' 2027-01-01 ', name: ' TV ' }), asset({ kind: 'goods', qty: null, unit_value: 5 })]);
    expect(rows[0]).toMatchObject({ id: 'a', name: 'TV', qty: 1, unit_value: 25, ticker: '', paid: 20, notes: 'hi', warranty: '2027-01-01' });
    expect(rows[1]).toMatchObject({ qty: 1, paid: '', notes: '', warranty: '' });
    expect(rows[1].id).toMatch(/^a/);
    expect(() => save([asset({ qty: 0 })])).toThrow('item 1: quantity must be above 0');
    expect(() => save([asset({ name: '', kind: 'nothing' })])).toThrow('item 1: name is required; item 1: unknown kind nothing');
  });
});

describe('the people on the settings page and the phone code', () => {
  const settings = (store, extra) => me(store, extra).settings();
  it('each person: name, Google accounts (lower case), bank names, and each account\'s state', () => {
    const store = memoryStore({
      owner_email: ' Me@Example.com , second@example.com ,', owner_bank_names: 'ME ONE', partner_bank_names: '',
    }, {
      [TABS.connections]: [
        { gmail: 'ME@example.com', last_sync: '2026-10-19T01:00:00Z', last_status: 'ERROR: token expired | more text' },
        { gmail: 'dewi@example.com', last_sync: '2026-10-19T02:00:00Z', last_status: 'live ok' },
      ],
    });
    const [owner, partner] = settings(store).household.members;
    expect(owner).toMatchObject({ role: 'owner', name: 'Me', emails: ['me@example.com', 'second@example.com'], bankNames: 'ME ONE' });
    expect(owner.gmails).toEqual([
      { email: 'me@example.com', connected: true, at: '2026-10-19T01:00:00Z', problem: 'token expired' },
      { email: 'second@example.com', connected: false, at: '', problem: '' },
    ]);
    expect(owner.connected).toEqual({ at: '2026-10-19T01:00:00Z', status: 'ERROR: token expired | more text' });
    expect(partner).toMatchObject({ role: 'partner', name: 'Dewi', emails: ['dewi@example.com'], bankNames: '' });
    expect(partner.gmails[0]).toEqual({ email: 'dewi@example.com', connected: true, at: '2026-10-19T02:00:00Z', problem: '' });
    expect(partner.connected).toEqual({ at: '2026-10-19T02:00:00Z', status: 'live ok' });
  });
  it('a problem text is the first part, without the word ERROR, at most 160 characters; a state with no text is not a problem', () => {
    const long = `ERROR:   ${'x'.repeat(200)} | tail`;
    const store = memoryStore({}, { [TABS.connections]: [{ gmail: 'me@example.com', last_sync: '', last_status: long }, { gmail: 'dewi@example.com' }] });
    const [owner, partner] = settings(store).household.members;
    expect(owner.gmails[0].problem).toBe('x'.repeat(160));
    expect(owner.gmails[0].at).toBe('');
    expect(partner.gmails[0]).toEqual({ email: 'dewi@example.com', connected: true, at: '', problem: '' });
    expect(partner.connected).toEqual({ at: '', status: '' });
    expect(settings(memoryStore({}, { [TABS.connections]: [{ gmail: 'me@example.com', last_status: 'not an ERROR: really' }] })).household.members[0].gmails[0].problem).toBe('');
  });
  it('a person with no connection yet has connected: null', () => {
    expect(settings(memoryStore()).household.members.map((m) => m.connected)).toEqual([null, null]);
  });
  it('"your Gmail is connected" means one of the connections is yours (any case); without an address to compare it is not asked', () => {
    const conn = (...gmails) => memoryStore({}, { [TABS.connections]: gmails.map((gmail) => ({ gmail })) });
    const flag = (store, extra) => me(store, extra).settings().household.myGmailConnected;
    expect(flag(conn())).toBe(false);
    expect(flag(conn('other@example.com'))).toBe(false);
    expect(flag(conn('other@example.com', 'ME@Example.com'))).toBe(true);
    expect(flag(conn(), { myEmail: '' })).toBe(true);
  });
  it('the phone devices: a label, when it was added, and whose it is (the owner when nobody is named); "mine" is the ones of the person using the app', () => {
    const devices = [{ label: 'Pixel', at: '2026-10-01', owner: 'Dewi' }, {}, { label: 'iPad', at: '2026-10-02', owner: 'Me' }];
    const store = memoryStore({ push_devices: JSON.stringify(devices) });
    const push = { site: 'https://site.example', token: () => 'c', send: () => ({}) };
    expect(me(store, { push }).settings().push.devices).toEqual([
      { label: 'Pixel', at: '2026-10-01', owner: 'Dewi', mine: false },
      { label: '', at: '', owner: 'Me', mine: true },
      { label: 'iPad', at: '2026-10-02', owner: 'Me', mine: true },
    ]);
    expect(createApi(store, { now: OCT19, isOwner: false, meName: 'Dewi', push }).settings().push.devices.map((d) => d.mine)).toEqual([true, false, false]);
  });
  it('the phone code stays for 20 minutes, then a new one is made and kept', () => {
    let clock = new Date(2026, 9, 19, 10, 0, 0);
    let n = 0;
    const push = { site: 'https://site.example', token: () => `code${n += 1}`, send: () => ({ sent: 1 }) };
    const store = memoryStore();
    const api = createApi(store, { now: () => clock, isOwner: true, meName: 'Me', myEmail: 'me@example.com', push });
    const link = () => api.settings().push.link;
    expect(link()).toBe('https://site.example/notifikasi?n=code1');
    clock = new Date(clock.getTime() + 19 * 60000 + 59000);
    expect(link()).toBe('https://site.example/notifikasi?n=code1');
    clock = new Date(new Date(2026, 9, 19, 10, 20, 0).getTime());
    expect(link()).toBe('https://site.example/notifikasi?n=code2');
    expect(store.cfg.push_nonce).toBe(`code2 ${clock.getTime()}`);
    expect(n).toBe(2);
    store.cfg.push_nonce = ` ${clock.getTime()}`; // no code stored
    expect(link()).toBe('https://site.example/notifikasi?n=code3');
  });
});

describe('removing an account', () => {
  const acc = (stream, owner = 'Me') => ({ stream, type: 'Spending', owner, institution: '', match_hint: '', opening_balance: 0, notes: '' });
  const keepOnly = (store, ...streams) => me(store).saveAccounts({ accounts: streams.map((s) => acc(s)) });
  it('an account nothing refers to can be removed', () => {
    const store = memoryStore();
    keepOnly(store, 'BCA');
    expect(store.t[TABS.accounts].map((a) => a.stream)).toEqual(['BCA']);
  });
  it('one with transactions cannot, and the message names it', () => {
    expect(() => keepOnly(memoryStore(), 'BCA Dewi')).toThrow("these accounts have transactions and can't be removed: BCA");
  });
  it('one that a plan, a goal or a rule points at cannot either', () => {
    const point = (extra) => memoryStore({}, extra);
    const msg = "these accounts are used by a plan, a goal, a rule, a card or a salary setting and can't be removed: BCA Dewi";
    expect(() => keepOnly(point({ [TABS.plans]: [{ id: 'p9', name: 'x', amount: 1, direction: 'out', stream: 'BCA Dewi', day: 1 }] }), 'BCA')).toThrow(msg);
    expect(() => keepOnly(point({ [TABS.goals]: [{ id: 'g9', name: 'x', stream: 'BCA Dewi' }] }), 'BCA')).toThrow(msg);
    expect(() => keepOnly(point({ [TABS.rules]: [{ id: 'r9', field: 'description', pattern: 'X', category: 'Makan', stream_override: 'BCA Dewi' }] }), 'BCA')).toThrow(msg);
  });
  it('a credit card or the salary account of either person counts too', () => {
    const msg = /a card or a salary setting and can't be removed: BCA Dewi$/;
    expect(() => keepOnly(memoryStore({ cards: JSON.stringify([{ stream: 'BCA Dewi', due_day: 5 }]) }), 'BCA')).toThrow(msg);
    expect(() => keepOnly(memoryStore({ salary_stream: 'BCA Dewi' }), 'BCA')).toThrow(msg);
    expect(() => keepOnly(memoryStore({ partner_salary_stream: 'BCA Dewi' }), 'BCA')).toThrow(msg);
  });
  it('the name is listed once, however many things point at it', () => {
    const store = memoryStore({}, { [TABS.plans]: [{ id: 'a', stream: 'BCA Dewi' }, { id: 'b', stream: 'BCA Dewi' }], [TABS.goals]: [{ id: 'g', stream: 'BCA Dewi' }] });
    expect(() => keepOnly(store, 'BCA')).toThrow(/removed: BCA Dewi$/);
  });
  it('a plan, goal or rule that points at an account that is kept is no obstacle', () => {
    const store = memoryStore({}, { [TABS.plans]: [{ id: 'a', stream: 'BCA' }], [TABS.rules]: [{ id: 'r', stream_override: '' }] });
    expect(() => keepOnly(store, 'BCA')).not.toThrow();
  });
});

describe('budgets for Kita and for each person', () => {
  const budgets = [
    { category: 'Makan', monthly_budget: 1000000, scope: '' },
    { category: 'Makan', monthly_budget: 200000, scope: 'Me' },
    { category: 'Makan', monthly_budget: 50000, scope: 'Dewi' },
  ];
  const store = () => memoryStore({}, { [TABS.budgets]: budgets.map((b) => ({ ...b })) });
  it('the summary uses the budgets of the view it shows: Kita, or one person', () => {
    const api = me(store());
    expect(api.dashboard({}).budgets).toEqual([expect.objectContaining({ category: 'Makan', budget: 1000000, spent: 140000 })]);
    expect(api.dashboard({ owner: 'Me' }).budgets).toEqual([expect.objectContaining({ budget: 200000, spent: 140000 })]);
    expect(api.dashboard({ owner: 'Dewi' }).budgets).toEqual([expect.objectContaining({ budget: 50000, spent: 0 })]);
  });
  it('a budget from before there were scopes is Kita\'s, and a person with none has none', () => {
    const legacy = memoryStore({}, { [TABS.budgets]: [{ category: 'Makan', monthly_budget: 900000 }] });
    const api = me(legacy);
    expect(api.dashboard({}).budgets).toEqual([expect.objectContaining({ budget: 900000 })]);
    expect(api.dashboard({ owner: 'Me' }).budgets).toEqual([]);
  });
  it('the settings offer suggestions for Kita and for each person', () => {
    expect(Object.keys(me(store()).settings().budgetSuggestionsBy).sort()).toEqual(['', 'Dewi', 'Me']);
  });
  it('saving keeps the scope of each budget, drops the empty ones, and refuses a person who is not in the household', () => {
    const s = store();
    const api = me(s);
    api.saveBudgets({ budgets: [{ category: 'Makan', monthly_budget: 300000, scope: 'Dewi' }, { category: 'Makan', monthly_budget: 0, scope: 'Me' }, { category: 'Makan', monthly_budget: 700000 }] });
    expect(s.t[TABS.budgets]).toEqual([
      { category: 'Makan', monthly_budget: 300000, scope: 'Dewi' },
      { category: 'Makan', monthly_budget: 700000, scope: '' },
    ]);
    expect(() => api.saveBudgets({ budgets: [{ category: 'Makan', monthly_budget: 1, scope: 'Zed' }] })).toThrow('unknown person Zed');
    expect(() => api.saveBudgets({ budgets: [{ category: 'Nope', monthly_budget: 1, scope: '' }] })).toThrow('unknown expense category Nope');
  });
});
