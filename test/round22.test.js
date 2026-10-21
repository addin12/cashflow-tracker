// Round 22: the backup file read back (restore), the payday plan, first steps for someone new,
// and the yearly report following Kita / Aku / Dia.
import { describe, expect, it } from 'vitest';
import { parseCsv, parseBackupCsv, backupCsv } from '../src/core/csv.js';
import { paydayPlan } from '../src/core/paydayplan.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

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
    expect(me(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 2, payday: true });
    expect(she(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 1, payday: false });
    store.cfg.partner_payday_day = 25;
    store.t[TABS.accounts] = store.t[TABS.accounts].filter((a) => a.owner !== 'Dewi');
    expect(she(store, at(10, 21)).bootstrap().setup).toEqual({ accounts: 0, payday: true });
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
