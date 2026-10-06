// Shop receipts (Tokopedia, Shopee, Xendit, MyMiniFactory, Optik Melawai, shops abroad): parsed from
// redacted real emails, then written onto the bank row of the same payment.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEmail } from '../src/core/parsers/index.js';
import { planSync } from '../src/core/plan.js';

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
const F = loadFixtures('shops.txt');
F.xendit = {
  id: 'xendit', from: 'Xendit <notifications@xendit.co>', subject: 'Order confirmation from Tabletoys Indonesia', epochMs: Date.UTC(2026, 8, 3, 6, 37),
  body: readFileSync(new URL('./fixtures/emails/xendit-paid.html', import.meta.url), 'utf8'), isHtml: true,
};
const ev = (name) => {
  const r = parseEmail(F[name]);
  if (r.status !== 'ok') throw new Error(`${name}: ${r.status} ${r.reason}`);
  return r.events[0];
};

const RULES = [
  { id: 'r4', field: 'description', pattern: 'TOKOPEDIA|SHOPEE', category: 'Belanja Online', auto_approve: true },
];
const CONFIG = { owner: 'Me', ownerNames: [], categories: { transfer: 'Transfer ke Bank Lain', fee: 'Biaya Admin', dividend: 'Dividen & Bunga' } };
const row = (id, extra) => ({
  id, time: '10:00:00', stream: 'Mandiri', direction: 'out', category: 'Belanja Online', details: '', gmail_id: `g_${id}`,
  status: 'approved', rule_id: 'r4', updated_by: 'sync', ...extra,
});
const plan = (names, existing, now = '2026-10-06T05:00:00.000Z') => planSync({
  emails: names.map((n) => ({ id: F[n].id, from: F[n].from, epochMs: F[n].epochMs, gmail: 'you@gmail.com', result: parseEmail(F[n]) })),
  existing, accounts: [], rules: RULES, config: CONFIG, nowIso: now,
});

describe('shop receipt parsers', () => {
  it('Tokopedia "Pesanan Selesai": shop, items, total, invoice', () => {
    expect(ev('tokopedia-done')).toMatchObject({
      type: 'receipt', source: 'Tokopedia', date: '2026-09-27', amount: 61416, refNo: '586200000000000001', name: 'Sultan Supply. id',
      what: 'Sleeve Amethyst - 100 Micron; sultan sleeves emerald board game - 100 Micron', match: { pattern: 'TOKOPEDIA', from: -30, to: 0 },
    });
  });

  it('Tokopedia with many items lists three, shortened, and counts the rest', () => {
    const e = ev('tokopedia-books');
    expect(e).toMatchObject({ name: 'Periplus Bookshop_NEW', amount: 960811 });
    expect(e.what).toMatch(/^Periplus - Buku Import - Batman: The Court of Owls Saga: DC Compact…; Periplus/);
    expect(e.what).toMatch(/; \+1 lainnya$/);
  });

  it('Tokopedia "Menunggu Pembayaran" names a virtual-account payment', () => {
    expect(ev('tokopedia-va')).toMatchObject({ name: 'BNI Tapcash - 150rb', amount: 152500, date: '2026-09-01', match: { from: 0, to: 2 } });
  });

  it('other Tokopedia emails are skipped', () => {
    expect(parseEmail(F['tokopedia-login']).status).toBe('skip');
  });

  it('Shopee: seller, items with their variation, order date, comma thousands', () => {
    expect(ev('shopee')).toMatchObject({
      source: 'Shopee', date: '2026-09-15', amount: 589000, refNo: '26090000TEST01', name: 'nadapuspitaofficial',
      what: 'Nada Puspita - Marrakesh Series (Atlas,Regular); Nada Puspita - Puspa Series (Anggrek)',
    });
  });

  it('Xendit: the merchant behind "Xendit 12345"', () => {
    expect(ev('xendit')).toMatchObject({ source: 'Xendit', amount: 1285000, name: 'Tabletoys Indonesia', refNo: 'livestore-100001', what: 'order #100001', date: '2026-09-03' });
  });

  it('a shop abroad ("<Shop> order #… Confirmed!") and MyMiniFactory: items and the foreign total', () => {
    expect(ev('shop-order')).toMatchObject({
      source: 'Dice Haven', name: 'Dice Haven', amount: 328.4, currency: 'AUD', refNo: '#1600001', recheck: false, match: { pattern: 'DICEHAVEN' },
      what: 'D&D Eberron Rising from the Last War Alternative Cover; Vampire: The Masquerade 5th Edition Dice Set; Reversible Megamat 1 Squares & 1 Hexes 34.5 x 48 Inches',
    });
    expect(ev('myminifactory')).toMatchObject({
      amount: 19.99, currency: 'USD', refNo: '73TEST0001',
    });
    // "|" between the parts becomes "·" in HTML; the plain-text copy has none left.
    expect(ev('myminifactory').what).toMatch(/^Bloom of Putrefy\W+For Board Game\W+Pre-supported; Blade of Putrefy/);
  });

  it('Optik Melawai: the paid items only, order date, keeps the bank name', () => {
    expect(ev('optik')).toMatchObject({ date: '2026-09-21', amount: 735000, refNo: 'AE4000000000001', name: '', what: 'SINGLE VISION ILLUSTRO' });
  });
});

