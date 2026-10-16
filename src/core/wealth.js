// What you own and owe beyond bank accounts (property, vehicle, gold, stocks, crypto, collectibles,
// debts), planned recurring transactions, and money friends owe you ("Tagih"). Pure functions.

export const ASSET_KINDS = ['property', 'vehicle', 'gold', 'stock', 'fund', 'bond', 'deposit', 'pension', 'crypto', 'goods', 'collectible', 'receivable', 'other', 'debt', 'paylater'];
export const DEBT_KINDS = new Set(['debt', 'paylater']);
// Stock codes: IDX:BBCA, or just BBCA (an IDX stock), or EXCHANGE:CODE elsewhere (NASDAQ:AAPL).
export const TICKER = /^(?:[A-Z]{2,10}:)?[A-Z0-9.-]{1,15}$/;

/**
 * Where to look a ticker up. Google Sheets' GOOGLEFINANCE() doesn't know IDX stocks, so the script
 * asks Yahoo Finance (BBCA.JK) and, failing that, reads Google Finance's quote page (BBCA:IDX).
 */
export function priceSymbols(ticker) {
  const t = String(ticker || '').trim().toUpperCase();
  if (!TICKER.test(t)) return null;
  const [ex, sym] = t.includes(':') ? t.split(':') : ['IDX', t];
  return ex === 'IDX' ? { yahoo: `${sym}.JK`, google: `${sym}:IDX` } : { yahoo: sym, google: `${sym}:${ex}` };
}

/**
 * harga-emas.org's page -> Antam's buyback price per gram ("Harga pembelian kembali: Rp2.443.500/grm"),
 * what gold is worth if you sell it. NaN when the page doesn't have it.
 */
export function goldFromHargaEmas(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/pembelian kembali:?\s*Rp\s?([\d.]+)/i);
  const v = m ? Number(m[1].replace(/\./g, '')) : NaN;
  return v > 0 ? v : NaN;
}

/** Yahoo Finance chart JSON -> the latest price (NaN when missing). */
export function priceFromYahoo(json) {
  const v = Number(json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta && json.chart.result[0].meta.regularMarketPrice);
  return v > 0 ? v : NaN;
}

/** Google Finance quote page -> its price ("Rp5,275" or "$227.50"; the first one on the page). NaN when none. */
export function priceFromGooglePage(html) {
  const m = String(html || '').match(/(?:Rp|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  const v = m ? Number(m[1].replace(/,/g, '')) : NaN;
  return v > 0 ? v : NaN;
}

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

/** Value of one item: quantity × market price (when the sheet has one) or the value you entered. */
export function assetValue(a) {
  const price = Number(a.price);
  const each = Number.isFinite(price) && price > 0 ? price : num(a.unit_value);
  return round2((num(a.qty) || 1) * each);
}

/** Net worth: accounts + assets + collectibles − debts, with each part and each item's value. */
export function netWorth(balances, assets) {
  const accounts = round2(balances.reduce((t, b) => t + num(b.balance), 0));
  const items = assets.map((a) => ({ ...a, value: assetValue(a), gain: a.kind === 'collectible' && num(a.paid) ? round2(assetValue(a) - num(a.paid)) : null }));
  const sum = (f) => round2(items.filter(f).reduce((t, a) => t + a.value, 0));
  const owned = sum((a) => !DEBT_KINDS.has(a.kind) && a.kind !== 'collectible');
  const collectibles = sum((a) => a.kind === 'collectible');
  const debts = sum((a) => DEBT_KINDS.has(a.kind));
  // Each kind's total, for the breakdown on the Summary.
  const byKind = {};
  for (const a of items) byKind[a.kind] = Math.round(((byKind[a.kind] || 0) + a.value) * 100) / 100;
  return { accounts, owned, collectibles, debts, total: round2(accounts + owned + collectibles - debts), items, byKind };
}

/** Problems with the assets list (empty = fine). */
export function assetProblems(list) {
  const out = [];
  list.forEach((a, i) => {
    const n = `item ${i + 1}`;
    if (!String(a.name || '').trim()) out.push(`${n}: name is required`);
    if (!ASSET_KINDS.includes(a.kind)) out.push(`${n}: unknown kind ${a.kind}`);
    if (a.ticker && !TICKER.test(a.ticker)) out.push(`${n}: ticker must look like BBCA or IDX:BBCA`);
    if (!(num(a.unit_value) > 0) && !(a.ticker && TICKER.test(a.ticker)) && a.kind !== 'gold') out.push(`${n}: enter a value`);
    if (a.qty !== '' && a.qty != null && !(Number(a.qty) > 0)) out.push(`${n}: quantity must be above 0`);
  });
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The day of a plan in month 'YYYY-MM' (a day the month lacks becomes its last day). */
export const planDate = (month, day) => {
  const [y, m] = month.split('-').map(Number);
  return isoOf(new Date(y, m - 1, Math.min(Number(day) || 1, new Date(y, m, 0).getDate())));
};

/**
 * Planned transactions due by `today` and not made yet for their month (checked by ref_no
 * "plan:<id>:<YYYY-MM>", so running twice adds nothing). A plan starts the month after `last`.
 * @returns {{plan, month, date}[]}
 */
export function duePlans(plans, rows, today) {
  const t = isoOf(today);
  const month = t.slice(0, 7);
  const made = new Set(rows.map((r) => String(r.ref_no || '')).filter((r) => r.startsWith('plan:')));
  return plans.filter((p) => String(p.active) !== 'false' && p.active !== false)
    .filter((p) => !p.last || String(p.last) < month)
    .map((p) => ({ plan: p, month, date: planDate(month, p.day) }))
    .filter((x) => x.date <= t && !made.has(`plan:${x.plan.id}:${x.month}`));
}

/**
 * Bills in the next `days` days: planned transactions (money out) and expected subscriptions,
 * soonest first, one per name.
 */
export function upcomingBills(plans, recurringItems, today, days = 7) {
  const t = isoOf(today);
  const dayNo = (iso) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const month = t.slice(0, 7);
  const next = isoOf(new Date(today.getFullYear(), today.getMonth() + 1, 1)).slice(0, 7);
  const out = [];
  for (const p of plans) {
    if (String(p.active) === 'false' || p.active === false || p.direction === 'in') continue;
    const date = [planDate(month, p.day), planDate(next, p.day)].find((d) => d >= t && String(p.last || '') < d.slice(0, 7));
    if (date && dayNo(date) <= days) out.push({ name: p.name, amount: num(p.amount), date, daysLeft: dayNo(date), kind: 'plan' });
  }
  for (const i of recurringItems) {
    if (i.daysLeft >= 0 && i.daysLeft <= days) out.push({ name: i.name, amount: num(i.amount), date: i.nextDate, daysLeft: i.daysLeft, kind: 'sub' });
  }
  const seen = new Set();
  return out.sort((a, b) => a.daysLeft - b.daysLeft || b.amount - a.amount).filter((b) => { const k = b.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Money owed to you, open ones first, with the total still open. */
export function owedSummary(owed) {
  const open = owed.filter((o) => o.status !== 'paid');
  return { open, total: round2(open.reduce((t, o) => t + num(o.amount), 0)), paid: owed.filter((o) => o.status === 'paid') };
}
