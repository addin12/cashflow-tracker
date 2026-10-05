import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEmail } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';
import { resolveAccount, isOwnerName, digitsMatch, ownCounterparty } from '../src/core/accounts.js';
import { matchRule, literalPattern } from '../src/core/rules.js';

function loadFixtures(file) {
  const out = {};
  const text = readFileSync(new URL(`./fixtures/emails/${file}`, import.meta.url), 'utf8');
  for (const chunk of text.split(/^=== /m).slice(1)) {
    const [head, ...rest] = chunk.split(/^---$/m);
    const lines = head.split(/\r?\n/);
    const h = Object.fromEntries(lines.slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
    out[lines[0].trim()] = { id: lines[0].trim(), from: h.from, subject: h.subject, epochMs: Number(h.epoch), body: rest.join('---'), isHtml: false };
  }
  return out;
}
const F = { ...loadFixtures('bca.txt'), ...loadFixtures('livin.txt'), ...loadFixtures('others.txt') };
const email = (name, overrides = {}) => {
  const e = { ...F[name], ...overrides };
  return { id: e.id, from: e.from, epochMs: e.epochMs, gmail: 'you@gmail.com', result: parseEmail(e) };
};

const ACCOUNTS = [
  { stream: 'BCA', type: 'Spending', institution: 'BCA', match_hint: '1234567856' },
  { stream: 'Mandiri', type: 'Spending', institution: 'Mandiri', match_hint: '60010002468, 2468' },
  { stream: 'blu', type: 'Spending', institution: 'blu', match_hint: '001234567890, 1111' },
  { stream: 'Jago', type: 'Spending', institution: 'Jago', match_hint: '109876543210' },
  { stream: 'GoPay', type: 'Spending', institution: 'GoPay', match_hint: '' },
  { stream: 'Cash', type: 'Spending', institution: '', match_hint: 'manual' },
  { stream: 'Jago Dana Darurat', type: 'Saving', institution: 'Jago', match_hint: 'Kantong Dana Darurat' },
  { stream: 'Saham', type: 'Saving', institution: 'Mandiri Sekuritas', match_hint: '' },
];
const RULES = [
  { id: 'r1', field: 'description', pattern: 'CIRCLE ?K|ALFA', category: 'Belanja Harian', auto_approve: true },
  { id: 'r2', field: 'description', pattern: 'TOKOPEDIA|SHOPEE', category: 'Belanja Online', auto_approve: 'TRUE' },
  { id: 'r3', field: 'description', pattern: 'APPLE\\.COM', category: 'Langganan Digital', auto_approve: false },
  { id: 'bad', field: 'description', pattern: '([', category: 'Never', auto_approve: true },
];
const CONFIG = {
  owner: 'Me', ownerNames: ['BUDI SANTOSO PUTRA'],
  categories: { transfer: 'trf ke bank lain', fee: 'Biaya Admin', dividend: 'Dividen & Bunga' },
};
const plan = (emails, existing = [], accounts = ACCOUNTS) =>
  planSync({ emails, existing, accounts, rules: RULES, config: CONFIG, nowIso: '2026-10-05T10:00:00Z' });

describe('accounts', () => {
  it('matches masked and full account numbers', () => {
    expect(digitsMatch('1234****56', '56')).toBe(true);
    expect(digitsMatch('1234567856', '56')).toBe(true);
    expect(digitsMatch('1234567856', '56', 4)).toBe(false);
  });
  it('resolves streams by hint, pocket, or the only account at a bank', () => {
    expect(resolveAccount({ institution: 'BCA', hint: '56' }, ACCOUNTS)).toBe('BCA');
    expect(resolveAccount({ institution: 'Mandiri', hint: '2468' }, ACCOUNTS)).toBe('Mandiri');
    expect(resolveAccount({ institution: 'blu', hint: '1111' }, ACCOUNTS)).toBe('blu');
    expect(resolveAccount({ institution: 'Jago', pocket: 'Dana Darurat' }, ACCOUNTS)).toBe('Jago Dana Darurat');
    expect(resolveAccount({ institution: 'Jago' }, ACCOUNTS)).toBe('Jago');
    expect(resolveAccount({ institution: 'BCA', pocket: 'Hobby' }, ACCOUNTS)).toBe('BCA');
    expect(resolveAccount({ institution: 'BRI' }, ACCOUNTS)).toBe('');
    expect(resolveAccount({ institution: 'BCA', hint: '9999999999' }, ACCOUNTS, { strict: true })).toBe('');
  });
  it('recognises the owner name, also truncated', () => {
    expect(isOwnerName('BUDI SANTOSO PUT', CONFIG.ownerNames)).toBe(true);
    expect(isOwnerName('Budi Santoso Putra', CONFIG.ownerNames)).toBe(true);
    expect(isOwnerName('BUDI', CONFIG.ownerNames)).toBe(false);
    expect(isOwnerName('SITI AMINAH', CONFIG.ownerNames)).toBe(false);
  });
  it('a pocket transfer to someone else is not an own move', () => {
    const ev = { type: 'transfer', account: { institution: 'BCA', pocket: 'Hobby' }, counterparty: { name: 'DEWI LESTARI', institution: 'BCA', account: '6040000003' } };
    expect(ownCounterparty(ev, ACCOUNTS, CONFIG.ownerNames).own).toBe(false);
  });
});

describe('rules', () => {
  it('first matching rule wins; broken patterns are ignored', () => {
    expect(matchRule({ description: 'CIRCLEKA INDONESIA UTAMA' }, RULES).category).toBe('Belanja Harian');
    expect(matchRule({ description: 'nothing' }, RULES)).toBeNull();
    expect(matchRule({ description: 'X' }, [{ pattern: '([', category: 'A' }, { pattern: 'X', category: 'B' }]).category).toBe('B');
  });
  it('makes literal patterns', () => expect(new RegExp(literalPattern('CIRCLE K (JKT)')).test('CIRCLE K (JKT)')).toBe(true));
});

describe('planSync', () => {
  it('categorizes a payment by rule and approves it', () => {
    const { add, log } = plan([email('bca-qris')]);
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({
      id: 't_bca-qris', stream: 'BCA', direction: 'out', amount: 25500, category: 'Belanja Harian', status: 'approved',
      rule_id: 'r1', gmail_id: 'bca-qris', date: '2026-10-05', time: '09:17:32', owner: 'Me',
    });
    expect(log[0]).toMatchObject({ status: 'ok', rows: 1 });
  });

  it('a rule without auto-approve leaves the row in Review', () => {
    expect(plan([email('blu-card')]).add[0]).toMatchObject({ stream: 'blu', category: 'Langganan Digital', status: 'pending' });
  });

  it('own transfer BCA -> blu: two legs plus the fee; the blu email then links instead of duplicating', () => {
    const first = plan([email('bca-transfer-other-bank')]);
    expect(first.add.map((r) => [r.stream, r.direction, r.amount, r.category, r.gmail_id ? 'email' : 'mirror'])).toEqual([
      ['BCA', 'out', 1000000, 'trf ke bank lain', 'email'],
      ['blu', 'in', 1000000, 'trf ke bank lain', 'mirror'],
      ['BCA', 'out', 2500, 'Biaya Admin', 'email'],
    ]);
    expect(first.add[0].transfer_id).toBe(first.add[1].transfer_id);
    const second = plan([email('blu-incoming')], first.add);
    expect(second.add).toEqual([]);
    expect(second.update).toEqual([expect.objectContaining({ id: first.add[1].id, changes: expect.objectContaining({ gmail_id: 'blu-incoming' }) })]);
  });

  it('the same transfer in the other order (blu email first) ends the same way', () => {
    const first = plan([email('blu-incoming')]);
    expect(first.add.map((r) => [r.stream, r.direction, r.gmail_id ? 'email' : 'mirror'])).toEqual([['blu', 'in', 'email'], ['BCA', 'out', 'mirror']]);
    const second = plan([email('bca-transfer-other-bank')], first.add);
    expect(second.add.map((r) => [r.stream, r.category])).toEqual([['BCA', 'Biaya Admin']]);
    expect(second.update[0]).toMatchObject({ id: first.add[1].id, changes: { gmail_id: 'bca-transfer-other-bank' } });
  });

  it('both emails in one run also pair up', () => {
    const { add, update } = plan([email('blu-incoming'), email('bca-transfer-other-bank')]);
    const transfers = add.filter((r) => r.category === 'trf ke bank lain');
    expect(transfers).toHaveLength(2);
    expect(new Set(transfers.map((r) => r.transfer_id)).size).toBe(1);
    expect(add.filter((r) => r.category === 'Biaya Admin')).toHaveLength(1);
    expect(update).toHaveLength(0); // the mirror was linked before it was ever written
    expect(transfers.every((r) => r.gmail_id)).toBe(true);
  });

  it('Jago Kantong -> Jago -> own Mandiri are two transfers', () => {
    const { add } = plan([email('jago-kantong'), email('jago-transfer')]);
    expect(add.map((r) => [r.stream, r.direction, r.amount, r.category])).toEqual([
      ['Jago Dana Darurat', 'out', 2000000, 'trf ke bank lain'], ['Jago', 'in', 2000000, 'trf ke bank lain'],
      ['Jago', 'out', 2000000, 'trf ke bank lain'], ['Mandiri', 'in', 2000000, 'trf ke bank lain'],
    ]);
  });

  it('BCA pocket back to the owner records nothing', () => {
    const { add, log } = plan([email('bca-pocket-transfer')]);
    expect(add).toEqual([]);
    expect(log[0]).toMatchObject({ status: 'ok', rows: 0, reason: 'internal move within one account' });
  });

  it('a transfer to another person waits in Review without a category', () => {
    expect(plan([email('livin-transfer')]).add).toEqual([expect.objectContaining({ stream: 'Mandiri', category: '', status: 'pending', description: 'SITI AMINAH' })]);
  });

  it('a payment with a fee: payment by rule + fee row', () => {
    const { add } = plan([email('livin-va')]);
    expect(add.map((r) => [r.amount, r.category, r.status])).toEqual([[250000, 'Belanja Online', 'approved'], [1000, 'Biaya Admin', 'approved']]);
  });

  it('a top-up is a transfer only when the wallet is one of the accounts', () => {
    expect(plan([email('livin-topup-dana')]).add.map((r) => [r.stream, r.category, r.status])).toEqual([
      ['Mandiri', '', 'pending'], ['Mandiri', 'Biaya Admin', 'approved'],
    ]);
    const withDana = [...ACCOUNTS, { stream: 'DANA', type: 'Spending', institution: 'DANA', match_hint: '1357' }];
    expect(plan([email('livin-topup-dana')], [], withDana).add.map((r) => [r.stream, r.direction, r.category])).toEqual([
      ['Mandiri', 'out', 'trf ke bank lain'], ['DANA', 'in', 'trf ke bank lain'], ['Mandiri', 'out', 'Biaya Admin'],
    ]);
  });

  it('dividends go to the investment account', () => {
    expect(plan([email('sekuritas-dividend')]).add[0]).toMatchObject({ stream: 'Saham', direction: 'in', amount: 6600, category: 'Dividen & Bunga', status: 'approved' });
  });

  it('GoPay summary adds only the spending not already recorded', () => {
    const existing = [{ id: 'm1', stream: 'GoPay', direction: 'out', amount: 10000, date: '2026-09-12', source: 'manual', gmail_id: '' }];
    const { add } = plan([email('gopay-summary')], existing);
    expect(add.map((r) => [r.date, r.direction, r.amount, r.status, r.source])).toEqual([
      ['2026-09-30', 'out', 80000, 'pending', 'summary'], ['2026-09-30', 'in', 500, 'pending', 'summary'],
    ]);
  });

  it('an unknown account still lands in Review, with a note', () => {
    const { add, log } = plan([email('bca-qris')], [], ACCOUNTS.filter((a) => a.stream !== 'BCA'));
    expect(add[0]).toMatchObject({ stream: '', status: 'pending', category: 'Belanja Harian' });
    expect(log[0].reason).toMatch(/account not recognised \(BCA …56\)/);
  });

  it('re-running is safe: emails already in Transactions are skipped', () => {
    const first = plan([email('bca-qris'), email('livin-va')]);
    const again = plan([email('bca-qris'), email('livin-va')], first.add);
    expect(again.add).toEqual([]);
    expect(again.log.map((l) => l.status)).toEqual(['duplicate', 'duplicate']);
  });

  it('skips and errors are logged, never turned into rows', () => {
    const broken = email('bca-qris', { id: 'broken', body: F['bca-qris'].body.replace('IDR 25,500.00', '-') });
    const { add, log } = plan([email('livin-failed'), email('jago-promo'), broken]);
    expect(add).toEqual([]);
    expect(log.map((l) => l.status).sort()).toEqual(['error', 'skip', 'skip']);
  });

  it('counts rule hits', () => {
    expect(plan([email('bca-qris'), email('blu-qr')]).ruleHits).toEqual({ r1: 2 });
  });
});
