// blu by BCA Digital. Vertical layout: a label token, then its value token. The two parties are
// shown side by side; the owner's side ends with "bluAccount".
import { parseAmount, parseDateTime } from '../money.js';
import { valueAfter, firstValue, findToken } from '../text.js';
import { ok, skip, amountOf, joinDetails, splitNameBank } from './common.js';

const LABELS = [
  'Total Bayar', 'Total', 'Nominal', 'Nominal Tagihan', 'Nominal Transfer', 'Biaya Admin', 'bluRewards',
  'Tgl & Jam Transaksi', 'Tipe Transaksi', 'Tipe Otentikasi', 'Lokasi', 'No. Ref blu', 'Nama Acquirer',
  'Merchant ID', 'Terminal ID (TID)', 'Customer PAN (CPAN)', 'Reff ID (RRN)', 'Source of Fund',
];

const digits = (s) => String(s || '').replace(/\D/g, '');
const lastFour = (s) => digits(s).slice(-4);

/** "UMAR ZULKIFLI BCA 5295 1390 96" -> name / bank / account. */
function payeeWithAccount(raw) {
  const m = raw.match(/^(.*?)\s+(\d[\d ]{5,})$/);
  if (!m) return null;
  return { ...splitNameBank(m[1]), account: digits(m[2]) };
}

export const blu = {
  id: 'blu',
  matches: (m) => /@blubybcadigital\.id$/i.test(m.from),
  parse(m) {
    const t = m.tokens;
    const get = (l) => valueAfter(t, l, LABELS);
    const when = parseDateTime(get('Tgl & Jam Transaksi'));
    const refNo = digits(get('No. Ref blu'));
    // The owner's side ends with "bluAccount" (+ account number); the greeting also mentions it.
    const meAt = findToken(t, /bluAccount[\d\s]*$/i);

    if (/masuk/i.test(m.subject)) {
      if (!when) throw new Error('no transaction date');
      const me = meAt >= 0 ? t[meAt] : '';
      const sender = meAt > 0 ? t[meAt - 1] : '';
      // "M SOMEONE BCA": the last word is the sending bank when it is a known institution.
      const { name, institution: bank } = splitNameBank(sender);
      const note = (t.find((x) => /^[“"].*[”"]$/.test(x)) || '').replace(/^[“"]|[”"]$/g, '');
      return ok({
        type: 'income', direction: 'in', ...when, amount: amountOf(get('Nominal Transfer')), fee: 0,
        account: { institution: 'blu', hint: lastFour(me) },
        counterparty: { name, institution: bank },
        description: name, details: joinDetails(note, get('Tipe Transaksi')), refNo,
      });
    }

    if (!/berhasil/i.test(m.subject)) return skip('not a transaction email');
    if (!when) throw new Error('no transaction date');
    const other = meAt >= 0 ? (t[meAt + 1] || '') : '';
    const card = other.match(/^(.*?)\s*bluDebit Card[\s•*]*(\d{4})$/i);
    const principalRaw = firstValue(t, ['Nominal', 'Nominal Tagihan', 'Total Bayar', 'Total'], LABELS);
    const totalRaw = firstValue(t, ['Total Bayar', 'Total'], LABELS) || principalRaw;
    const amount = amountOf(principalRaw);
    const fee = Math.max(0, Math.round((parseAmount(totalRaw) - amount) * 100) / 100) || 0;
    const type = get('Tipe Transaksi');
    const sourceHint = lastFour(get('Source of Fund'));

    if (card) {
      return ok({
        type: 'payment', direction: 'out', ...when, amount, fee,
        account: { institution: 'blu', hint: card[2] }, counterparty: { name: card[1].trim() },
        description: card[1].trim(), details: joinDetails('Kartu debit', type), refNo,
      });
    }
    const payee = /bi-?fast|transfer/i.test(type) ? payeeWithAccount(other) : null;
    if (payee) {
      return ok({
        type: 'transfer', direction: 'out', ...when, amount, fee,
        account: { institution: 'blu', hint: sourceHint }, counterparty: payee,
        description: payee.name, details: joinDetails(type), refNo,
      });
    }
    const merchant = other.replace(/\s+(Jakarta|Kota|Kab\.?|Bekasi|Bogor|Depok|Tangerang)\b.*$/i, '').trim() || other;
    const place = other.slice(merchant.length).trim();
    return ok({
      type: 'payment', direction: 'out', ...when, amount, fee,
      account: { institution: 'blu', hint: sourceHint }, counterparty: { name: merchant },
      description: merchant, details: joinDetails(/qris/i.test(type) ? 'QRIS' : type, place), refNo,
    });
  },
};
