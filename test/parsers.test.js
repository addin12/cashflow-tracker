import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEmail } from '../src/core/parsers/index.js';
import { parseAmount, parseDateTime, wibFromEpoch } from '../src/core/money.js';
import { htmlToTokens, textToTokens, valueAfter } from '../src/core/text.js';
import { splitNameBank, splitPayee } from '../src/core/parsers/common.js';

/** Fixture files hold several emails: "=== name", header lines, "---", body. */
function loadFixtures(file) {
  const out = {};
  const text = readFileSync(new URL(`./fixtures/emails/${file}`, import.meta.url), 'utf8');
  for (const chunk of text.split(/^=== /m).slice(1)) {
    const [head, ...rest] = chunk.split(/^---$/m);
    const lines = head.split(/\r?\n/);
    const name = lines[0].trim();
    const h = Object.fromEntries(lines.slice(1).filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
    out[name] = { id: name, from: h.from, subject: h.subject, epochMs: Number(h.epoch), body: rest.join('---').replace(/^\r?\n/, ''), isHtml: false };
  }
  return out;
}
const F = { ...loadFixtures('bca.txt'), ...loadFixtures('livin.txt'), ...loadFixtures('others.txt') };
const one = (name) => {
  const r = parseEmail(F[name]);
  expect(r.status, `${name}: ${r.reason || ''}`).toBe('ok');
  expect(r.events).toHaveLength(1);
  return r.events[0];
};
const status = (name) => parseEmail(F[name]).status;

describe('money and dates', () => {
  it.each([
    ['IDR 20,500.00', 20500], ['Rp 488.333,00', 488333], ['Rp4.207.669,52', 4207669.52], ['Rp5.000.000', 5000000],
    ['19,800', 19800], ['-Rp2.500,00', 2500], ['IDR 1,000,000.00', 1000000], ['Rp 140.000,00', 140000], ['Rp233', 233],
  ])('%s -> %d', (raw, want) => expect(parseAmount(raw)).toBe(want));
  it('rejects text without digits', () => expect(parseAmount('Rp -')).toBeNaN());
  it.each([
    ['05 Oct 2026 09:17:32', '2026-10-05', '09:17:32'], ['2 Okt 2026', '2026-10-02', ''], ['26 Agu 2026', '2026-08-26', ''],
    ['27 Sep 2026 00:00:51 WIB', '2026-09-27', '00:00:51'], ['28 September 2026 20:49 WIB', '2026-09-28', '20:49:00'],
    ['1 Mei 2026', '2026-05-01', ''], ['31 Des 2026', '2026-12-31', ''],
  ])('%s', (raw, date, time) => expect(parseDateTime(raw)).toEqual({ date, time }));
  it('rejects impossible dates', () => {
    expect(parseDateTime('31 Feb 2026')).toBeNull();
    expect(parseDateTime('no date here')).toBeNull();
  });
  it('converts an email timestamp to WIB', () => expect(wibFromEpoch(Date.UTC(2026, 8, 30, 20, 0, 0))).toEqual({ date: '2026-10-01', time: '03:00:00' }));
});

describe('tokens', () => {
  it('splits markdown-like text on pipes and heading marks', () => {
    expect(textToTokens('| Penerima#### TOKO A |\n| Tanggal | 2 Okt 2026 |')).toEqual(['Penerima', 'TOKO A', 'Tanggal', '2 Okt 2026']);
  });
  it('turns HTML cells and paragraphs into tokens and drops style/head', () => {
    expect(htmlToTokens('<head><style>p{}</style></head><table><tr><td>Jam</td><td>09:23:59&nbsp;WIB</td></tr></table><p>A &amp; B</p>'))
      .toEqual(['Jam', '09:23:59 WIB', 'A & B']);
  });
  it('treats a label followed by another label as an empty field', () => {
    expect(valueAfter(['Beneficiary Account', 'Beneficiary Name', 'X'], 'Beneficiary Account', ['Beneficiary Name'])).toBe('');
  });
  it('splits names and banks', () => {
    expect(splitNameBank('ANDI WIJAYA BCA')).toEqual({ name: 'ANDI WIJAYA', institution: 'BCA' });
    expect(splitNameBank('ANDI WIJAYA BANK CENTRAL ASIA')).toEqual({ name: 'ANDI WIJAYA', institution: 'BCA' });
    expect(splitNameBank('BUDI SANTOSO PUT Mandiri')).toEqual({ name: 'BUDI SANTOSO PUT', institution: 'Mandiri' });
    expect(splitNameBank('JUST A NAME')).toEqual({ name: 'JUST A NAME', institution: '' });
    expect(splitPayee('SITI AMINAH Bank Mandiri - 1310000000001')).toEqual({ name: 'SITI AMINAH', institution: 'Mandiri', account: '1310000000001' });
    expect(splitPayee('SITI AMINAH', 'Bank Mandiri - 1310000000001')).toEqual({ name: 'SITI AMINAH', institution: 'Mandiri', account: '1310000000001' });
  });
});

describe('BCA', () => {
  it('QRIS payment', () => {
    expect(one('bca-qris')).toMatchObject({
      type: 'payment', direction: 'out', date: '2026-10-05', time: '09:17:32', amount: 25500, fee: 0,
      account: { institution: 'BCA', hint: '56' }, description: 'CIRCLEKA INDONESIA UTAMA', details: 'QRIS · JAKARTA TIMUR',
      refNo: '9527120261005091700000QRS1000000001', parser: 'bca',
    });
  });
  it('transfer to a BCA account', () => {
    expect(one('bca-transfer-bca')).toMatchObject({
      type: 'transfer', amount: 20000, fee: 0, date: '2026-09-29', account: { institution: 'BCA', hint: '56' },
      counterparty: { name: 'DEWI LESTARI', institution: 'BCA', account: '6040000003' }, details: 'Uang Kas',
    });
  });
  it('transfer to another bank, with fee and an empty label row', () => {
    expect(one('bca-transfer-other-bank')).toMatchObject({
      type: 'transfer', amount: 1000000, fee: 2500, time: '21:25:07',
      counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'blu', account: '001234567890' }, details: 'Freelance · BI FAST',
    });
  });
  it('pocket transfer back to the owner', () => {
    expect(one('bca-pocket-transfer')).toMatchObject({
      type: 'transfer', amount: 300000, account: { institution: 'BCA', pocket: 'Hobby' },
      counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'BCA', account: '1234567856' },
    });
  });
  it('payment to a BCA Virtual Account: payee is the company, "Name" (the holder) is ignored', () => {
    expect(one('bca-virtual-account')).toMatchObject({
      type: 'payment', amount: 150000, fee: 1000, date: '2026-10-05', time: '18:50:56', account: { institution: 'BCA', hint: '56' },
      counterparty: { name: 'AYOMAKAN' }, description: 'AYOMAKAN', details: 'Virtual Account · CONTOH SOLUSI PT',
    });
  });
  it('skips pocket creation and failed transactions', () => {
    expect(status('bca-pocket-creation')).toBe('skip');
    expect(status('bca-failed')).toBe('skip');
  });
});

