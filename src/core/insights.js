// Report pieces: top places, biggest expenses, a year month by month, and the money flow
// (income into accounts, transfers between them, spending out of them). Pure functions.

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const inRange = (r, { from, to }) => { const d = String(r.date).slice(0, 10); return d >= from && d <= to; };
const isSpending = (r, exp) => r.status === 'approved' && r.direction === 'out' && exp.has(r.category);
/** "CIRCLEKA INDONESIA UTAMA" and "Circleka Indonesia Utama 2" are the same place. */
const placeKey = (s) => String(s || '').toLowerCase().replace(/\d+/g, ' ').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Where the money went, by place (transaction name): times and total, biggest first. */
export function topPlaces(rows, cats, range, limit = 8) {
  const exp = new Set(cats.expense);
  const by = new Map();
  for (const r of rows) {
    if (!isSpending(r, exp) || !inRange(r, range)) continue;
    const k = placeKey(r.description) || placeKey(r.details);
    if (!k) continue;
    const p = by.get(k) || { name: r.description || r.details, count: 0, total: 0, category: r.category };
    p.count += 1;
    p.total += num(r.amount);
    by.set(k, p);
  }
  return [...by.values()].map((p) => ({ ...p, total: round2(p.total) })).sort((a, b) => b.total - a.total).slice(0, limit);
}

/** The largest single payments. */
export function biggestExpenses(rows, cats, range, limit = 5) {
  const exp = new Set(cats.expense);
  return rows.filter((r) => isSpending(r, exp) && inRange(r, range))
    .sort((a, b) => num(b.amount) - num(a.amount)).slice(0, limit)
    .map((r) => ({ id: r.id, description: r.description || r.details || '', amount: round2(num(r.amount)), date: String(r.date).slice(0, 10), time: r.time || '', category: r.category, stream: r.stream || '', direction: 'out', status: r.status }));
}

/**
 * Money flow for a period: income by account, transfers between own accounts (paired by
 * transfer_id; an unpaired one goes to/from "outside"), and spending by account.
 */
export function moneyFlow(rows, cats, range, transferCategory) {
  const inc = new Set(cats.income);
  const exp = new Set(cats.expense);
  const income = new Map();
  const spent = new Map();
  const pairs = new Map();
  for (const r of rows) {
    if (r.status !== 'approved' || !inRange(r, range) || !r.stream) continue;
    const a = num(r.amount);
    if (r.direction === 'in' && inc.has(r.category)) income.set(r.stream, (income.get(r.stream) || 0) + a);
    else if (r.direction === 'out' && exp.has(r.category)) spent.set(r.stream, (spent.get(r.stream) || 0) + a);
    else if (r.category === transferCategory && r.transfer_id) {
      const p = pairs.get(r.transfer_id) || {};
      p[r.direction] = r;
      pairs.set(r.transfer_id, p);
    }
  }
  const moves = new Map();
  for (const p of pairs.values()) {
    if (!p.out || !p.in || p.out.stream === p.in.stream) continue;
    const k = `${p.out.stream}\u0000${p.in.stream}`;
    moves.set(k, (moves.get(k) || 0) + num(p.out.amount));
  }
  const list = (m) => [...m].map(([stream, amount]) => ({ stream, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
  return {
    income: list(income),
    spent: list(spent),
    transfers: [...moves].map(([k, amount]) => { const [from, to] = k.split('\u0000'); return { from, to, amount: round2(amount) }; }).sort((a, b) => b.amount - a.amount),
  };
}
