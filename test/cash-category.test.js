// "Tarik Tunai": the category for cash withdrawals, where it lives, and how a withdrawal gets it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEmail } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';
import { withCashCategory, hasCategory, cashRowUpdates } from '../src/core/cashcat.js';
import { CONFIG_KEYS } from '../src/core/schema.js';

const slots = (income, expense) => ({ income, expense });

describe('the category slots', () => {
  it('goes into the first free expense slot, and nothing else changes', () => {
    const before = slots(['Gaji', '-'], ['Makan', '-', 'Bensin', '-']);
    const next = withCashCategory(before, 'Tarik Tunai');
    expect(next).toEqual(slots(['Gaji', '-'], ['Makan', 'Tarik Tunai', 'Bensin', '-']));
    expect(before.expense[1]).toBe('-'); // the list it was given is not changed
  });
  it('a blank slot counts as free too', () => {
    expect(withCashCategory(slots([], ['Makan', '  ']), 'Tarik Tunai').expense).toEqual(['Makan', 'Tarik Tunai']);
  });
  it('is left alone when it is already a category (whatever the case), income or expense, or when no slot is free', () => {
    expect(withCashCategory(slots(['-'], ['tarik tunai', '-']), 'Tarik Tunai')).toBeNull();
    expect(withCashCategory(slots(['Tarik Tunai'], ['-']), 'Tarik Tunai')).toBeNull();
    expect(withCashCategory(slots(['-'], ['Makan', 'Bensin']), 'Tarik Tunai')).toBeNull();
  });
  it('says whether a name is one of the categories', () => {
    expect(hasCategory(slots(['Gaji'], ['Makan']), ' makan ')).toBe(true);
    expect(hasCategory(slots(['Gaji'], ['Makan']), 'Tarik Tunai')).toBe(false);
  });
  it('is a setting the person can rename', () => {
    expect(CONFIG_KEYS.some((k) => k.key === 'cat_cash')).toBe(true);
  });
});

describe('withdrawals that were already waiting', () => {
  const w = (extra = {}) => ({ id: 'a', direction: 'out', description: 'Tarik tunai ATM', category: '', status: 'pending', stream: 'BCA', ...extra });
  it('go to the category, approved, when they have an account and no category', () => {
    expect(cashRowUpdates([w()], 'Tarik Tunai')).toEqual([{ id: 'a', changes: { category: 'Tarik Tunai', status: 'approved' } }]);
  });
  it('a row the person already filed, ignored, or one with no account, or another payment, is left alone', () => {
    const rows = [w({ id: 'b', category: 'Makan' }), w({ id: 'c', status: 'ignored' }), w({ id: 'd', stream: '' }), w({ id: 'e', description: 'WARUNG' }), w({ id: 'f', direction: 'in' }), w({ id: 'g', status: 'approved' })];
    expect(cashRowUpdates(rows, 'Tarik Tunai')).toEqual([]);
  });
});

describe('the BCA withdrawal email and the planner', () => {
  const body = readFileSync(new URL('./fixtures/emails/bca.txt', import.meta.url), 'utf8').split(/^=== /m).find((c) => c.startsWith('bca-cash-withdrawal')).split(/^---$/m).slice(1).join('---').replace(/^\r?\n/, '');
  const mail = () => ({ id: 'w', from: 'BCA <bca@bca.co.id>', subject: 'Cash Withdrawal Successful', epochMs: 1793000000000, isHtml: false, body });
  const bank = { stream: 'BCA Dewi', type: 'Spending', institution: 'BCA', match_hint: '22', owner: 'Dewi' };
  const run = ({ categories, accounts = [bank], rules = [] }) => planSync({
    emails: [{ id: 'w', from: 'bca', epochMs: 1793000000000, gmail: 'dewi@example.com', result: parseEmail(mail()) }],
    existing: [], accounts, rules, nowIso: '2026-11-10T00:00:00Z',
    config: { owner: 'Dewi', ownerNames: [], categories: { transfer: 'trf', fee: 'Biaya Admin', dividend: 'Dividen', ...categories } },
  });
  it('the reader marks a withdrawal as cash', () => {
    expect(parseEmail(mail()).events[0]).toMatchObject({ cash: true, description: 'Tarik tunai ATM' });
  });
  it('a withdrawal from a known account files itself under the cash category, approved', () => {
    expect(run({ categories: { cash: 'Tarik Tunai' } }).add[0]).toMatchObject({ stream: 'BCA Dewi', category: 'Tarik Tunai', status: 'approved', amount: 500000, direction: 'out' });
  });
  it('with no account it still waits (with the category), and with no cash category yet it waits for the person', () => {
    expect(run({ categories: { cash: 'Tarik Tunai' }, accounts: [] }).add[0]).toMatchObject({ category: 'Tarik Tunai', status: 'pending' });
    expect(run({ categories: { cash: '' } }).add[0]).toMatchObject({ category: '', status: 'pending' });
    expect(run({ categories: {} }).add[0]).toMatchObject({ category: '', status: 'pending' });
  });
  it('a rule of the person decides before the cash category', () => {
    const rule = { id: 'r1', field: 'description', pattern: 'TARIK TUNAI', category: 'Uang Saku', autoApprove: false };
    const row = run({ categories: { cash: 'Tarik Tunai' }, rules: [rule] }).add[0];
    expect(row).toMatchObject({ category: 'Uang Saku', rule_id: 'r1', status: 'pending' });
  });
});
