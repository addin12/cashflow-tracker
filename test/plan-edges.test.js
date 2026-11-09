// Edges of the sync planner that a mutation run (Stryker, 2026-11-10: 65% killed) showed nothing was checking: moving money between
// a person's own accounts, matching the two sides, shop receipts, fees, rules, the GoPay monthly gap and dividends.
import { describe, expect, it } from 'vitest';
import { planSync } from '../src/core/plan.js';

const ACCOUNTS = [
  { stream: 'BCA', type: 'Spending', institution: 'BCA', match_hint: '1111222233', owner: 'Me' },
  { stream: 'Mandiri', type: 'Spending', institution: 'Mandiri', match_hint: '4444555566', owner: 'Me' },
  { stream: 'GoPay', type: 'Spending', institution: 'GoPay', match_hint: '', owner: 'Me' },
];
const CONFIG = { owner: 'Me', ownerNames: ['BUDI CONTOH PUTRA'], categories: { transfer: 'trf', fee: 'Biaya Admin', dividend: 'Dividen' } };
const NOW = '2026-11-10T00:00:00Z';
const EPOCH = Date.parse('2026-11-05T03:00:00Z');

const ev = (o = {}) => ({
  type: 'payment', direction: 'out', date: '2026-11-05', time: '10:00:00', amount: 100000, fee: 0, account: { institution: 'BCA', hint: '2233' },
  counterparty: { name: 'WARUNG' }, description: 'WARUNG', details: '', refNo: '', ...o,
});
const mail = (id, e, epochMs = EPOCH) => ({ id, from: 'bank@example.com', epochMs, gmail: 'me@example.com', result: { status: 'ok', parser: 't', events: Array.isArray(e) ? e : [e] } });
const plan = (emails, existing = [], rules = [], config = CONFIG) => planSync({ emails, existing, accounts: ACCOUNTS, rules, config, nowIso: NOW });
const toMandiri = { name: 'Budi', institution: 'Mandiri', account: '4444555566' };
const row = (o) => ({ id: 'x', date: '2026-11-05', time: '10:00:00', stream: 'Mandiri', direction: 'in', amount: 250000, description: '', details: '', gmail_id: '', transfer_id: '', status: 'pending', updated_by: 'me', ...o });