describe('naming the bank rows', () => {
  it('a Tokopedia order finds its payment days earlier and goes back to Review under the shop name', () => {
    const p = plan(['tokopedia-done'], [
      row('t1', { date: '2026-09-24', amount: 61416, description: 'Tokopedia' }),
      row('t2', { date: '2026-09-24', amount: 1000, description: 'Biaya: Tokopedia', category: 'Biaya Admin' }),
    ]);
    expect(p.update).toEqual([{ id: 't1', changes: expect.objectContaining({
      description: 'Sultan Supply. id', details: 'Sleeve Amethyst - 100 Micron; sultan sleeves emerald board game - 100 Micron · Tokopedia order 586200000000000001',
      category: '', status: 'pending',
    }) }]);
  });

  it('a Tokopedia order paid some other way (no matching charge) gives up quietly', () => {
    expect(plan(['tokopedia-done'], [row('t1', { date: '2026-09-24', amount: 55736, description: 'Tokopedia' })]).log[0])
      .toMatchObject({ status: 'ok', reason: expect.stringContaining('no Tokopedia charge') });
  });

  it('Xendit names the merchant; a category someone chose stays', () => {
    const c = plan(['xendit'], [row('x1', { date: '2026-09-03', amount: 1285000, description: 'Xendit 88908', category: 'Hobi & Board Game', updated_by: 'Me' })]).update[0].changes;
    expect(c).toMatchObject({ description: 'Tabletoys Indonesia', details: 'order #100001 · Xendit order livestore-100001' });
    expect(c).not.toHaveProperty('category');
  });

  it('foreign-currency receipts match the amount blu noted in Details', () => {
    const p = plan(['shop-order', 'myminifactory'], [
      row('g1', { date: '2026-10-01', amount: 4207669.52, description: 'SP P101DICEHAVEN', details: 'Kartu debit · Debit Online · AUD 328,40', category: 'Hobi & Board Game' }),
      row('m1', { date: '2026-09-10', amount: 358656.58, description: 'MY MINI FACTORY LTD', details: 'Kartu debit · Debit Online · USD 19,99' }),
      row('m2', { date: '2026-09-10', amount: 431531.91, description: 'MY MINI FACTORY LTD', details: 'Kartu debit · Debit Online · USD 23,97' }),
    ]);
    const byId = Object.fromEntries(p.update.map((u) => [u.id, u.changes]));
    expect(byId.g1).toMatchObject({ description: 'Dice Haven', details: expect.stringContaining('Dice Haven order #1600001') });
    expect(byId.g1).not.toHaveProperty('status'); // recheck: false
    expect(byId.m1.details).toMatch(/^Bloom of Putrefy .* · MyMiniFactory order 73TEST0001 · Kartu debit · Debit Online · USD 19,99$/);
    expect(byId.m2).toBeUndefined();
  });

  it('Optik Melawai adds the items and keeps the store name and category', () => {
    const c = plan(['optik'], [row('o1', { date: '2026-09-21', amount: 735000, description: 'OPTIK MELAWAI BEKASI - RU', category: 'Kesehatan & Optik', details: 'QRIS · Bekasi (Kota)' })]).update[0].changes;
    expect(c).toEqual(expect.objectContaining({ details: 'SINGLE VISION ILLUSTRO · Optik Melawai order AE4000000000001 · QRIS · Bekasi (Kota)' }));
    expect(c).not.toHaveProperty('description');
    expect(c).not.toHaveProperty('category');
  });

  it('Shopee matches on the order date', () => {
    const c = plan(['shopee'], [row('s1', { date: '2026-09-15', amount: 589000, description: 'Shopee Indonesia' })]).update[0].changes;
    expect(c).toMatchObject({ description: 'nadapuspitaofficial', status: 'pending' });
  });
});