describe("Livin' by Mandiri", () => {
  it('QR payment (text form)', () => {
    expect(one('livin-qr')).toMatchObject({
      type: 'payment', date: '2026-10-02', time: '09:23:59', amount: 21500, fee: 0,
      account: { institution: 'Mandiri', hint: '2468' }, description: 'CIRCLEKA INDONESIA UTAMA JAKARTA TIMUR', details: 'QRIS',
    });
  });
  it('QR payment (real HTML layout gives the same transaction)', () => {
    const html = readFileSync(new URL('./fixtures/emails/livin-qr.html', import.meta.url), 'utf8');
    const r = parseEmail({ ...F['livin-qr'], body: html, isHtml: true });
    expect(r.status).toBe('ok');
    expect(r.events[0]).toMatchObject({
      date: '2026-10-02', time: '09:23:59', amount: 21500, account: { institution: 'Mandiri', hint: '2468' },
      description: 'CIRCLEKA INDONESIA UTAMA', details: 'QRIS · JAKARTA TIMUR', refNo: '2610021100000000001',
    });
  });
  it('payment to a virtual account with a fee', () => {
    expect(one('livin-va')).toMatchObject({ type: 'payment', amount: 250000, fee: 1000, description: 'Tokopedia', account: { hint: '2468' } });
  });
  it('transfers (plain, BI-FAST, online)', () => {
    expect(one('livin-transfer')).toMatchObject({
      type: 'transfer', amount: 50000, fee: 0, counterparty: { name: 'SITI AMINAH', institution: 'Mandiri', account: '1310000000001' },
      details: 'Patungan makan', refNo: '2609291100000000002',
    });
    expect(one('livin-bifast')).toMatchObject({
      amount: 140000, fee: 2500, counterparty: { name: 'RUDI', institution: 'BCA', account: '7410000002' }, details: 'BI-FAST',
      refNo: '20260921BMRIIDJA000000000001',
    });
    expect(one('livin-transfer-online')).toMatchObject({ amount: 100000, fee: 2500, date: '2026-08-25', counterparty: { name: 'ANDI WIJAYA', institution: 'BCA' } });
  });
  it('top-ups name the wallet', () => {
    expect(one('livin-topup-dana')).toMatchObject({ type: 'topup', amount: 200000, fee: 1000, counterparty: { name: 'Danatopup', institution: 'DANA', account: '1357' } });
    expect(one('livin-topup-emoney')).toMatchObject({ type: 'topup', amount: 100000, counterparty: { institution: 'e-money', account: '9753' }, account: { hint: '2468' } });
  });
  it('skips failed payments', () => expect(status('livin-failed')).toBe('skip'));
});

