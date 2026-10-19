// Two people who are equal in the app: each has their own streak, payday, salary card, emails,
// notification settings and devices; a row belongs to the owner of its account; the first
// person's data is untouched by the second's.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { CONFIG_KEYS, PERSONAL_KEYS, TABS } from '../src/core/schema.js';
import { pushTargets, addDevice } from '../src/core/push.js';
import { mergeYearly } from '../src/core/yearly.js';
import { missingSalaries } from '../src/core/salary.js';

const KEYS = { p256dh: 'B'.repeat(87), auth: 'a1b2c3d4e5f6g7h8i9j0kA' };

function memoryStore(cfgExtra = {}, devices = []) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-10-05', direction: 'out', amount: 100000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', source: 'email', owner: 'Me' },
      { id: 'b', date: '2026-10-06', direction: 'out', amount: 40000, stream: 'BCA Dewi', category: 'Makan', status: 'approved', description: 'KOPI', source: 'email', owner: 'Dewi' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 1000000 },
      { stream: 'BCA Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 500000 },
    ],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.owed]: [], [TABS.assets]: [],
    [TABS.connections]: [{ gmail: 'me@example.com', last_sync: '2026-10-19T01:00:00.000Z', last_status: 'live ok' }],
    [TABS.plans]: [{ id: 'p1', name: 'Kos', amount: 1500000, direction: 'out', stream: 'BCA', category: 'Makan', day: 18, last: '', active: true }],
  };
  const cfg = {
    owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28,
    push_devices: JSON.stringify(devices), ...cfgExtra,
  };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, ups) => ups.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct19 = () => new Date(2026, 9, 19, 10);
const asMe = (store, extra = {}) => createApi(store, { now: oct19, isOwner: true, meName: 'Me', myEmail: 'me@example.com', ...extra });
const asShe = (store, extra = {}) => createApi(store, { now: oct19, isOwner: false, meName: 'Dewi', myEmail: 'dewi@example.com', ...extra });

describe('settings each of you has', () => {
  it('every personal setting has the partner\'s own twin, in the config list', () => {
    const keys = CONFIG_KEYS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of PERSONAL_KEYS) { expect(keys).toContain(k); expect(keys).toContain(`partner_${k}`); }
  });
  it('each of you sees and saves your own; the other\'s stay as they were', () => {
    const store = memoryStore({ partner_weekly_email: 'off', weekly_email: 'on' });
    const he = asMe(store);
    const she = asShe(store);
    expect(he.settings().config.weekly_email).toBe('on');
    expect(she.settings().config.weekly_email).toBe('off');
    she.saveConfig({ weekly_email: 'on', close_email: 'on', push_events: ['bills'], payday_day: '', owner_bank_names: 'DEWI LESTARI', calendar_sync: 'off' });
    expect(store.cfg).toMatchObject({ partner_weekly_email: 'on', partner_close_email: 'on', partner_push_events: 'bills', partner_payday_day: '', partner_bank_names: 'DEWI LESTARI', partner_calendar_sync: 'off' });
    expect(store.cfg.close_email).toBeUndefined();
    expect(store.cfg.payday_day).toBe(28);
    expect(() => he.saveConfig({ payday_day: '' })).toThrow(/payday must be a day 1-31/); // the first person always has a payday
    he.saveConfig({ payday_day: '27', owner_bank_names: 'BUDI' });
    expect(store.cfg).toMatchObject({ payday_day: 27, owner_bank_names: 'BUDI', partner_bank_names: 'DEWI LESTARI' });
    expect(she.settings().config.owner_bank_names).toBe('DEWI LESTARI'); // "my bank names" is each person's own
  });
});

describe('"Tutup hari" and its streak', () => {
  it('each of you has your own days closed, and your own hand-logged rows count', () => {
    const store = memoryStore({ closed_days: '2026-10-18,2026-10-17' });
    store.t[TABS.transactions].push({ id: 'm1', date: '2026-10-19', direction: 'out', amount: 5000, stream: 'BCA Dewi', category: 'Makan', status: 'approved', description: 'Parkir', source: 'manual', owner: 'Dewi' });
    expect(asMe(store).review().day).toMatchObject({ streak: 2, byHand: 0 });
    expect(asShe(store).review().day).toMatchObject({ streak: 0, byHand: 1 });
    expect(asShe(store).closeDay({})).toMatchObject({ closed: true, streak: 1 });
    expect(store.cfg.partner_closed_days).toBe('2026-10-19');
    expect(store.cfg.closed_days).toBe('2026-10-18,2026-10-17'); // yours untouched
    expect(asMe(store).review().day.closed).toBe(false);
  });
});

