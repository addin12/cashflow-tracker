// E-wallets: a ride paid with a wallet is spending of that wallet; a top-up to a wallet that is not an account asks for it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEmail, hasReader, SENDERS } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';
import { unknownAccounts, adoptRows } from '../src/core/newaccounts.js';

const F = {};
for (const chunk of readFileSync(new URL('./fixtures/emails/grab.txt', import.meta.url), 'utf8').split(/^=== /m).slice(1)) {
  const [head, ...rest] = chunk.split(/^---$/m);
  const lines = head.split(/\r?\n/);
  const h = Object.fromEntries(lines.slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  F[lines[0].trim()] = { id: lines[0].trim(), from: h.from, subject: h.subject, epochMs: Number(h.epoch), body: rest.join('---').replace(/^\r?\n/, ''), isHtml: false };
}

describe('the Grab e-receipt reader', () => {
  it('is routed by sender and subject, and searched for', () => {
    expect(hasReader('Grab <no-reply@grab.com>', 'Your Grab E-Receipt')).toBe(true);
    expect(hasReader('Grab <no-reply@grab.com>', 'Welcome to Grab')).toBe(false);
    expect(SENDERS).toContain('no-reply@grab.com');
  });
  it('a ride paid with OVO is a payment out of the OVO wallet, named by the service, with the booking as its reference', () => {
    const r = parseEmail(F['grab-ovo']);
    expect(r.status, r.reason).toBe('ok');
    expect(r.events).toMatchObject([{
      type: 'payment', direction: 'out', date: '2026-11-05', time: '', amount: 12500, fee: 0, account: { institution: 'OVO', hint: '' },
      counterparty: { name: 'Grab' }, description: 'Grab Bike Hemat', details: 'Grab · A-1ABC2DEF3GHI', refNo: 'A-1ABC2DEF3GHI',
    }]);
  });
  it('cash and card are skipped (no wallet to take it from; the card has its own bank email), and so is a receipt with no method', () => {
    expect(parseEmail(F['grab-cash'])).toMatchObject({ status: 'skip' });
    expect(parseEmail(F['grab-card'])).toMatchObject({ status: 'skip' });
    expect(parseEmail(F['grab-no-method'])).toMatchObject({ status: 'skip', reason: 'no payment method on the receipt' });
  });
  it('a wallet receipt without a date is an error with its outline, not a guess', () => {
    const r = parseEmail(F['grab-gopay-no-date']);
    expect(r.status).toBe('error');
    expect(r.reason).toContain('no ride date');
    expect(r.reason).toContain('[outline: ');
  });
});

describe('wallets in the sync', () => {
  const ME = { owner: 'Dewi', ownerNames: ['DEWI CONTOH'], categories: { transfer: 'trf', fee: 'Biaya Admin', dividend: 'Dividen' } };
  const bank = { stream: 'BRI Dewi', type: 'Spending', institution: 'BRI', match_hint: '1111', owner: 'Dewi' };
  const ovo = { stream: 'OVO Dewi', type: 'Spending', institution: 'OVO', match_hint: '0812', owner: 'Dewi' };
  const run = (emails, accounts) => planSync({ emails, existing: [], accounts, rules: [], config: ME, nowIso: '2026-11-10T00:00:00Z' });
  const grab = () => ({ id: 'g1', from: 'no-reply@grab.com', epochMs: 1793000000000, gmail: 'dewi@example.com', result: parseEmail(F['grab-ovo']) });
  const topup = () => ({
    id: 'u1', from: 'bank', epochMs: 1793000000000, gmail: 'dewi@example.com',
    result: { status: 'ok', parser: 't', events: [{ type: 'topup', direction: 'out', date: '2026-11-05', time: '20:15:00', amount: 100000, fee: 1000, account: { institution: 'BRI', hint: '1111' }, counterparty: { name: 'OVO', institution: 'OVO', account: '081200000812' }, description: 'Top-up OVO', details: '', refNo: 'R1' }] },
  });

  it('a wallet ride becomes spending on the wallet account when there is one', () => {
    const p = run([grab()], [bank, ovo]);
    expect(p.add).toHaveLength(1);
    expect(p.add[0]).toMatchObject({ stream: 'OVO Dewi', direction: 'out', amount: 12500, description: 'Grab Bike Hemat', owner: 'Dewi' });
  });
  it('without the wallet account it waits without an account and the log asks for the wallet', () => {
    const p = run([grab()], [bank]);
    expect(p.add[0]).toMatchObject({ stream: '', status: 'pending' });
    expect(p.log[0].reason).toBe('account not recognised (OVO)');
    const log = [{ gmail_id: 'g1', reason: p.log[0].reason, rows: 1, gmail: 'dewi@example.com' }];
    expect(unknownAccounts(log, ['dewi@example.com'], [bank])).toEqual([{ institution: 'OVO', hint: '', count: 1 }]);
  });
  it('adding the wallet account later gives the waiting ride to it', () => {
    const p = run([grab()], [bank]);
    const waiting = p.add.map((r) => ({ ...r }));
    const log = [{ gmail_id: 'g1', reason: p.log[0].reason }];
    expect(adoptRows(log, waiting, { ...ovo, match_hint: '' })).toEqual([{ id: 't_g1', changes: { stream: 'OVO Dewi' } }]);
  });
  it('a top-up to a wallet that is not an account is a payment that asks for the wallet, with the last four digits of its number', () => {
    const p = run([topup()], [bank]);
    expect(p.add[0]).toMatchObject({ stream: 'BRI Dewi', direction: 'out', category: '', status: 'pending' });
    expect(p.log[0].reason).toBe('account not recognised (OVO …0812)');
    const log = [{ gmail_id: 'u1', reason: p.log[0].reason, rows: 2, gmail: 'dewi@example.com' }];
    expect(unknownAccounts(log, ['dewi@example.com'], [bank])).toEqual([{ institution: 'OVO', hint: '0812', count: 2 }]);
  });
  it('with the wallet as an account the top-up is a transfer into it, so its balance rises by the amount', () => {
    const p = run([topup()], [bank, ovo]);
    const legs = p.add.filter((r) => r.transfer_id);
    expect(legs.map((r) => [r.stream, r.direction, r.amount, r.category])).toEqual([['BRI Dewi', 'out', 100000, 'trf'], ['OVO Dewi', 'in', 100000, 'trf']]);
    expect(p.log[0].reason).not.toContain('not recognised');
  });
  it('a top-up to a person or an unknown destination without an institution asks for nothing', () => {
    const e = topup();
    e.result.events[0].counterparty = { name: 'Someone' };
    expect(run([e], [bank]).log[0].reason).toBe('');
  });
});

describe('a suggestion for an account with no number to compare', () => {
  it('goes away once the person has an account at that institution, and stays while they have none', () => {
    const log = [{ gmail_id: 'g1', reason: 'account not recognised (OVO)', rows: 3, gmail: 'dewi@example.com' }];
    expect(unknownAccounts(log, ['dewi@example.com'], [])).toEqual([{ institution: 'OVO', hint: '', count: 3 }]);
    expect(unknownAccounts(log, ['dewi@example.com'], [{ stream: 'OVO Dewi', institution: 'OVO', match_hint: '' }])).toEqual([]);
    expect(unknownAccounts(log, ['dewi@example.com'], [{ stream: 'BRI', institution: 'BRI', match_hint: '' }])).toHaveLength(1);
  });
  it('one with a number still needs a matching number', () => {
    const log = [{ gmail_id: 'u1', reason: 'account not recognised (OVO …0812)', rows: 1, gmail: 'dewi@example.com' }];
    expect(unknownAccounts(log, ['dewi@example.com'], [{ stream: 'OVO Dewi', institution: 'OVO', match_hint: '0812' }])).toEqual([]);
    expect(unknownAccounts(log, ['dewi@example.com'], [{ stream: 'OVO Dewi', institution: 'OVO', match_hint: '9999' }])).toHaveLength(1);
  });
});

describe('the GrabFood layout', () => {
  it('is the amount paid from the wallet after promos, the restaurant, the order and the time (two-digit year)', () => {
    const r = parseEmail(F['grab-food-ovo']);
    expect(r.status, r.reason).toBe('ok');
    expect(r.events).toMatchObject([{
      type: 'payment', direction: 'out', date: '2026-11-05', time: '12:34:00', amount: 38000, account: { institution: 'OVO', hint: '' },
      counterparty: { name: 'Warung Contoh - Jakarta' }, description: 'GrabFood Warung Contoh - Jakarta', details: 'GrabFood · A-FOOD1234', refNo: 'A-FOOD1234',
    }]);
  });
  it('cash is skipped, and a receipt with no payment line is skipped', () => {
    expect(parseEmail(F['grab-food-cash'])).toMatchObject({ status: 'skip' });
    expect(parseEmail({ ...F['grab-food-ovo'], body: 'Detail Pembayaran:\nWAKTU\n05 Nov 26 12:34 +0700' })).toMatchObject({ status: 'skip', reason: 'no payment on the receipt' });
  });
  it('an unreadable date is an error, not a guess', () => {
    expect(parseEmail({ ...F['grab-food-ovo'], body: F['grab-food-ovo'].body.replace('05 Nov 26 12:34 +0700', 'later') }).status).toBe('error');
  });
});
