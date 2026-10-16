// What you own and owe beyond bank accounts (property, vehicle, gold, stocks, crypto, collectibles,
// debts), planned recurring transactions, and money friends owe you ("Tagih"). Pure functions.

export const ASSET_KINDS = ['property', 'vehicle', 'gold', 'stock', 'crypto', 'collectible', 'other', 'debt'];
// Google Finance tickers such as IDX:BBCA or NASDAQ:AAPL; anything else is never put in a formula.
export const TICKER = /^[A-Z]{2,10}:[A-Z0-9.]{1,15}$/;

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
  const owned = sum((a) => a.kind !== 'debt' && a.kind !== 'collectible');
  const collectibles = sum((a) => a.kind === 'collectible');
  const debts = sum((a) => a.kind === 'debt');
  return { accounts, owned, collectibles, debts, total: round2(accounts + owned + collectibles - debts), items };
}

/** Problems with the assets list (empty = fine). */
export function assetProblems(list) {
  const out = [];
  list.forEach((a, i) => {
    const n = `item ${i + 1}`;
    if (!String(a.name || '').trim()) out.push(`${n}: name is required`);
    if (!ASSET_KINDS.includes(a.kind)) out.push(`${n}: unknown kind ${a.kind}`);
    if (a.ticker && !TICKER.test(a.ticker)) out.push(`${n}: ticker must look like IDX:BBCA`);
    if (!(num(a.unit_value) > 0) && !(a.ticker && TICKER.test(a.ticker))) out.push(`${n}: enter a value`);
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

/** Money owed to you, open ones first, with the total still open. */
export function owedSummary(owed) {
  const open = owed.filter((o) => o.status !== 'paid');
  return { open, total: round2(open.reduce((t, o) => t + num(o.amount), 0)), paid: owed.filter((o) => o.status === 'paid') };
}
