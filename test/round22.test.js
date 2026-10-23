// Round 22: the backup file read back (restore), the payday plan, first steps for someone new,
// and the yearly report following Kita / Aku / Dia.
import { describe, expect, it } from 'vitest';
import { parseCsv, parseBackupCsv, backupCsv } from '../src/core/csv.js';
import { paydayPlan } from '../src/core/paydayplan.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';
import { accountFixes } from '../src/core/datafix.js';
import { ruleUpdates } from '../src/core/rules.js';
import { retryable } from '../src/core/retry.js';

describe('reading CSV', () => {
  it('quotes, doubled quotes, commas and line breaks inside quotes, both kinds of line end, a BOM', () => {
    expect(parseCsv('﻿a,b,c\r\n1,"x, y",3\n"he said ""hi""","two\nlines",\n')).toEqual([['a', 'b', 'c'], ['1', 'x, y', '3'], ['he said "hi"', 'two\nlines', '']]);
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
    expect(parseCsv('a\n\n\nb')).toEqual([['a'], ['b']]);
  });
  it('a backup written by backupCsv comes back as it was, including text that was quoted against formulas', () => {
    const rows = [
      { id: 'a1', date: '2026-10-01', time: '09:30:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 28000, category: 'Makan', description: '=HYPERLINK("x")', details: '-Kopi, susu', source: 'email', status: 'approved', ref_no: 'r', transfer_id: '', gmail_id: 'g1' },
      { id: 'a2', date: '2026-10-02', time: '', owner: 'Dewi', stream: 'BCA Dewi', direction: 'in', amount: 9000000.5, category: 'Gaji', description: 'Gaji "bulanan"', details: '', source: 'manual', status: 'pending', ref_no: '', transfer_id: 'x_1', gmail_id: '' },
    ];
    const back = parseBackupCsv(backupCsv(rows));
    expect(back).toEqual(rows);
    expect(back[0].description).toBe('=HYPERLINK("x")'); // the guard quote is gone again
  });
  it('a file that is not a backup is refused; an older backup without the email id still reads', () => {
    expect(() => parseBackupCsv('name,amount\nx,1')).toThrow(/not a Cashflow backup/);
    expect(() => parseBackupCsv('')).toThrow(/not a Cashflow backup/);
    const old = 'id,date,time,owner,stream,direction,amount,category,description,details,source,status,ref_no,transfer_id\r\nz,2026-10-01,,Me,BCA,out,5000,Makan,Parkir,,manual,approved,,';
    expect(parseBackupCsv(old)).toEqual([expect.objectContaining({ id: 'z', amount: 5000, description: 'Parkir' })]);
  });
});

describe('the payday plan', () => {
  it('bills and saving come off the salary; what is left, and per day', () => {
    const p = paydayPlan({ salary: 9000000, days: 30, bills: [{ name: 'Kos', amount: 1500000, date: '2026-11-01' }], goals: [{ name: 'Dana', amount: 1000000 }] });
    expect(p).toMatchObject({ salary: 9000000, billsTotal: 1500000, saveTotal: 1000000, free: 6500000, perDay: 216666, days: 30 });
  });
  it('no salary known: no "left"; spending more than the salary: negative and no per day', () => {
    expect(paydayPlan({ salary: 0, days: 30, bills: [{ name: 'Kos', amount: 5, date: 'x' }], goals: [] })).toMatchObject({ free: null, perDay: null, billsTotal: 5 });
    expect(paydayPlan({ salary: 1000000, days: 30, bills: [{ name: 'Kos', amount: 1500000, date: 'x' }], goals: [] })).toMatchObject({ free: -500000, perDay: null });
  });
});

function memoryStore(cfgExtra = {}, rows = []) {
  const t = {
    [TABS.transactions]: rows,
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 1000000 }, { stream: 'Tabungan', type: 'Saving', owner: 'Me', opening_balance: 4000000 },
      { stream: 'BCA Dewi', type: 'Spending', owner: 'Dewi', opening_balance: 500000 },
    ],
    [TABS.goals]: [{ stream: 'Tabungan', name: 'Dana', target: 10000000, target_date: '2027-03-31' }],
    [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.assets]: [],
    [TABS.plans]: [{ id: 'p1', name: 'Kos', amount: 1500000, direction: 'out', stream: 'BCA', category: 'Makan', day: 1, last: '', active: true }],
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, salary_amount: 9000000, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const at = (m, d, h = 10) => () => new Date(2026, m - 1, d, h);
const me = (store, now) => createApi(store, { now, isOwner: true, meName: 'Me', myEmail: 'me@example.com' });
const she = (store, now) => createApi(store, { now, isOwner: false, meName: 'Dewi', myEmail: 'dewi@example.com' });

describe('the payday plan on the overview', () => {
  it('on payday and the two days after; your goals and the bills until the next payday', () => {
    const store = memoryStore();
    const plan = me(store, at(10, 28)).dashboard({}).paydayPlan;
    expect(plan).toMatchObject({ date: '2026-10-28', salary: 9000000, days: 30, billsTotal: 1500000, saveTotal: 1000000, free: 6500000, perDay: 216666 });
    expect(plan.bills.map((b) => [b.name, b.date])).toEqual([['Kos', '2026-11-01']]);
    expect(plan.goals).toEqual([{ name: 'Dana', amount: 1000000 }]);
    expect(me(store, at(10, 30)).dashboard({}).paydayPlan).toMatchObject({ date: '2026-10-28' });
    expect(me(store, at(10, 31)).dashboard({}).paydayPlan).toBeNull();
    expect(me(store, at(10, 27)).dashboard({}).paydayPlan).toBeNull();
  });
  it('the partner has one only with a payday of their own; a weekend payday moves back to Friday; the other person\'s goals are not theirs', () => {
    const store = memoryStore();
    expect(she(store, at(10, 28)).dashboard({}).paydayPlan).toBeNull();
    store.cfg.partner_payday_day = 25; // a Sunday: paid on Friday the 23rd
    store.cfg.partner_salary_amount = 7000000;
    const plan = she(store, at(10, 24)).dashboard({}).paydayPlan;
    expect(plan).toMatchObject({ date: '2026-10-23', salary: 7000000, saveTotal: 0, goals: [] }); // the savings goal is on his account
    expect(she(store, at(10, 26)).dashboard({}).paydayPlan).toBeNull();
  });
});

describe('first steps for someone new', () => {
  it('your accounts and a payday of your own', () => {
    const store = memoryStore();
    expect(me(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 2, payday: true, unchecked: [] });
    expect(she(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 1, payday: false, unchecked: [] });
    store.cfg.partner_payday_day = 25;
    store.t[TABS.accounts] = store.t[TABS.accounts].filter((a) => a.owner !== 'Dewi');
    expect(she(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 0, payday: true, unchecked: [] });
  });
});

describe('the yearly report follows Kita / Aku / Dia', () => {
  it('one person\'s rows only when asked', () => {
    const rows = [
      { id: 'a', date: '2026-10-05', direction: 'out', amount: 100000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', owner: 'Me' },
      { id: 'b', date: '2026-10-06', direction: 'out', amount: 40000, stream: 'BCA Dewi', category: 'Makan', status: 'approved', description: 'KOPI', owner: 'Dewi' },
    ];
    const api = me(memoryStore({}, rows), at(10, 21));
    const month = (y) => y.months.find((m) => m.month === '2026-10').expense;
    expect(month(api.yearly({ year: 2026 }))).toBe(140000);
    expect(month(api.yearly({ year: 2026, owner: 'Dewi' }))).toBe(40000);
    expect(api.yearly({ year: 2026, owner: 'Dewi' }).places.map((p) => p.name)).toEqual(['KOPI']);
  });
});

describe('restoring from a backup', () => {
  const have = { id: 'a', date: '2026-10-05', direction: 'out', amount: 100000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'WARUNG', owner: 'Me' };
  const lost = { id: 'b', date: '2026-10-06', time: '08:00:00', owner: 'Dewi', stream: 'BCA Dewi', direction: 'out', amount: 40000, category: 'Makan', description: 'KOPI', details: '#bersama', source: 'email', status: 'approved', ref_no: '', transfer_id: '', gmail_id: 'g7' };
  it('adds only what is missing, keeps everything as it was (the email id too), and changes nothing that is there', () => {
    const store = memoryStore({}, [have]);
    const api = me(store, at(10, 21));
    const res = api.restoreBackup({ rows: [{ ...have, amount: 1, description: 'CHANGED' }, lost] });
    expect(res).toEqual({ ok: true, added: 1, skipped: 1 });
    expect(store.t[TABS.transactions].map((r) => [r.id, r.description, r.amount])).toEqual([['a', 'WARUNG', 100000], ['b', 'KOPI', 40000]]);
    expect(store.t[TABS.transactions][1]).toMatchObject({ owner: 'Dewi', gmail_id: 'g7', source: 'email', details: '#bersama', updated_by: 'Me' });
    expect(api.restoreBackup({ rows: [lost] })).toMatchObject({ added: 0, skipped: 1 }); // again: nothing new
  });
  it('a bad row stops the whole thing, naming it; nothing is half-added', () => {
    const store = memoryStore({}, [have]);
    const api = me(store, at(10, 21));
    for (const [bad, why] of [[{ ...lost, id: '' }, /row 2: no id/], [{ ...lost, date: '6 Okt' }, /row 2: date/], [{ ...lost, direction: 'x' }, /row 2: direction/], [{ ...lost, amount: 0 }, /row 2: amount/], [{ ...lost, status: 'weird' }, /row 2: unknown status/]]) {
      expect(() => api.restoreBackup({ rows: [{ ...lost, id: 'ok' }, bad] })).toThrow(why);
    }
    expect(store.t[TABS.transactions]).toHaveLength(1);
    expect(() => api.restoreBackup({ rows: [] })).toThrow(/nothing to restore/);
    expect(() => api.restoreBackup({ rows: Array.from({ length: 5001 }, (_, i) => ({ ...lost, id: `n${i}` })) })).toThrow(/max 5000/);
  });
});

describe('seed data fixes that add accounts', () => {
  const accounts = [{ stream: 'BCA', owner: 'Me' }];
  const rows = [
    { id: 'a', owner: 'Dewi', stream: '', sender: '"Livin\'" <noreply@bank.example>' },
    { id: 'b', owner: 'Dewi', stream: '', sender: 'Shopee <info@shop.example>' },
    { id: 'c', owner: 'Me', stream: '', sender: 'Livin' },
    { id: 'd', owner: 'Dewi', stream: 'BCA', sender: 'Livin' },
  ];
  const fixes = [{ add_accounts: [{ stream: 'Mandiri Dewi', type: 'Spending', owner: 'Dewi' }, { stream: 'BCA', type: 'Spending', owner: 'Dewi' }], fill_stream: [{ owner: 'Dewi', sender: 'livin', stream: 'Mandiri Dewi' }] }];
  it('adds only new account names, and puts only that person\'s unassigned rows from that sender on it', () => {
    const { added, updates } = accountFixes({ accounts, rows, fixes });
    expect(added.map((a) => a.stream)).toEqual(['Mandiri Dewi']);
    expect(updates).toEqual([{ id: 'a', changes: { stream: 'Mandiri Dewi' } }]);
  });
  it('leaves rows alone when the account is not there', () => {
    expect(accountFixes({ accounts, rows, fixes: [{ fill_stream: fixes[0].fill_stream }] }).updates).toEqual([]);
  });
});

describe('rules over waiting rows', () => {
  const rules = [{ id: 'r1', field: 'description', pattern: 'SHOPEE', category: 'Belanja Online', auto_approve: true }, { id: 'r2', field: 'description', pattern: 'WARUNG', category: 'Makan', auto_approve: false }];
  const row = (o) => ({ status: 'pending', stream: 'BCA', category: '', rule_id: '', ...o });
  it('categorises, approves only what the rule auto-approves, and leaves rows with no account alone', () => {
    const rows = [row({ id: 'a', description: 'Top-up ShopeePay' }), row({ id: 'b', description: 'WARUNG X' }), row({ id: 'c', description: 'OVO' }), row({ id: 'd', description: 'SHOPEE', stream: '' })];
    expect(ruleUpdates(rows, rules)).toEqual([
      { id: 'a', changes: { category: 'Belanja Online', rule_id: 'r1', status: 'approved' } },
      { id: 'b', changes: { category: 'Makan', rule_id: 'r2' } },
    ]);
  });
  it('a fee row that already has a category is approved; a categorised row of a manual rule is not touched', () => {
    const rows = [row({ id: 't_1_fee', category: 'Biaya Admin', description: 'Biaya: x' }), row({ id: 'e', category: 'Makan', description: 'zzz' })];
    expect(ruleUpdates(rows, rules)).toEqual([{ id: 't_1_fee', changes: { status: 'approved' } }]);
  });
});

describe('which emails are tried again', () => {
  const day = 86400000;
  it('errors always; waiting only for 14 days', () => {
    expect(retryable('error', 1, 100 * day)).toBe(true);
    expect(retryable('waiting', 90 * day, 100 * day)).toBe(true);
    expect(retryable('waiting', 80 * day, 100 * day)).toBe(false);
    expect(retryable('waiting', 0, 100 * day)).toBe(true);
    expect(retryable('ok', 90 * day, 100 * day)).toBe(false);
  });
});

describe('Review: rules button, dismissing an email, balance steps, one line per inbox', () => {
  it('applyRules settles the waiting rows and review counts them first', () => {
    const rows = [{ id: 'w1', date: '2026-10-05', direction: 'out', amount: 5, stream: 'BCA', category: '', status: 'pending', description: 'SHOPEE X', owner: 'Me' }];
    const store = memoryStore({}, rows);
    store.t[TABS.rules] = [{ id: 'r1', field: 'description', pattern: 'SHOPEE', category: 'Makan', auto_approve: true }];
    store.update = (tab, ups) => ups.forEach(({ id, changes }) => Object.assign(store.t[tab].find((r) => r.id === id), changes));
    const api = me(store, at(10, 21));
    expect(api.review().ruleable).toBe(1);
    expect(api.applyRules()).toEqual({ ok: true, changed: 1 });
    expect(store.t[TABS.transactions][0]).toMatchObject({ category: 'Makan', status: 'approved', rule_id: 'r1', updated_by: 'Me' });
    expect(api.review().ruleable).toBe(0);
  });
  it('dismissing an unreadable email turns its latest log line into a skip', () => {
    const store = memoryStore();
    store.t[TABS.inboxLog] = [{ gmail_id: 'g1', received: '2026-10-05', from: 'bank', subject: 'Transfer', status: 'error', parser: 'livin', reason: 'no amount', rows: 0, gmail: 'dewi@example.com' }];
    const api = she(store, at(10, 21));
    expect(api.review().errors).toHaveLength(1);
    expect(api.dismissEmail({ gmailId: 'g1' })).toEqual({ ok: true });
    expect(api.review().errors).toHaveLength(0);
    expect(() => api.dismissEmail({ gmailId: 'nope' })).toThrow(/unknown email/);
  });
  it('an account with transactions, no balance check and an opening of 0 asks for its balance', () => {
    const rows = [{ id: 'z', date: '2026-10-05', direction: 'out', amount: 5, stream: 'Mandiri Dewi', category: 'Makan', status: 'pending', description: 'x', owner: 'Dewi' }];
    const store = memoryStore({}, rows);
    store.t[TABS.accounts].push({ stream: 'Mandiri Dewi', type: 'Spending', owner: 'Dewi', match_hint: '0202', opening_balance: 0 }, { stream: 'Cash Dewi', type: 'Spending', owner: 'Dewi', match_hint: 'manual', opening_balance: 0 });
    expect(she(store, at(10, 21)).bootstrap().setup.unchecked).toEqual(['Mandiri Dewi']);
    store.cfg.opening_checks = JSON.stringify({ 'Mandiri Dewi': '2026-10-01' });
    expect(she(store, at(10, 21)).bootstrap().setup.unchecked).toEqual([]);
  });
  it('settings tell, per Google account, whether it is connected and whether the last read went wrong', () => {
    const store = memoryStore();
    store.cfg.partner_email = 'dewi@example.com, dewi2@example.com, dewi3@example.com';
    store.t[TABS.connections] = [
      { gmail: 'dewi@example.com', last_sync: '2026-10-21', last_status: 'live ok: +0 rows' },
      { gmail: 'dewi3@example.com', last_sync: '2026-10-21', last_status: 'ERROR: Quota hit | stack' },
    ];
    const g = me(store, at(10, 21)).settings().household.members[1].gmails;
    expect(g.map((x) => [x.email, x.connected, x.problem])).toEqual([['dewi@example.com', true, ''], ['dewi2@example.com', false, ''], ['dewi3@example.com', true, 'Quota hit']]);
  });
});

describe('which mail can be opened from here', () => {
  it('bootstrap lists only the signed-in person\'s own Google accounts', () => {
    const store = memoryStore();
    store.cfg.partner_email = 'dewi@example.com, dewi2@example.com';
    expect(me(store, at(10, 21)).bootstrap().myEmails).toEqual(['me@example.com']);
    expect(she(store, at(10, 21)).bootstrap().myEmails).toEqual(['dewi@example.com', 'dewi2@example.com']);
  });
});
