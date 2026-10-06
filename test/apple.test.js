// Apple receipts: parsed from both layouts, then written onto the bank's APPLE.COM/BILL row.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEmail } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';
import { reviewItems } from '../src/core/app.js';

const html = (file) => readFileSync(new URL(`./fixtures/emails/${file}`, import.meta.url), 'utf8');
const RECEIPT = { from: 'Apple <no_reply@email.apple.com>', subject: 'Your receipt from Apple.', isHtml: true };
const older = { ...RECEIPT, id: 'a1', epochMs: Date.UTC(2026, 8, 16, 6, 5), body: html('apple-receipt-older.html') };
const newer = { ...RECEIPT, id: 'a2', epochMs: Date.UTC(2026, 9, 5, 12, 3), body: html('apple-receipt-newer.html') };

const ACCOUNTS = [{ stream: 'blu', type: 'Spending', institution: 'blu', match_hint: '1234' }];
const RULES = [{ id: 'r3', field: 'description', pattern: 'APPLE\\.COM', category: 'Langganan Digital', auto_approve: true }];
const CONFIG = { owner: 'Me', ownerNames: [], categories: { transfer: 'trf ke bank lain', fee: 'Biaya Admin', dividend: 'Dividen & Bunga' } };
const bankRow = (id, extra) => ({
  id, date: '2026-09-16', time: '09:04:52', stream: 'blu', direction: 'out', amount: 599000, category: 'Langganan Digital', description: 'APPLE.COM/BILL',
  details: 'Kartu debit · Debit Online (Recurring/Autopay)', gmail_id: `g_${id}`, status: 'approved', rule_id: 'r3', updated_by: 'sync', ...extra,
});
const plan = (emails, existing, { rules = RULES, now = '2026-10-06T05:00:00.000Z' } = {}) => planSync({
  emails: emails.map((e) => ({ id: e.id, from: e.from, epochMs: e.epochMs, gmail: 'you@gmail.com', result: parseEmail(e) })),
  existing, accounts: ACCOUNTS, rules, config: CONFIG, nowIso: now,
});

describe('Apple receipt parser', () => {
  it('reads the older layout once (the mobile copy is ignored) and decodes D&amp;D', () => {
    const r = parseEmail(older);
    expect(r.status).toBe('ok');
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      type: 'receipt', date: '2026-09-16', amount: 599000, refNo: 'MXTEST0001', description: 'D&D Beyond',
      items: [{ app: 'D&D Beyond', item: 'Arcana Unleashed', kind: 'In-App Purchase', renews: '', price: 599000 }],
    });
  });

  it('reads the newer subscription layout', () => {
    const r = parseEmail(newer);
    expect(r.events[0]).toMatchObject({
      date: '2026-10-04', amount: 19000, refNo: 'MXTEST0002', description: 'Getcontact: Spam Caller ID',
      items: [{ app: 'Getcontact: Spam Caller ID', item: 'Getcontact New Premium (Monthly)', kind: 'Subscription', renews: 'Renews 5 November 2026', price: 19000 }],
    });
  });

  it('skips other Apple emails', () => {
    expect(parseEmail({ ...newer, subject: 'Your Subscription is Expiring' }).status).toBe('skip');
  });
});

describe('naming the APPLE.COM/BILL charge', () => {
  it('a purchase gets its app and item, and goes back to Review for a category', () => {
    const p = plan([older], [bankRow('t1'), bankRow('t9', { date: '2026-09-25' })]);
    expect(p.add).toHaveLength(0);
    expect(p.update).toEqual([{ id: 't1', changes: expect.objectContaining({
      description: 'D&D Beyond', details: 'Arcana Unleashed, In-App Purchase · Apple order MXTEST0001 · Kartu debit · Debit Online (Recurring/Autopay)',
      category: '', rule_id: '', status: 'pending',
    }) }]);
    expect(p.log[0]).toMatchObject({ status: 'ok', reason: 'named Apple charge t1' });
  });

  it('a subscription keeps its category; the charge may come a day after the receipt date', () => {
    const p = plan([newer], [bankRow('t2', { date: '2026-10-05', amount: 19000 })]);
    const c = p.update[0].changes;
    expect(c).toMatchObject({ description: 'Getcontact: Spam Caller ID', details: expect.stringContaining('Getcontact New Premium (Monthly), renews 5 November 2026 · Apple order MXTEST0002') });
    expect(c).not.toHaveProperty('status');
    expect(c).not.toHaveProperty('category');
  });

  it('a rule for the app name now applies (after "always use this category for D&D Beyond")', () => {
    const rules = [{ id: 'r9', field: 'description', pattern: 'D&D Beyond', category: 'Hobi & Board Game', auto_approve: true }, ...RULES];
    expect(plan([older], [bankRow('t1')], { rules }).update[0].changes).toMatchObject({ category: 'Hobi & Board Game', rule_id: 'r9', status: 'approved' });
  });

  it('a row someone already edited keeps its category, only gets the name', () => {
    const c = plan([older], [bankRow('t1', { updated_by: 'Me', category: 'Hobi & Board Game' })]).update[0].changes;
    expect(c.description).toBe('D&D Beyond');
    expect(c).not.toHaveProperty('category');
  });

  it('waits (tried again next run) while the charge is not in yet, for up to 4 days', () => {
    const p = plan([older], [], { now: '2026-09-16T08:00:00.000Z' });
    expect(p.log[0].status).toBe('waiting'); // charge not in yet: tried again next run
    const later = plan([older], [], { now: '2026-09-25T00:00:00.000Z' });
    expect(later.log[0]).toMatchObject({ status: 'ok', reason: expect.stringContaining('no Apple charge') }); // gives up after 4 days
  });

  it('never names the same charge twice, and ignores other amounts and dates', () => {
    expect(plan([older], [bankRow('t1', { details: 'x · Apple order MX1' })]).update).toHaveLength(0);
    expect(plan([older], [bankRow('t1', { amount: 49000 })]).update).toHaveLength(0);
    expect(plan([older], [bankRow('t1', { date: '2026-09-25' })]).update).toHaveLength(0);
  });
});

describe('unread emails in Review', () => {
  it('an email that failed once and worked on a retry is not shown as unread', () => {
    const log = [
      { gmail_id: 'a1', status: 'error', reason: 'no items in the Apple receipt' },
      { gmail_id: 'b1', status: 'error', reason: 'no amount found' },
      { gmail_id: 'a1', status: 'ok', reason: 'named Apple charge t1' },
    ];
    expect(reviewItems([], log, { today: new Date(2026, 9, 6) }).errors.map((e) => e.gmail_id)).toEqual(['b1']);
  });
});
