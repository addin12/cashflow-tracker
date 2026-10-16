// Phone notifications: checking a subscription handed back by the site, the device list, the messages,
// and the one-time code the API puts in the "turn on" link.
import { describe, expect, it } from 'vitest';
import { parseSubscription, safeEqual, addDevice, pushEventsOf, newRowsNotice, billsNotice } from '../src/core/push.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'B'.repeat(87), auth: 'a1b2c3d4e5f6g7h8i9j0kA' } };

describe('subscriptions', () => {
  it('only the browsers\' push services, with well-formed keys', () => {
    expect(parseSubscription(JSON.stringify(sub))).toEqual(sub);
    expect(parseSubscription(JSON.stringify({ ...sub, endpoint: 'https://evil.example.com/fcm.googleapis.com/x' }))).toBeNull();
    expect(parseSubscription(JSON.stringify({ ...sub, keys: { p256dh: 'short', auth: 'x' } }))).toBeNull();
    expect(parseSubscription('not json')).toBeNull();
    expect(parseSubscription(JSON.stringify({ ...sub, endpoint: 'https://web.push.apple.com/QAbc' }))).not.toBeNull();
  });
  it('one entry per phone, newest first, at most five', () => {
    let list = [];
    for (let i = 0; i < 7; i += 1) list = addDevice(list, { ...sub, endpoint: `${sub.endpoint}${i}` }, `HP ${i}`, `2026-10-1${i}`);
    list = addDevice(list, { ...sub, endpoint: `${sub.endpoint}4` }, 'HP 4 again', '2026-10-20');
    expect(list.map((d) => d.label)).toEqual(['HP 4 again', 'HP 6', 'HP 5', 'HP 3', 'HP 2']);
  });
  it('compares codes without short-cuts', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('messages', () => {
  const rows = [
    { description: 'KOPI KENANGAN', amount: 28000, direction: 'out', stream: 'GoPay', status: 'approved' },
    { description: 'TOKO ELEKTRONIK', amount: 2500000, direction: 'out', stream: 'BCA', status: 'pending' },
  ];
  it('big spending first; otherwise every new row; nothing when both are off', () => {
    expect(newRowsNotice(rows, { bigAmount: 1000000 })).toEqual({ title: 'Pengeluaran besar', body: 'TOKO ELEKTRONIK −Rp2.500.000 · BCA', url: '/cek', tag: 'big' });
    expect(newRowsNotice(rows, { bigAmount: 0 })).toMatchObject({ title: '2 transaksi baru', url: '/cek', tag: 'new' });
    expect(newRowsNotice(rows.slice(0, 1), { events: ['big'], bigAmount: 1000000 })).toBeNull();
    expect(pushEventsOf('')).toEqual(['new', 'big', 'bills', 'payday']);
    expect(pushEventsOf('none')).toEqual([]);
    expect(pushEventsOf('close,bogus')).toEqual(['close']);
  });
  it('bills tomorrow, three at most', () => {
    const b = billsNotice([1, 2, 3, 4].map((i) => ({ name: `Tagihan ${i}`, amount: i * 1000 })), 'en');
    expect(b.body).toBe('Tagihan 1 Rp1.000\nTagihan 2 Rp2.000\nTagihan 3 Rp3.000\n+1 more');
  });
});

describe('the API', () => {
  const store = () => {
    const cfg = { owner_name: 'Me', start_date: '2026-09-01' };
    const t = { [TABS.transactions]: [], [TABS.accounts]: [], [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.plans]: [], [TABS.assets]: [] };
    const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
    return { cfg, read: (tab) => (t[tab] || []).slice(), config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots };
  };
  it('the "turn on" link carries a code that is kept for 20 minutes, then renewed', () => {
    const s = store();
    let clock = new Date(2026, 9, 16, 10, 0);
    let n = 0;
    const api = createApi(s, { now: () => clock, push: { site: 'https://karjimut.vercel.app', token: () => `code${n += 1}`, send: () => ({ sent: 1 }) } });
    expect(api.settings().push).toMatchObject({ link: 'https://karjimut.vercel.app/notifikasi?n=code1', events: ['new', 'big', 'bills', 'payday'], devices: [] });
    clock = new Date(2026, 9, 16, 10, 15);
    expect(api.settings().push.link).toMatch(/n=code1$/);
    clock = new Date(2026, 9, 16, 10, 25);
    expect(api.settings().push.link).toMatch(/n=code2$/);
    api.saveConfig({ push_events: ['bills', 'nope'] });
    expect(s.cfg.push_events).toBe('bills');
    api.saveConfig({ push_events: [] });
    expect(s.cfg.push_events).toBe('none');
    expect(api.pushTest()).toEqual({ sent: 1 });
  });
  it('no push settings without a site', () => {
    expect(createApi(store(), { now: () => new Date() }).settings().push).toBeNull();
  });
});