describe('a transfer between the person\'s own accounts', () => {
  it('becomes two legs with one transfer id, in the transfer category, approved', () => {
    const p = plan([mail('e1', ev({ amount: 250000, counterparty: toMandiri }))]);
    expect(p.add).toHaveLength(2);
    expect(p.add[0]).toMatchObject({ id: 't_e1', stream: 'BCA', direction: 'out', amount: 250000, category: 'trf', status: 'approved', transfer_id: 'x_e1', gmail_id: 'e1', owner: 'Me' });
    expect(p.add[1]).toMatchObject({ id: 't_e1_m', stream: 'Mandiri', direction: 'in', amount: 250000, date: '2026-11-05', category: 'trf', status: 'approved', transfer_id: 'x_e1', gmail_id: '', details: 'Pasangan transfer (account number)' });
  });
  it('an in-coming email whose other leg is already waiting links to it and adds nothing', () => {
    const first = plan([mail('e1', ev({ amount: 250000, counterparty: toMandiri }))]);
    const second = plan(
      [mail('e2', ev({ direction: 'in', account: { institution: 'Mandiri', hint: '5566' }, counterparty: { name: 'Budi', institution: 'BCA', account: '1111222233' }, amount: 250000, time: '10:05:00', refNo: 'R2', details: 'masuk' }), EPOCH + 600000)],
      first.add,
    );
    expect(second.add).toEqual([]);
    expect(second.update).toEqual([{ id: 't_e1_m', changes: expect.objectContaining({ gmail_id: 'e2', ref_no: 'R2', sender: 'bank@example.com', details: 'masuk', updated_by: 'sync' }) }]);
    expect(second.log[0].reason).toContain('linked to an existing transfer');
  });
  it('links by time within 15 minutes (inclusive), not 16; by amount to the cent, not a different one', () => {
    const waiting = [row({ id: 'w1', transfer_id: 't1' })];
    const incoming = (o) => mail('e2', ev({ direction: 'in', account: { institution: 'Mandiri', hint: '5566' }, counterparty: { name: 'Budi' }, amount: 250000, ...o }));
    expect(plan([incoming({ time: '10:15:00' })], waiting).add).toEqual([]);
    expect(plan([incoming({ time: '09:45:00' })], waiting).add).toEqual([]);
    expect(plan([incoming({ time: '10:16:00' })], waiting).add).toHaveLength(1);
    expect(plan([incoming({ amount: 250000.004 })], waiting).add).toEqual([]);
    expect(plan([incoming({ amount: 250000.01 })], waiting).add).toHaveLength(1);
  });
  it('without a time on either side the day decides; with one on only one side the day decides too', () => {
    const incoming = (o) => mail('e2', ev({ direction: 'in', account: { institution: 'Mandiri', hint: '5566' }, counterparty: { name: 'Budi' }, amount: 250000, ...o }));
    const noTime = [row({ id: 'w1', transfer_id: 't1', time: '' })];
    expect(plan([incoming({ time: '' })], noTime).add).toEqual([]);
    expect(plan([incoming({ time: '', date: '2026-11-06' })], noTime).add).toHaveLength(1);
    expect(plan([incoming({ time: '10:00:00' })], noTime).add).toEqual([]);
    expect(plan([incoming({ time: '' })], [row({ id: 'w1', transfer_id: 't1', time: '23:59:00' })]).add).toEqual([]);
    expect(plan([incoming({ time: '23:59:00' })], [row({ id: 'w1', transfer_id: 't1', time: '00:01:00' })]).add).toHaveLength(1); // both have a time: the 15 minutes decide, not the day
  });
  it('does not link to a row of another account, another direction, or one that is not waiting for its other side', () => {
    const incoming = mail('e2', ev({ direction: 'in', account: { institution: 'Mandiri', hint: '5566' }, counterparty: { name: 'Budi' }, amount: 250000 }));
    for (const other of [{ stream: 'BCA' }, { direction: 'out' }, { transfer_id: '' }, { gmail_id: 'seen' }]) {
      expect(plan([incoming], [row({ id: 'w1', transfer_id: 't1', ...other })]).add, JSON.stringify(other)).toHaveLength(1);
    }
  });
  it('an email for the other account that is already in the sheet becomes the other leg: it changes, only this leg is added', () => {
    const lone = row({ id: 'm1', gmail_id: 'e0', time: '10:03:00', status: 'pending' });
    const p = plan([mail('e1', ev({ amount: 250000, counterparty: toMandiri }))], [lone]);
    expect(p.add).toHaveLength(1);
    expect(p.add[0]).toMatchObject({ id: 't_e1', stream: 'BCA', transfer_id: 'x_e1', category: 'trf' });
    expect(p.update).toEqual([{ id: 'm1', changes: expect.objectContaining({ category: 'trf', transfer_id: 'x_e1', status: 'approved', rule_id: '' }) }]);
  });
  it('does not take that other row when it already has a transfer id or has no email behind it', () => {
    for (const other of [{ transfer_id: 'tX' }, { gmail_id: '' }]) {
      const p = plan([mail('e1', ev({ amount: 250000, counterparty: toMandiri }))], [row({ id: 'm1', gmail_id: 'e0', time: '10:03:00', ...other })]);
      expect(p.add, JSON.stringify(other)).toHaveLength(2);
    }
  });
  it('is processed oldest email first, whatever order they arrive in', () => {
    const early = mail('e0', ev({ direction: 'in', account: { institution: 'Mandiri', hint: '5566' }, counterparty: { name: 'Budi' }, amount: 250000, time: '10:03:00' }), EPOCH - 1000);
    const late = mail('e1', ev({ amount: 250000, counterparty: toMandiri }), EPOCH);
    const p = plan([late, early]);
    expect(p.add.map((r) => r.id)).toEqual(['t_e0', 't_e1']); // the early one first, then the late one turns it into a transfer
    expect(p.add[0]).toMatchObject({ transfer_id: 'x_e1', category: 'trf', status: 'approved' });
  });
  it('a move inside one account adds nothing (but its fee is still a cost)', () => {
    const same = ev({ counterparty: { name: 'Budi', institution: 'BCA', account: '1111222233' }, fee: 2500 });
    const p = plan([mail('e1', same)]);
    expect(p.add.map((r) => r.id)).toEqual(['t_e1_fee']);
    expect(p.log[0].reason).toContain('internal move within one account');
  });
  it('the owner\'s own name on an account the app does not know: kept as a row that says so', () => {
    const unknown = ev({ account: { institution: 'Unknown Bank', hint: '9' }, counterparty: { name: 'BUDI CONTOH PUTRA' }, details: 'catatan' });
    const p = plan([mail('e1', unknown)]);
    expect(p.add).toHaveLength(1);
    expect(p.add[0]).toMatchObject({ stream: '', status: 'pending', details: 'catatan · Ke/dari rekening sendiri yang belum terdaftar di Accounts' });
    expect(p.log[0].reason).toContain('account not recognised (Unknown Bank …9)');
    expect(plan([mail('e2', { ...unknown, details: '' })]).add[0].details).toBe('Ke/dari rekening sendiri yang belum terdaftar di Accounts');
  });
});

