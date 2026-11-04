// The mail coverage report: unread financial senders by domain and count, nothing else.
import { describe, expect, it } from 'vitest';
import { coverageReport, domainOf } from '../src/core/coverage.js';
import { hasReader } from '../src/core/parsers/index.js';

describe('coverageReport', () => {
  it('finds the domain in a From header', () => {
    expect(domainOf('Bank Satu <No-Reply@Mail.Bank-Satu.co.id>')).toBe('mail.bank-satu.co.id');
    expect(domainOf('nobody')).toBe('');
  });
  it('counts only senders without a reader, most mail first, and keeps no subject or name', () => {
    const mails = [
      { from: 'BCA <bca@bca.co.id>', subject: 'Transaction Journal' },
      { from: 'Toko <a@shop.example>', subject: 'Struk Budi 1.000.000' },
      { from: 'Toko <b@shop.example>', subject: 'Struk' },
      { from: 'Bank <x@bank.example>', subject: 'Transfer' },
      { from: 'no address', subject: 'Transfer' },
    ];
    const report = coverageReport(mails, hasReader);
    expect(report).toEqual([{ domain: 'shop.example', count: 2 }, { domain: 'bank.example', count: 1 }]);
    expect(JSON.stringify(report)).not.toMatch(/Budi|1\.000\.000|Struk/);
  });
});

describe('hasReader', () => {
  it('knows the senders that have a parser, with or without a display name', () => {
    expect(hasReader('BCA <bca@bca.co.id>', 'Transaction Journal')).toBe(true);
    expect(hasReader('bca@bca.co.id', 'Newsletter')).toBe(false);
    expect(hasReader('someone@unknown.example', 'Transfer')).toBe(false);
  });
});
