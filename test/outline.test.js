// The masked outline of an email nobody could read: its shape, with nothing personal in it.
import { describe, expect, it } from 'vitest';
import { maskedOutline } from '../src/core/text.js';
import { parseEmail } from '../src/core/parsers/index.js';

// Invented values only: the point is that none of them can come back out.
const tokens = ['Transfer Berhasil', 'Tanggal:', '02 Sep 2026', 'Jam:', '09:15 WIB', 'Nama Penerima:', 'Budi Santoso', 'Nominal:', 'Rp1.250.000', 'No. Rekening:', '1234567890', 'Biaya:', 'Rp0', 'Rp0', 'Terima kasih'];

describe('maskedOutline', () => {
  it('keeps the labels and shows every value only as what it looks like', () => {
    expect(maskedOutline(tokens)).toBe('<text:2> | tanggal: | <date> | jam: | <time> | nama penerima: | <text:2> | nominal: | <amount> | no. rekening: | <number> | biaya: | <amount>×2 | <text:2>');
  });
  it('lets nothing personal through: no name, amount, account number or date', () => {
    const out = maskedOutline(tokens);
    for (const secret of ['Budi', 'Santoso', '1.250.000', '1234567890', '2026', '09:15']) expect(out).not.toContain(secret);
  });
  it('is short, whatever the email', () => {
    expect(maskedOutline(Array.from({ length: 500 }, (_, i) => `word ${i} x:`)).length).toBeLessThanOrEqual(401);
  });
});

describe('an email that cannot be read', () => {
  it('is logged with its outline', () => {
    const r = parseEmail({ id: 'x', from: 'noreply.livin@bankmandiri.co.id', subject: 'Transfer Berhasil', epochMs: 0, isHtml: false, body: 'Transfer Berhasil\nNama Penerima:\nBudi Santoso\nNominal:\nRp1.250.000' });
    expect(r.status).toBe('error');
    expect(r.reason).toBe('no transaction date [outline: <text:2> | nama penerima: | <text:2> | nominal: | <amount>]');
  });
  it('is not added to emails that are skipped on purpose', () => {
    const r = parseEmail({ id: 'x', from: 'noreply@jago.com', subject: 'Promo', epochMs: 0, isHtml: false, body: 'Hello' });
    expect(r.reason || '').not.toContain('[outline');
  });
});
