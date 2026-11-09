// BRI emails, and Livin' by Mandiri mail in plain text (label and value on one line). Invented values; the layouts are the real ones.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEmail, hasReader, SENDERS } from '../src/core/parsers/index.js';
import { maskedOutline, bodyToTokens } from '../src/core/text.js';

function load(file) {
  const out = {};
  for (const chunk of readFileSync(new URL(`./fixtures/emails/${file}`, import.meta.url), 'utf8').split(/^=== /m).slice(1)) {
    const [head, ...rest] = chunk.split(/^---$/m);
    const lines = head.split(/\r?\n/);
    const h = Object.fromEntries(lines.slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
    out[lines[0].trim()] = { id: lines[0].trim(), from: h.from, subject: h.subject, epochMs: Number(h.epoch), body: rest.join('---').replace(/^\r?\n/, ''), isHtml: false };
  }
  return out;
}
const F = { ...load('bri.txt'), ...load('livin-plain.txt') };
const one = (name) => {
  const r = parseEmail(F[name]);
  expect(r.status, `${name}: ${r.reason || ''}`).toBe('ok');
  expect(r.events).toHaveLength(1);
  return r.events[0];
};

describe('BRI', () => {
  it('is routed by sender, and the sender is searched for', () => {
    expect(hasReader('Bank BRI <bankbri@bri.co.id>', 'Notification BRI')).toBe(true);
    expect(SENDERS).toContain('bankbri@bri.co.id');
  });
  it('a QRIS payment: merchant, place, the date in either month spelling, the account by its last digits', () => {
    expect(one('bri-qris')).toMatchObject({
      type: 'payment', direction: 'out', date: '2026-11-06', time: '12:34:56', amount: 25000, fee: 0, description: 'WARUNG CONTOH',
      account: { institution: 'BRI', hint: '222' }, counterparty: { name: 'WARUNG CONTOH' }, details: 'QRIS · JAKARTA PUSAT', refNo: '123456789012',
    });
    expect(one('bri-qr-tampil')).toMatchObject({ amount: 4500, date: '2026-11-06', time: '09:08:07', description: 'TOKO CONTOH' });
  });
  it('a top-up: the wallet, its number, the fee apart from the amount', () => {
    expect(one('bri-topup')).toMatchObject({
      type: 'topup', direction: 'out', date: '2026-11-04', time: '20:15:00', amount: 100000, fee: 1000, description: 'Top-up OVO',
      counterparty: { name: 'OVO', institution: 'OVO', account: '081200000000' }, account: { institution: 'BRI', hint: '222' },
    });
  });
  it('a transfer: who, which bank and account; the date even when a mail tool left an entity where the comma was', () => {
    expect(one('bri-transfer')).toMatchObject({
      type: 'transfer', direction: 'out', date: '2026-11-02', time: '11:47:28', amount: 3500000, description: 'RATNA CONTOH',
      counterparty: { name: 'RATNA CONTOH', institution: 'BRI', account: '333344445555666' },
    });
  });
  it('the one-line notice: money in is income, money out is a payment, with the last digits of the account', () => {
    expect(one('bri-notif-in')).toMatchObject({ type: 'income', direction: 'in', date: '2026-11-05', time: '10:20:30', amount: 1250000, account: { institution: 'BRI', hint: '1234' }, details: 'BFST123456789' });
    expect(one('bri-notif-out')).toMatchObject({ type: 'payment', direction: 'out', amount: 75000, account: { hint: '1234' }, details: 'BRIVA12345' });
  });
  it('a QRIS notice is skipped: the payment has its own email with the merchant', () => {
    expect(parseEmail(F['bri-notif-qris'])).toMatchObject({ status: 'skip' });
  });
  it('a failed transaction and an email that is not one are skipped, and an unreadable notice is an error with its outline', () => {
    expect(parseEmail({ ...F['bri-qris'], subject: 'Pembelian QRIS Gagal' }).status).toBe('skip');
    expect(parseEmail({ ...F['bri-qris'], subject: 'Promo BRImo' }).status).toBe('skip');
    const bad = parseEmail({ ...F['bri-notif-in'], body: 'Sobat BRI!\nDana masuk kemarin' });
    expect(bad.status).toBe('error');
    expect(bad.reason).toContain('[outline: ');
  });
});

describe('Livin in plain text', () => {
  it('a QR payment is read: "Tanggal 6 Nov 2026" and "Nominal Transaksi Rp 25.000,00" are one line each', () => {
    expect(one('livin-plain-qr')).toMatchObject({
      type: 'payment', direction: 'out', date: '2026-11-06', time: '12:34:56', amount: 25000, description: 'WARUNG CONTOH 1',
      account: { institution: 'Mandiri', hint: '1234' }, refNo: '123456789012345',
    });
  });
  it('a transfer is read: payee, bank and account, amount', () => {
    expect(one('livin-plain-transfer')).toMatchObject({
      type: 'transfer', direction: 'out', date: '2026-11-06', amount: 100000, description: 'RATNA CONTOH',
      counterparty: { name: 'RATNA CONTOH', institution: 'Mandiri', account: '1234567890123' },
    });
  });
  it('the outline of such an email shows its shape and none of its values', () => {
    const out = maskedOutline(bodyToTokens(F['livin-plain-qr'].body, false));
    for (const secret of ['DEWI', 'CONTOH', '25.000', '1234']) expect(out).not.toContain(secret);
  });
});

describe('BCA cash withdrawal', () => {
  const email = () => ({ id: 'w', from: 'BCA <bca@bca.co.id>', subject: 'Cash Withdrawal Successful', epochMs: 1793000000000, isHtml: false, body: load('bca.txt')['bca-cash-withdrawal'].body });
  it('is read: money out of the account by its last digits, with the ATM code as a detail', () => {
    expect(hasReader('BCA <bca@bca.co.id>', 'Cash Withdrawal Successful')).toBe(true);
    const r = parseEmail(email());
    expect(r.status, r.reason).toBe('ok');
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      type: 'payment', direction: 'out', date: '2026-11-06', time: '12:34:56', amount: 500000, fee: 0, description: 'Tarik tunai ATM',
      account: { institution: 'BCA', hint: '22' }, details: 'Cardless · WSID ZP1P1', refNo: 'AAAAAAAA-0000-1111-2222-333333333333',
    });
  });
  it('a failed withdrawal is skipped', () => {
    const e = email();
    expect(parseEmail({ ...e, body: e.body.replace('Successful', 'Failed') }).status).toBe('skip');
  });
});
