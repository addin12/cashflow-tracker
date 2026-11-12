// Neither person reads the other's e-mail: the unreadable-e-mail list (Cek, the bell) and "dismiss" only know a person's own Google accounts.
import { describe, expect, it } from 'vitest';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';
import { csvCell } from '../src/core/csv.js';

const line = (id, gmail, subject) => ({ gmail_id: id, received: '2026-10-05', from: 'bank', subject, status: 'error', parser: 'livin', reason: 'no amount found', gmail });
function store(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [], [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: 0 }], [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
    [TABS.inboxLog]: [line('g1', 'me@example.com', 'Mine one'), line('g2', 'dewi@example.com', 'Hers one'), line('g3', 'dewi.work@example.com', 'Hers two')],
  };
  const cfg = { owner_name: 'Me', owner_email: 'me@example.com', start_date: '2026-09-01', payday_day: 28, ...cfgExtra };
  const slots = buildCategorySlots({ income: ['gaji'], expense: ['fnb'] });
  return { t, cfg, read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append: (tab, rows) => { t[tab].push(...rows); }, update() {}, remove() {}, replace() {}, config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {} };
}
const TWO = { partner_name: 'Dewi', partner_email: 'dewi@example.com, dewi.work@example.com' };
const as = (s, who) => createApi(s, { now: () => new Date(2026, 9, 5, 10), meName: who === 'Dewi' ? 'Dewi' : 'Me', myEmail: who === 'Dewi' ? 'dewi@example.com' : 'me@example.com', isOwner: who !== 'Dewi' });

describe('unreadable e-mails are per mailbox owner', () => {
  it('alone, everything shows', () => { expect(as(store(), 'Me').review().errors.map((e) => e.gmail_id)).toEqual(['g1', 'g2', 'g3']); });
  it('two people: each sees only the lines of their own Google accounts (a person may have several)', () => {
    const s = store(TWO);
    expect(as(s, 'Me').review().errors.map((e) => e.gmail_id)).toEqual(['g1']);
    expect(as(s, 'Dewi').review().errors.map((e) => e.gmail_id)).toEqual(['g2', 'g3']);
  });
  it('a line with no mailbox on it belongs to nobody in a two-person household', () => {
    const s = store(TWO);
    s.t[TABS.inboxLog].push(line('g4', undefined, 'Nobody'));
    expect(as(s, 'Me').review().errors.map((e) => e.gmail_id)).toEqual(['g1']);
  });
  it('you can dismiss your own, not the other person\'s', () => {
    const s = store(TWO);
    expect(() => as(s, 'Me').dismissEmail({ gmailId: 'g2' })).toThrow('unknown email');
    expect(as(s, 'Me').dismissEmail({ gmailId: 'g1' })).toEqual({ ok: true });
    expect(s.t[TABS.inboxLog].at(-1)).toMatchObject({ gmail_id: 'g1', status: 'skip' });
  });
});

describe('CSV cells that a spreadsheet would run', () => {
  it('are quoted, also when they start with "-" and a digit', () => {
    for (const text of ['=1+1', '+1+1', '@SUM(A1)', '-2+3+cmd|\' /C calc\'!A0', '-1+HYPERLINK("x")', '-', '-A1', '\tcmd', '\rcmd']) expect(csvCell(text).replace(/^"/, ''), text).toMatch(/^'/);
  });
  it('plain negative numbers and ordinary text are left alone', () => {
    for (const text of ['-5', '-12.5', 'Bakso', '5-2', 'Rp -5 x']) expect(csvCell(text), text).toBe(text);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('-1,5')).toBe('"-1,5"'); // quoted only because of the comma, not as a formula
  });
});