describe('payday and the salary card', () => {
  it('the partner has no salary card until their payday is set; a salary is told apart by its person', () => {
    const store = memoryStore();
    expect(asMe(store).review().salary.map((s) => s.month)).toEqual(['2026-09']); // his 28 Sep is past, nothing recorded
    expect(asShe(store).review().salary).toEqual([]); // she has no payday set
    store.cfg.partner_payday_day = 25;
    expect(asShe(store).review().salary.map((s) => [s.month, s.date])).toEqual([['2026-09', '2026-09-25']]);
    const r = asShe(store).recordSalary({ month: '2026-09', amount: 7000000, stream: 'BCA Dewi', date: '2026-09-25' });
    expect(r.ok).toBe(true);
    const row = store.t[TABS.transactions].find((x) => x.id === r.id);
    expect(row).toMatchObject({ ref_no: 'salary:2026-09:p', owner: 'Dewi', stream: 'BCA Dewi' });
    expect(store.cfg).toMatchObject({ partner_salary_amount: 7000000, partner_salary_stream: 'BCA Dewi' });
    expect(store.cfg.salary_amount).toBeUndefined();
    expect(asShe(store).review().salary).toEqual([]);
    // Her salary, 3 days before his payday, doesn't answer his card.
    expect(asMe(store).review().salary.map((s) => s.month)).toEqual(['2026-09']);
    asShe(store).skipSalary({ month: '2026-10' });
    expect(store.cfg.partner_salary_skipped).toBe('2026-10');
  });
  it('the day count uses your own payday, else the household\'s', () => {
    const store = memoryStore({ partner_payday_day: 25 });
    expect(asShe(store).dashboard({}).perDay.nextPayday).toBe('2026-10-23'); // 25 Oct is a Sunday: the Friday before
    expect(asMe(store).dashboard({}).perDay.nextPayday).toBe('2026-10-28');
    store.cfg.partner_payday_day = '';
    expect(asShe(store).dashboard({}).perDay.nextPayday).toBe('2026-10-28');
  });
  it('missingSalaries takes the reference of a salary from its caller', () => {
    const rows = [{ direction: 'in', category: 'Gaji', date: '2026-09-02', amount: 1, ref_no: 'salary:2026-09:p', status: 'approved' }];
    const base = { start: '2026-09-01', today: new Date(2026, 9, 19), payday: 28, category: 'Gaji' };
    expect(missingSalaries(rows, { ...base, refOf: (m) => `salary:${m}:p` })).toEqual([]);
    expect(missingSalaries(rows, base).map((m) => m.month)).toEqual(['2026-09']); // under another reference, and 26 days before payday: not this one's
  });
});

describe('a row belongs to the owner of its account', () => {
  it('a payment you add for her account is hers; planned payments take their account\'s owner', () => {
    const store = memoryStore();
    asMe(store).add({ kind: 'out', amount: 5000, category: 'Makan', stream: 'BCA Dewi', date: '2026-10-19', description: 'Parkir' });
    expect(store.t[TABS.transactions].at(-1)).toMatchObject({ owner: 'Dewi', updated_by: 'Me', stream: 'BCA Dewi' });
    asShe(store).createDuePlanned(); // her morning job adds his planned rent
    expect(store.t[TABS.transactions].find((x) => x.ref_no === 'plan:p1:2026-10')).toMatchObject({ owner: 'Me', stream: 'BCA' });
  });
  it('a transfer between you two has a leg of each', () => {
    const store = memoryStore();
    asMe(store).add({ kind: 'transfer', amount: 50000, stream: 'BCA', toStream: 'BCA Dewi', date: '2026-10-19', description: 'Patungan' });
    const legs = store.t[TABS.transactions].filter((x) => x.description !== 'WARUNG' && x.description !== 'KOPI' && x.date === '2026-10-19');
    expect(legs.map((x) => `${x.stream}:${x.owner}`).sort()).toEqual(['BCA Dewi:Dewi', 'BCA:Me']);
  });
});