describe('fees, rules and the log', () => {
  it('a fee is its own row, out, in the fee category, approved when the account is known', () => {
    const p = plan([mail('e1', ev({ fee: 2500 }))]);
    expect(p.add).toHaveLength(2);
    expect(p.add[1]).toMatchObject({ id: 't_e1_fee', stream: 'BCA', direction: 'out', amount: 2500, category: 'Biaya Admin', status: 'approved', description: 'Biaya: WARUNG', details: '' });
    const nameless = plan([mail('e2', ev({ fee: 1000, description: '', type: 'transfer', account: { institution: 'Unknown Bank' } }))]);
    expect(nameless.add[1]).toMatchObject({ stream: '', status: 'pending', description: 'Biaya: transfer' });
  });
  it('a rule sets the category and rule id; it approves only with an account; a stream override moves the row; hits are counted', () => {
    const rules = [{ id: 'r1', field: 'description', pattern: 'WARUNG', category: 'Makan', auto_approve: 'ya', stream_override: 'GoPay' }];
    const p = plan([mail('e1', ev())], [], rules);
    expect(p.add[0]).toMatchObject({ category: 'Makan', rule_id: 'r1', status: 'approved', stream: 'GoPay' });
    expect(p.ruleHits).toEqual({ r1: 1 });
    const noAccount = plan([mail('e2', ev({ account: { institution: 'Unknown Bank' } }))], [], [{ id: 'r1', field: 'description', pattern: 'WARUNG', category: 'Makan', auto_approve: 'ya' }]);
    expect(noAccount.add[0]).toMatchObject({ category: 'Makan', status: 'pending', stream: '' });
    const manual = plan([mail('e3', ev())], [], [{ pattern: 'WARUNG', category: 'Makan', auto_approve: 'no' }]);
    expect(manual.add[0]).toMatchObject({ category: 'Makan', rule_id: '', status: 'pending' });
    expect(manual.ruleHits).toEqual({});
  });
  it('an email already in Transactions, or seen twice in one run, is logged as a duplicate and adds nothing', () => {
    const p = plan([mail('e1', ev()), mail('e1', ev()), mail('e2', ev())], [row({ id: 'old', gmail_id: 'e2' })]);
    expect(p.add.map((r) => r.gmail_id)).toEqual(['e1']);
    expect(p.log.map((l) => l.status)).toEqual(['ok', 'duplicate', 'duplicate']);
  });
  it('an email that could not be read is logged with its reason, and adds nothing', () => {
    const bad = { id: 'e1', from: 'x', epochMs: EPOCH, result: { status: 'error', reason: 'no transaction date', parser: 'livin' } };
    expect(plan([bad])).toMatchObject({ add: [], log: [{ gmailId: 'e1', status: 'error', reason: 'no transaction date', parser: 'livin', rows: 0 }] });
  });
  it('writes the row the way the Transactions tab wants it', () => {
    const p = plan([mail('e1', ev({ description: 'KOPI', details: 'QRIS', refNo: 'R9' }))]);
    expect(p.add[0]).toEqual({
      id: 't_e1', date: '2026-11-05', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 100000, category: '', description: 'KOPI', details: 'QRIS',
      source: 'email', sender: 'bank@example.com', gmail: 'me@example.com', gmail_id: 'e1', ref_no: 'R9', status: 'pending', transfer_id: '', rule_id: '', updated_by: 'sync', updated_at: NOW,
    });
    const two = plan([mail('e2', [ev(), ev({ amount: 5 })])]);
    expect(two.add.map((r) => r.id)).toEqual(['t_e2_0', 't_e2_1']);
    expect(two.log[0].rows).toBe(2);
  });
});