describe('blu', () => {
  it('debit card payment', () => {
    expect(one('blu-card')).toMatchObject({
      type: 'payment', amount: 49000, fee: 0, date: '2026-10-05', time: '13:18:32',
      account: { institution: 'blu', hint: '1111' }, description: 'APPLE.COM/BILL',
    });
  });
  it('QRIS payment', () => {
    expect(one('blu-qr')).toMatchObject({ amount: 15900, fee: 0, account: { hint: '7890' }, description: 'ALFA_J837_HALIM3', details: 'QRIS · Jakarta Timur' });
  });
  it('transfer out; a waived fee counts as 0, a charged fee is kept', () => {
    expect(one('blu-transfer-out')).toMatchObject({
      type: 'transfer', amount: 100000, fee: 0, counterparty: { name: 'ANDI WIJAYA', institution: 'BCA', account: '5295000001' },
    });
    expect(one('blu-transfer-out-fee')).toMatchObject({ amount: 100000, fee: 2500, counterparty: { name: 'ANDI WIJAYA', institution: 'BCA' } });
  });
  it('incoming transfer', () => {
    expect(one('blu-incoming')).toMatchObject({
      type: 'income', direction: 'in', amount: 1000000, date: '2026-10-01', time: '21:25:07',
      account: { institution: 'blu', hint: '7890' }, counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'BCA' }, details: 'Freelance · BI-FAST',
    });
  });
});