describe('notifications go to the person they are for', () => {
  const devices = [
    { endpoint: 'https://fcm.googleapis.com/a', keys: KEYS, label: 'HP A', owner: 'Me' },
    { endpoint: 'https://fcm.googleapis.com/b', keys: KEYS, label: 'HP B', owner: 'Dewi' },
    { endpoint: 'https://fcm.googleapis.com/c', keys: KEYS, label: 'Lama' }, // joined before there were two: the first person's
  ];
  const eventsOf = (n) => (n === 'Dewi' ? ['bills'] : ['new', 'bills']);
  it('only that person, and only people who have the event on', () => {
    const ends = (o) => pushTargets(devices, { defaultOwner: 'Me', eventsOf, ...o }).map((d) => d.endpoint.slice(-1));
    expect(ends({})).toEqual(['a', 'b', 'c']);
    expect(ends({ event: 'new' })).toEqual(['a', 'c']);
    expect(ends({ event: 'bills' })).toEqual(['a', 'b', 'c']);
    expect(ends({ only: 'Dewi' })).toEqual(['b']);
    expect(ends({ only: 'Me', event: 'new' })).toEqual(['a', 'c']);
    expect(ends({ only: 'Dewi', event: 'new' })).toEqual([]);
  });
  it('five devices a person, newest first, without crowding out the other person', () => {
    let list = [];
    const sub = (i) => ({ endpoint: `https://fcm.googleapis.com/${i}`, keys: KEYS });
    for (let i = 0; i < 7; i += 1) list = addDevice(list, sub(i), `A${i}`, '2026-10-19', 'Me');
    list = addDevice(list, sub('x'), 'B', '2026-10-19', 'Dewi');
    expect(list.filter((d) => d.owner === 'Me').map((d) => d.label)).toEqual(['A6', 'A5', 'A4', 'A3', 'A2']);
    expect(list.filter((d) => d.owner === 'Dewi')).toHaveLength(1);
  });
  it('the app shows whose devices they are, tests only yours, and forgets only yours', () => {
    const store = memoryStore({}, devices);
    const sent = [];
    const push = { site: 'https://karjimut.vercel.app', token: () => 'code', send: (notice, opts) => { sent.push(opts); return { sent: 1 }; } };
    const she = asShe(store, { push });
    expect(she.settings().push.devices.map((d) => [d.label, d.owner, d.mine])).toEqual([['HP A', 'Me', false], ['HP B', 'Dewi', true], ['Lama', 'Me', false]]);
    she.pushTest();
    expect(sent).toEqual([{ only: 'Dewi' }]);
    she.pushForget();
    expect(JSON.parse(store.cfg.push_devices).map((d) => d.label)).toEqual(['HP A', 'Lama']);
    asMe(store, { push }).pushForget(); // the legacy device without an owner is the first person's
    expect(JSON.parse(store.cfg.push_devices)).toEqual([]);
  });
});

describe('yearly plans found by each person\'s Gmail', () => {
  it('a scan replaces only that person\'s plans; earlier ones (no owner) belong to the first person', () => {
    const stored = [{ key: 'x', name: 'X' }, { key: 'y', name: 'Y', by: 'Dewi' }];
    expect(mergeYearly(stored, [{ key: 'z', name: 'Z' }], { by: 'Me', firstPerson: 'Me' }).map((p) => [p.key, p.by || 'legacy'])).toEqual([['y', 'Dewi'], ['z', 'Me']]);
    expect(mergeYearly(stored, [{ key: 'y', name: 'Y' }, { key: 'x', name: 'X again' }], { by: 'Dewi', firstPerson: 'Me' }).map((p) => [p.key, p.name])).toEqual([['x', 'X'], ['y', 'Y']]);
  });
});

describe('who is connected, in Settings', () => {
  it('both people, with their Gmail status; your own Connect button when yours is missing', () => {
    const store = memoryStore();
    const h = asShe(store).settings().household;
    expect(h).toMatchObject({ me: 'Dewi', myRole: 'partner', isOwner: false, myGmailConnected: false });
    expect(h.members.map((m) => [m.role, m.name, !!m.connected])).toEqual([['owner', 'Me', true], ['partner', 'Dewi', false]]);
    expect(asMe(store).settings().household.myGmailConnected).toBe(true);
  });
});