describe('a shop receipt names the bank\'s row', () => {
  const receipt = (o = {}) => ({ type: 'receipt', source: 'shopx', date: '2026-11-05', amount: 75000, what: 'Buku', name: 'SHOPX', refNo: 'ORD1', match: { pattern: 'SHOPX', from: -1, to: 3 }, ...o });
  const bank = (o = {}) => row({ id: 'b1', description: 'SHOPX*1234', details: 'Kartu debit', stream: 'BCA', direction: 'out', amount: 75000, date: '2026-11-06', time: '', category: 'Belanja', status: 'approved', updated_by: 'sync', ...o });
  const run = (e, existing, epoch = EPOCH, rules = []) => plan([mail('r1', e, epoch)], existing, rules);

  it('adds the shop, the order and the items to the row, and sends it back to Review when no rule knows the shop', () => {
    const p = run(receipt(), [bank()]);
    expect(p.add).toEqual([]);
    expect(p.update).toEqual([{ id: 'b1', changes: expect.objectContaining({ details: 'Buku · shopx order ORD1 · Kartu debit', description: 'SHOPX', category: '', rule_id: '', status: 'pending' }) }]);
    expect(p.log[0].reason).toBe('named shopx charge b1');
  });
  it('takes the category from a rule for the shop (approving when the rule does), counting the hit', () => {
    const rules = [{ id: 'rs', field: 'description', pattern: 'SHOPX', category: 'Belanja Online', auto_approve: true }];
    const p = run(receipt(), [bank()], EPOCH, rules);
    expect(p.update[0].changes).toMatchObject({ category: 'Belanja Online', rule_id: 'rs', status: 'approved' });
    expect(p.ruleHits).toEqual({ rs: 1 });
    expect(run(receipt(), [bank()], EPOCH, [{ ...rules[0], auto_approve: false }]).update[0].changes.status).toBe('pending');
  });
  it('keeps the category of a subscription, of a row the person edited, and when asked not to look again', () => {
    expect(run(receipt({ subscription: true }), [bank()]).update[0].changes.category).toBeUndefined();
    expect(run(receipt(), [bank({ updated_by: 'Me' })]).update[0].changes.category).toBeUndefined();
    expect(run(receipt({ recheck: false }), [bank()]).update[0].changes.category).toBeUndefined();
  });
  it('matches only within the window around the receipt date (-1 to +3 days)', () => {
    for (const [date, hit] of [['2026-11-04', true], ['2026-11-03', false], ['2026-11-08', true], ['2026-11-09', false]]) {
      expect(run(receipt(), [bank({ date })]).update.length, date).toBe(hit ? 1 : 0);
    }
  });
  it('picks the nearest of two candidates, ignores rows already named by this shop, in, or of another amount', () => {
    const near = bank({ id: 'near', date: '2026-11-06' });
    const far = bank({ id: 'far', date: '2026-11-08' });
    expect(run(receipt(), [far, near]).update.map((u) => u.id)).toEqual(['near']);
    expect(run(receipt(), [bank({ details: 'shopx order ORD0' })]).update).toEqual([]);
    expect(run(receipt(), [bank({ direction: 'in' })]).update).toEqual([]);
    expect(run(receipt(), [bank({ amount: 74999 })]).update).toEqual([]);
  });
  it('a charge in another currency is matched by the amount in the details', () => {
    const usd = receipt({ currency: 'USD', amount: 19.99 });
    const card = bank({ amount: 330000, details: 'Kartu debit · USD 19,99' });
    expect(run(usd, [card]).update).toHaveLength(1);
    expect(run(usd, [{ ...card, details: 'Kartu debit · USD 20,00' }]).update).toEqual([]);
    expect(run(usd, [{ ...card, details: 'Kartu debit' }]).update).toEqual([]);
  });
  it('with no charge yet it waits 4 days (or the shop\'s own number), then gives up; a waiting email is read again', () => {
    const day = 86400000;
    const at = (days) => Date.parse(NOW) - days * day;
    expect(run(receipt(), [], at(3.9)).log[0]).toMatchObject({ status: 'waiting', reason: 'no shopx charge of Rp 75000 near 2026-11-05 yet' });
    expect(run(receipt(), [], at(4)).log[0]).toMatchObject({ status: 'ok', reason: 'no shopx charge of Rp 75000 near 2026-11-05' });
    expect(run(receipt({ match: { pattern: 'SHOPX', from: -1, to: 3, waitDays: 10 } }), [], at(9.9)).log[0].status).toBe('waiting');
    expect(run(receipt({ match: { pattern: 'SHOPX', from: -1, to: 3, waitDays: 10 } }), [], at(10)).log[0].status).toBe('ok');
    expect(run(receipt({ currency: 'USD', amount: 5 }), [], at(1)).log[0].reason).toContain('charge of USD 5');
  });
});