describe('Jago, Sekuritas, GoPay', () => {
  it('Jago transfer', () => {
    expect(one('jago-transfer')).toMatchObject({
      type: 'transfer', amount: 2000000, date: '2026-09-28', time: '20:49:00', account: { institution: 'Jago', hint: '3210' },
      counterparty: { name: 'BUDI SANTOSO PUT', institution: 'Mandiri', account: '60010002468' },
    });
  });
  it('Jago Kantong withdrawal moves money from the pocket to the main account', () => {
    expect(one('jago-kantong')).toMatchObject({
      type: 'transfer', amount: 2000000, date: '2026-09-28', time: '20:49:04',
      account: { institution: 'Jago', pocket: 'Dana Darurat' }, counterparty: { institution: 'Jago' },
    });
  });
  it('skips Jago non-transactions and ignores promo senders', () => {
    expect(status('jago-contact')).toBe('skip');
    expect(parseEmail(F['jago-promo'])).toMatchObject({ status: 'skip', reason: 'no parser for info@jago.com' });
  });
  it('dividend payment', () => {
    expect(one('sekuritas-dividend')).toMatchObject({
      type: 'dividend', direction: 'in', amount: 6600, date: '2026-10-02', account: { institution: 'Mandiri Sekuritas' }, description: 'Dividen BMRI',
    });
    expect(status('sekuritas-schedule')).toBe('skip');
  });
  it('GoPay monthly summary', () => {
    expect(one('gopay-summary')).toMatchObject({ type: 'summary', date: '2026-09-01', amount: 90000, income: 500, account: { institution: 'GoPay' } });
    expect(one('gopay-summary-december')).toMatchObject({ date: '2026-12-01', amount: 1234567, income: 0 });
  });
});

