// Grab e-receipts (no-reply@grab.com), in two layouts: a ride (English: "Paid by" then the wallet) and GrabFood (Indonesian: "Detail Pembayaran:"
// then "OVO Cash : Rp 25.000", the amount actually paid after promos). A ride or order paid from a wallet is spending of that wallet: an expense on the OVO (or GoPay, DANA,
// ShopeePay) account, which is the only place wallet spending shows in the mail. Paid in cash or by card it is skipped: cash has no account to
// leave and a card payment has its own bank email.
import { monthNumber, parseDateTime } from '../money.js';
import { findToken } from '../text.js';
import { ok, skip, amountOf, joinDetails, knownInstitution } from './common.js';

const WALLETS = ['OVO', 'GoPay', 'DANA', 'ShopeePay'];
const walletOf = (text) => WALLETS.find((w) => knownInstitution(text) === knownInstitution(w));
const pad = (n) => String(n).padStart(2, '0');

/** The value on the token after a label token ("Paid by" then "OVO"). */
const after = (tokens, label) => {
  const i = findToken(tokens, new RegExp(`^${label}$`, 'i'));
  return i < 0 ? '' : tokens[i + 1] || '';
};

/** "05 Nov 26 12:34 +0700" (two-digit year) or the invoice date "05 Nov 2026". */
function foodDate(t) {
  const m = String(after(t, 'WAKTU')).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})\s+(\d{1,2}):(\d{2})/);
  const month = m ? monthNumber(m[2]) : 0;
  if (m && month) return { date: `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(month)}-${pad(m[1])}`, time: `${pad(m[4])}:${m[5]}:00` };
  return parseDateTime(after(t, 'Tanggal'));
}

function food(t) {
  const pay = t.map((x) => x.match(/^(.+?)\s*:\s*Rp\s*([\d.,]+)$/)).find(Boolean);
  if (!pay) return skip('no payment on the receipt');
  const wallet = walletOf(pay[1]);
  if (!wallet) return skip(`paid by ${pay[1].replace(/\d/g, '#').slice(0, 20)}: not a wallet`);
  const day = foodDate(t);
  if (!day) throw new Error('no order date');
  const restaurant = after(t, 'Pesanan Dari:').trim();
  const order = after(t, 'Pesanan ID').trim();
  return ok({
    type: 'payment', direction: 'out', date: day.date, time: day.time || '', amount: amountOf(pay[2]), fee: 0,
    account: { institution: wallet, hint: '' }, counterparty: { name: restaurant || 'GrabFood' }, description: `GrabFood${restaurant ? ` ${restaurant}` : ''}`,
    details: joinDetails('GrabFood', order), refNo: order,
  });
}

export const grab = {
  id: 'grab',
  matches: (m) => /@grab\.com$/i.test(m.from) && /e-?receipt/i.test(m.subject),
  parse(m) {
    const t = m.tokens;
    if (!after(t, 'Paid by') && t.some((x) => /^Detail Pembayaran/i.test(x))) return food(t);
    const paidBy = after(t, 'Paid by');
    if (!paidBy) return skip('no payment method on the receipt');
    const wallet = walletOf(paidBy);
    if (!wallet) return skip(`paid by ${paidBy.replace(/\d/g, '#').slice(0, 20)}: not a wallet`);
    const day = parseDateTime(t.find((x) => /^(picked up|delivered|ordered)\b/i.test(x)));
    if (!day) throw new Error('no ride date');
    const service = (t[findToken(t, /^Hope you enjoyed|^Thank you|^Terima kasih/i) - 1] || '').trim();
    const booking = (t[findToken(t, /^Booking ID:/i)] || '').replace(/^Booking ID:\s*/i, '').trim();
    const description = `Grab${service && !/^\d+$/.test(service) ? ` ${service}` : ''}`;
    return ok({
      type: 'payment', direction: 'out', date: day.date, time: '', amount: amountOf(after(t, 'Total Paid')), fee: 0,
      account: { institution: wallet, hint: '' }, counterparty: { name: 'Grab' }, description, details: joinDetails('Grab', booking), refNo: booking,
    });
  },
};