describe('the GoPay monthly summary', () => {
  const summary = (o = {}) => ev({ type: 'summary', date: '2026-10-31', time: '', amount: 500000, income: 200000, account: { institution: 'GoPay' }, ...o });
  const gopay = (o) => row({ stream: 'GoPay', date: '2026-10-10', time: '', source: 'email', ...o });

  it('adds only the part of the month\'s spending and income that is not in the sheet yet', () => {
    const p = plan([mail('e1', summary())], [gopay({ id: 'a', direction: 'out', amount: 300000 }), gopay({ id: 'b', direction: 'in', amount: 50000 })]);
    expect(p.add.map((r) => [r.id, r.direction, r.amount, r.date, r.source])).toEqual([['t_e1_out', 'out', 200000, '2026-10-31', 'summary'], ['t_e1_in', 'in', 150000, '2026-10-31', 'summary']]);
    expect(p.add[0]).toMatchObject({ stream: 'GoPay', description: 'Pengeluaran GoPay 2026-10 (ringkasan bulanan)', details: 'Dari ringkasan bulanan GoPay: pilih kategori' });
    expect(p.add[1].description).toBe('Pemasukan GoPay 2026-10 (ringkasan bulanan)');
  });
  it('counts only that month, only GoPay, only rows that are not themselves summaries; adds nothing when it is all there', () => {
    const rows = [gopay({ id: 'a', direction: 'out', amount: 500000 }), gopay({ id: 'b', direction: 'in', amount: 200000 }),
      gopay({ id: 'c', direction: 'out', amount: 9, date: '2026-09-30' }), gopay({ id: 'd', direction: 'out', amount: 9, stream: 'BCA' }), gopay({ id: 'e', direction: 'out', amount: 9, source: 'summary' })];
    expect(plan([mail('e1', summary())], rows).add).toEqual([]);
    expect(plan([mail('e1', summary({ amount: 500000.003 }))], rows).add).toEqual([]);
    expect(plan([mail('e1', summary({ amount: 500000.01 }))], rows).add.map((r) => r.amount)).toEqual([0.01]);
  });
  it('adds no row for money that is not in the summary (income is optional), and February ends on the 28th', () => {
    expect(plan([mail('e1', summary({ income: undefined }))], [gopay({ id: 'a', direction: 'out', amount: 500000 })]).add).toEqual([]);
    const feb = plan([mail('e1', summary({ date: '2026-02-28', amount: 10 }))]);
    expect(feb.add[0].date).toBe('2026-02-28');
  });
});

describe('a dividend', () => {
  it('goes to the dividend category, approved when the account is known and waiting when it is not', () => {
    const div = ev({ type: 'dividend', direction: 'in', account: { institution: 'BCA', hint: '2233' }, amount: 1234 });
    expect(plan([mail('e1', div)]).add[0]).toMatchObject({ category: 'Dividen', status: 'approved', stream: 'BCA', direction: 'in' });
    expect(plan([mail('e2', { ...div, account: { institution: 'Unknown Bank' } })]).add[0]).toMatchObject({ category: 'Dividen', status: 'pending', stream: '' });
  });
});