describe('real HTML layouts that split one field over several elements', () => {
  it('Jago: name and "Bank • number" in two paragraphs of the "Ke" cell', () => {
    const html = readFileSync(new URL('./fixtures/emails/jago-transfer.html', import.meta.url), 'utf8');
    const r = parseEmail({ ...F['jago-transfer'], body: html, isHtml: true });
    expect(r.status).toBe('ok');
    expect(r.events[0]).toMatchObject({
      amount: 3500000, date: '2026-09-15', time: '13:00:00', account: { institution: 'Jago', hint: '3210' },
      counterparty: { name: 'BUDI SANTOSO PUT', institution: 'Mandiri', account: '60010002468' },
    });
  });

  const bluIn = (parts) => parseEmail({
    id: 'x', from: 'receipts@blubybcadigital.id', subject: 'Info Transaksi Masuk ke blu Kamu', epochMs: 0, isHtml: true,
    body: `<p>Hai B, Ada transaksi masuk ke rekening bluAccount kamu. Ini detailnya:</p><p>Nominal Transfer</p><p>Rp1.500.000,00</p>
      <table><tr><td>${parts.sender}</td><td>${parts.me}</td></tr></table><p>Tgl &amp; Jam Transaksi</p><p>15 Sep 2026 12:59:47 WIB</p><p>Tipe Transaksi</p><p>BI-FAST</p>`,
  });
  it('blu incoming: sender name and bank, and the owner side, each split over elements', () => {
    const r = bluIn({ sender: '<p>BUDI SANTOSO PUTRA</p><p>BANK JAGO</p>', me: '<p>Budi Santoso Putra</p><p>bluAccount</p><p>0012 3456 7890</p>' });
    expect(r.events[0]).toMatchObject({ amount: 1500000, account: { institution: 'blu', hint: '7890' }, counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'Jago' } });
  });
  it('blu incoming: owner name and "bluAccount" together, number apart', () => {
    const r = bluIn({ sender: '<p>BUDI SANTOSO PUTRA BANK JAGO</p>', me: '<p>Budi Santoso Putra bluAccount</p><p>0012 3456 7890</p>' });
    expect(r.events[0]).toMatchObject({ account: { hint: '7890' }, counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'Jago' } });
  });
  it('blu incoming, real layout: amount styled in pieces, parties in divs, number after a <br>', () => {
    const r = parseEmail({
      id: 'z', from: 'receipts@blubybcadigital.id', subject: 'Info Transaksi Masuk ke blu Kamu 💸', epochMs: 0, isHtml: true,
      body: `<div>Hai <strong>B</strong>,<br>Ada transaksi masuk ke rekening bluAccount kamu. Ini detailnya:</div>
        <div>Nominal Transfer</div><div><span>Rp</span><span><span>1.500.000</span></span><span>,00</span></div>
        <table><tr><td><div><img src="x"></div><div><span>BUDI SANTOSO PUTRA</span></div><div><span>BANK JAGO</span></div></td>
        <td><img src="arrow"></td><td><div><img src="y"></div><div><span>Budi Santoso Putra</span></div><div><span>bluAccount<br/>0012 3456 7890</span></div></td></tr></table>
        <div>Tgl &amp; Jam Transaksi</div><div><span>15 Sep 2026 12:59:43 WIB</span></div><div>Tipe Transaksi</div><div><span>BI-FAST</span></div>`,
    });
    expect(r.events[0]).toMatchObject({
      amount: 1500000, time: '12:59:43', account: { institution: 'blu', hint: '7890' },
      counterparty: { name: 'BUDI SANTOSO PUTRA', institution: 'Jago' }, description: 'BUDI SANTOSO PUTRA',
    });
  });
  it('blu card payment in a foreign currency keeps the original amount as a detail', () => {
    const r = parseEmail({
      id: 'u', from: 'receipts@blubybcadigital.id', subject: 'Transaksimu Pakai blu Berhasil', epochMs: 0, isHtml: true,
      body: '<div>Total Bayar</div><div><span>Rp</span><span>431.531</span><span>,91</span></div><div>Budi Santoso Putra</div><div>bluAccount</div><div>MY MINI FACTORY LTD</div><div>bluDebit Card •••• •••• •••• 1111</div><div>Nominal dalam USD</div><div>USD 23,97</div><div>Tgl &amp; Jam Transaksi</div><div>05 Sep 2026 10:00:00 WIB</div><div>Tipe Transaksi</div><div>Debit Online</div>',
    });
    expect(r.events[0]).toMatchObject({ amount: 431531.91, account: { hint: '1111' }, description: 'MY MINI FACTORY LTD', details: 'Kartu debit · Debit Online · USD 23,97' });
  });
  it('blu to blu transfer ("Antar blu") names the payee', () => {
    const r = parseEmail({
      id: 'v', from: 'receipts@blubybcadigital.id', subject: 'Transaksimu Pakai blu Berhasil', epochMs: 0, isHtml: true,
      body: '<div>Nominal</div><div>Rp165.000,00</div><div>Budi Santoso Putra</div><div>bluAccount</div><div>SITI A...</div><div>BCA Digital</div><div>0099 8877 6655</div><div>Tgl &amp; Jam Transaksi</div><div>22 Sep 2026 10:00:00 WIB</div><div>Tipe Transaksi</div><div>Antar blu</div>',
    });
    expect(r.events[0]).toMatchObject({ type: 'transfer', amount: 165000, counterparty: { name: 'SITI A...', institution: 'blu', account: '009988776655' } });
  });
  it('blu card payment with the card on its own line', () => {
    const r = parseEmail({
      id: 'y', from: 'receipts@blubybcadigital.id', subject: 'Transaksimu Pakai blu Berhasil', epochMs: 0, isHtml: true,
      body: '<p>Total Bayar</p><p>Rp526.000,00</p><table><tr><td><p>Budi Santoso Putra</p><p>bluAccount</p></td><td><p>UDEMY ONLINE COURSES</p><p>bluDebit Card •••• •••• •••• 1111</p></td></tr></table><p>Tgl &amp; Jam Transaksi</p><p>03 Sep 2026 10:00:00 WIB</p><p>Tipe Transaksi</p><p>Debit Online</p>',
    });
    expect(r.events[0]).toMatchObject({ amount: 526000, account: { hint: '1111' }, description: 'UDEMY ONLINE COURSES', details: 'Kartu debit · Debit Online' });
  });
});

describe('robustness', () => {
  it('a transaction email without an amount is an error, not a silent skip', () => {
    const r = parseEmail({ ...F['bca-qris'], body: F['bca-qris'].body.replace('IDR 25,500.00', '-') });
    expect(r).toMatchObject({ status: 'error', parser: 'bca' });
  });
  it('accepts a "Name <address>" sender', () => expect(status('gopay-summary')).toBe('ok'));
});
