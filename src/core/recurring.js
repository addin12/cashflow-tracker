// Subscriptions and other repeating charges, with the date each is next expected.
//
// Three ways a charge counts as repeating, strongest first:
//   renews    a receipt said so ("renews 5 November 2026" in Details, see parsers/apple.js)
//   monthly   the same payee about a month apart, for a similar amount
//   category  one charge in a category that is repeating by nature (subscriptions, bills,
//             phone & internet): expected again a month later, marked as a guess
// A charge whose next date passed more than 45 days ago is treated as stopped. Payees the owner
// marked "not a subscription" (Config recurring_hidden) are left out.

const DAY = 86400000;
const toDay = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addMonth = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m, Math.min(d, last)));
};
const MONTHS = { jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, agustus: 8, agu: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12 };
function renewsOn(details) {
  const m = String(details || '').match(/renews (\d{1,2}) ([A-Za-z]+) (\d{4})/i);
  const month = m && MONTHS[m[2].toLowerCase()];
  return month ? iso(Date.UTC(Number(m[3]), month - 1, Number(m[1]))) : '';
}
/** "SPOTIFY P1234" and "Spotify p5678" are the same payee. */
export const payee = (s) => String(s || '').toLowerCase().replace(/\d+/g, ' ').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Not "iuran" (dues): one transfer to a person for a group payment isn't a monthly bill. Real
// monthly dues still show once they repeat (the "monthly" rule).
export const REPEATING_CATEGORIES = /langganan|subscription|tagihan|utilitas|pulsa|internet/i;

/**
 * @param {object[]} rows  Transactions
 * @param {{today: Date, skipCategories?: string[], hidden?: string[]}} opts  hidden: payee keys (see payee())
 * @returns {{items: {key, name, amount, category, stream, lastDate, nextDate, basis, daysLeft}[], monthlyTotal: number}}
 */
export function recurringCharges(rows, { today, skipCategories = [], hidden = [] }) {
  const hide = new Set(hidden.map(payee));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const skip = new Set(skipCategories);
  const out = rows.filter((r) => r.direction === 'out' && r.status !== 'ignored' && !skip.has(r.category) && !String(r.id).endsWith('_fee'))
    .map((r) => ({ ...r, date: String(r.date).slice(0, 10), amount: Number(r.amount) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map();
  for (const r of out) {
    const k = payee(r.description);
    if (!k || hide.has(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const items = [];
  for (const list of groups.values()) {
    const last = list[list.length - 1];
    const renews = renewsOn(last.details);
    const gaps = list.slice(1).map((r, i) => (toDay(r.date) - toDay(list[i].date)) / DAY);
    const similar = list.length >= 2 && Math.abs(last.amount - list[list.length - 2].amount) <= 0.1 * Math.max(last.amount, 1);
    const monthly = similar && gaps.length && gaps[gaps.length - 1] >= 25 && gaps[gaps.length - 1] <= 35;
    let basis = '';
    let nextDate = '';
    if (renews) { basis = 'renews'; nextDate = renews; } else if (monthly) { basis = 'monthly'; nextDate = addMonth(last.date); } else if (REPEATING_CATEGORIES.test(last.category || '')) { basis = 'category'; nextDate = addMonth(last.date); }
    if (!basis) continue;
    const next = toDay(nextDate);
    if (next < now - 45 * DAY) continue; // expected long ago and never came: stopped
    items.push({
      key: payee(last.description), name: last.description, amount: last.amount, category: last.category || '', stream: last.stream || '',
      lastDate: last.date, nextDate: iso(next), basis, daysLeft: Math.round((next - now) / DAY),
    });
  }
  items.sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.amount - a.amount);
  return { items, monthlyTotal: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100 };
}
