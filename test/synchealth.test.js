// Accounts that have stopped syncing are found, and said so in the app and in an email.
import { describe, expect, it } from 'vitest';
import { staleSyncs, STALE_AFTER_MS } from '../src/core/synchealth.js';
import { alertEmail } from '../src/core/notices.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const now = new Date('2026-11-10T12:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const H = 3600000;

describe('staleSyncs', () => {
  it('lists accounts that last synced more than two hours ago, the longest silent first', () => {
    const rows = [{ gmail: 'a@example.com', last_sync: ago(30 * 60000) }, { gmail: 'b@example.com', last_sync: ago(5 * H) }, { gmail: 'c@example.com', last_sync: ago(3 * H + 1000) }];
    expect(staleSyncs(rows, now)).toEqual([{ gmail: 'b@example.com', hours: 5 }, { gmail: 'c@example.com', hours: 3 }]);
  });
  it('exactly two hours is still fine (the heartbeat is half an hour)', () => {
    expect(staleSyncs([{ gmail: 'a@example.com', last_sync: ago(STALE_AFTER_MS) }], now)).toEqual([]);
    expect(staleSyncs([{ gmail: 'a@example.com', last_sync: ago(STALE_AFTER_MS + 60000) }], now)).toHaveLength(1);
  });
  it('reads a Date as well as text, and ignores rows that never synced or have no readable time', () => {
    const rows = [{ gmail: 'a@example.com', last_sync: new Date(now.getTime() - 4 * H) }, { gmail: 'b@example.com', last_sync: '' }, { gmail: 'c@example.com' }, { gmail: 'd@example.com', last_sync: 'yesterday' }, { gmail: '', last_sync: ago(9 * H) }];
    expect(staleSyncs(rows, now)).toEqual([{ gmail: 'a@example.com', hours: 4 }]);
  });
  it('skips the account that is running right now, in any letter case', () => {
    expect(staleSyncs([{ gmail: 'A@Example.com', last_sync: ago(9 * H) }], now, { skip: 'a@example.com' })).toEqual([]);
  });
});

describe('the alert email', () => {
  const stale = [{ who: 'Dewi', gmail: 'dewi@example.com', hours: 5 }];
  it('names the person, the account and how long, in both languages', () => {
    const id = alertEmail({ stale }, { lang: 'id' });
    const en = alertEmail({ stale }, { lang: 'en' });
    expect(id.html).toContain('Dewi');
    expect(id.html).toContain('dewi@example.com');
    expect(id.html).toMatch(/5 jam/);
    expect(en.html).toMatch(/5 hours/);
    expect(id.subject).not.toBe(en.subject);
  });
  it('still renders the older kinds of alert', () => {
    expect(alertEmail({ error: 'boom' }, { lang: 'en' }).html).toContain('boom');
  });
});

describe('what the app is told', () => {
  const mk = (connections) => {
    const t = {
      [TABS.transactions]: [], [TABS.accounts]: [], [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.owed]: [], [TABS.assets]: [], [TABS.plans]: [],
      [TABS.connections]: connections,
    };
    const cfg = { owner_name: 'Me', owner_email: 'me@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com, dewi.two@example.com', start_date: '2026-09-01' };
    const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
    return { read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append() {}, update() {}, remove() {}, replace() {}, config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {} };
  };
  it('names the person whose account is quiet, and leaves the working ones out', () => {
    const api = createApi(mk([
      { gmail: 'me@example.com', last_sync: ago(10 * 60000), last_status: 'live ok' },
      { gmail: 'dewi@example.com', last_sync: ago(6 * H), last_status: 'live ok' },
      { gmail: 'dewi.two@example.com', last_sync: ago(20 * 60000), last_status: 'live ok' },
    ]), { now: () => now, isOwner: true, meName: 'Me', myEmail: 'me@example.com' });
    expect(api.bootstrap().staleSync).toEqual([{ gmail: 'dewi@example.com', hours: 6, who: 'Dewi' }]);
  });
  it('is empty when every account is syncing', () => {
    const api = createApi(mk([{ gmail: 'me@example.com', last_sync: ago(5 * 60000) }]), { now: () => now, isOwner: true, meName: 'Me', myEmail: 'me@example.com' });
    expect(api.bootstrap().staleSync).toEqual([]);
  });
});
