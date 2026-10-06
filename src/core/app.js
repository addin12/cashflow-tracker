// Logic behind the web app screens, kept pure so it can be tested on the PC.
// Totals follow the template's rules (TEMPLATE-ANALYSIS.md §2): only approved rows count,
// income categories sum money in, expense categories sum money out, and transfers /
// Penyesuaian change account balances without counting as income or expense.

import { nextPayday, daysUntilPayday } from './payday.js';
import { literalPattern } from './rules.js';
import { EMPTY_SLOT } from './schema.js';

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const approved = (r) => r.status === 'approved';
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Category lists without the "-" placeholders. */
export function categoryLists(slots, fixed = ['Penyesuaian', 'trf ke bank lain']) {
  return {
    income: slots.income.filter((c) => c && c !== EMPTY_SLOT),
    expense: slots.expense.filter((c) => c && c !== EMPTY_SLOT),
    fixed,
  };
}

/** Month totals as the CASHFLOW tab shows them. `month` = 'YYYY-MM'. */
export function summarizeMonth(rows, cats, month, owner = '') {
  const inc = new Set(cats.income);
  const exp = new Set(cats.expense);
  const by = new Map();
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (!approved(r) || !String(r.date).startsWith(month) || (owner && r.owner !== owner)) continue;
    const a = num(r.amount);
    if (r.direction === 'in' && inc.has(r.category)) { income += a; by.set(r.category, (by.get(r.category) || 0) + a); }
    if (r.direction === 'out' && exp.has(r.category)) { expense += a; by.set(r.category, (by.get(r.category) || 0) + a); }
  }
  const byCategory = [...by].map(([category, amount]) => ({ category, kind: inc.has(category) ? 'income' : 'expense', amount: round2(amount) }))
    .sort((x, y) => y.amount - x.amount);
  return { month, income: round2(income), expense: round2(expense), balance: round2(income - expense), byCategory };
}

/** Balance per account: opening balance + approved movements of `year` up to `asOf`. */
export function streamBalances(rows, accounts, { year, asOf }) {
  const bal = new Map(accounts.map((a) => [a.stream, num(a.opening_balance)]));
  for (const r of rows) {
    if (!approved(r) || !bal.has(r.stream)) continue;
    // Every approved row up to asOf, whatever the year: balances carry on past New Year. (`year` is
    // kept in the signature for callers; the spreadsheet does its own per-year opening balances.)
    const d = String(r.date);
    if (d > asOf) continue;
    bal.set(r.stream, bal.get(r.stream) + (r.direction === 'in' ? num(r.amount) : -num(r.amount)));
  }
  return accounts.map((a) => ({ stream: a.stream, type: a.type, owner: a.owner, balance: round2(bal.get(a.stream)) }));
}

/** The template's "budget per day": spending balance / days until the next payday. */
export function budgetPerDay(balances, today, paydayDay) {
  const spending = round2(balances.filter((b) => b.type === 'Spending').reduce((s, b) => s + b.balance, 0));
  const days = daysUntilPayday(today, paydayDay);
  return { spending, daysLeft: days, nextPayday: isoDate(nextPayday(today, paydayDay)), perDay: Math.floor(spending / days) };
}

/** Everything the Review screen shows. */
export function reviewItems(rows, inboxLog, { today, recentDays = 7 }) {
  const since = isoDate(new Date(today.getTime() - recentDays * 86400000));
  const pending = rows.filter((r) => r.status === 'pending').sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const recentAuto = rows
    .filter((r) => approved(r) && r.updated_by === 'sync' && r.rule_id && String(r.date) >= since)
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const handled = new Set(rows.map((r) => r.gmail_id).filter(Boolean));
  // An email's latest log line counts: a retried email that worked since isn't shown as unread.
  const latest = new Map();
  inboxLog.forEach((l) => latest.set(l.gmail_id, l));
  const errors = [...latest.values()].filter((l) => l.status === 'error' && !handled.has(l.gmail_id));
  return { pending, recentAuto, errors };
}

/** Approving with "always for this merchant": the rule, plus the other pending rows it also fits. */
export function ruleFromApproval(row, category, ruleId, owner, nowIso) {
  return {
    id: ruleId, field: 'description', pattern: literalPattern(row.description), category, stream_override: '',
    auto_approve: true, hits: 1, created_by: owner || 'app', created_at: nowIso,
  };
}

export function pendingMatching(rows, rule) {
  const re = new RegExp(rule.pattern, 'i');
  return rows.filter((r) => r.status === 'pending' && r.stream && re.test(String(r.description || '')));
}

let counter = 0;
export function newId(prefix, now = Date.now()) {
  counter = (counter + 1) % 1000;
  return `${prefix}_${now.toString(36)}${counter.toString(36).padStart(2, '0')}`;
}

/**
 * Rows for the Add screen.
 * kind: 'out' | 'in' | 'transfer' | 'adjust' (adjust: amount is the signed correction)
 */
export function manualRows(input, { owner, nowIso, transferCategory = 'trf ke bank lain', adjustCategory = 'Penyesuaian', now = Date.now() }) {
  const amount = round2(Math.abs(num(input.amount)));
  if (!(amount > 0)) throw new Error('amount must be more than 0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) throw new Error('date must be YYYY-MM-DD');
  if (!input.stream) throw new Error('choose an account');
  const base = {
    date: input.date, time: input.time || '', owner, stream: input.stream, amount, category: input.category || '',
    description: (input.description || '').trim(), details: (input.details || '').trim(), source: 'manual', sender: '',
    gmail: '', gmail_id: '', ref_no: '', status: 'approved', transfer_id: '', rule_id: '', updated_by: owner || 'app', updated_at: nowIso,
  };
  if (input.kind === 'transfer') {
    if (!input.toStream || input.toStream === input.stream) throw new Error('choose a different destination account');
    const tid = newId('x', now);
    return [
      { ...base, id: newId('m', now), direction: 'out', category: transferCategory, transfer_id: tid, description: base.description || `Ke ${input.toStream}` },
      { ...base, id: newId('m', now), stream: input.toStream, direction: 'in', category: transferCategory, transfer_id: tid, description: base.description || `Dari ${input.stream}` },
    ];
  }
  if (input.kind === 'adjust') {
    const signed = num(input.amount);
    return [{ ...base, id: newId('m', now), direction: signed >= 0 ? 'in' : 'out', category: adjustCategory, description: base.description || 'Penyesuaian saldo' }];
  }
  if (input.kind !== 'in' && input.kind !== 'out') throw new Error(`unknown kind ${input.kind}`);
  if (!base.category) throw new Error('choose a category');
  return [{ ...base, id: newId('m', now), direction: input.kind }];
}

/** Month-end balance check: the row that makes the app's balance equal the real one (or null). */
export function balanceCorrection(balances, stream, actual, ctx) {
  const b = balances.find((x) => x.stream === stream);
  if (!b) throw new Error(`unknown account ${stream}`);
  const diff = round2(num(actual) - b.balance);
  if (Math.abs(diff) < 0.005) return null;
  return manualRows({ kind: 'adjust', amount: diff, date: ctx.date, stream, description: ctx.description || `Cek saldo ${stream}`, details: `Saldo di app ${b.balance}, saldo asli ${num(actual)}` }, ctx)[0];
}

/**
 * Renamed categories -> map old -> new, for updating rows and rules. A rename is a slot whose old
 * name is gone from the new list and whose new name wasn't in the old list. A name that is still
 * there was only moved: inserting "Barber" in the middle once renamed every category below it
 * into the next one (2026-10-06), so moved names are never renames.
 */
export function renamedCategories(oldSlots, newSlots) {
  const map = {};
  const all = (s) => new Set([...s.income, ...s.expense]);
  const before = all(oldSlots);
  const after = all(newSlots);
  for (const kind of ['income', 'expense']) {
    oldSlots[kind].forEach((o, i) => {
      const n = newSlots[kind][i];
      if (o && n && o !== EMPTY_SLOT && n !== EMPTY_SLOT && o !== n && !after.has(o) && !before.has(n)) map[o] = n;
    });
  }
  return map;
}

/** Budget usage for the month. budgets: [{category, monthly_budget}] */
export function budgetUsage(summary, budgets) {
  const spent = new Map(summary.byCategory.filter((c) => c.kind === 'expense').map((c) => [c.category, c.amount]));
  return budgets.filter((b) => num(b.monthly_budget) > 0).map((b) => {
    const used = spent.get(b.category) || 0;
    return { category: b.category, budget: num(b.monthly_budget), spent: used, ratio: used / num(b.monthly_budget) };
  }).sort((x, y) => y.ratio - x.ratio);
}

/** Simple filtered, newest-first list for the Transactions screen. */
export function filterTransactions(rows, { month, stream, category, status, direction, q, limit = 100, offset = 0 } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  const list = rows.filter((r) => (!month || String(r.date).startsWith(month))
    && (!stream || r.stream === stream) && (!category || r.category === category) && (!status || r.status === status)
    && (!direction || r.direction === direction)
    && (!needle || `${r.description} ${r.details} ${r.category} ${r.stream}`.toLowerCase().includes(needle)))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return { total: list.length, rows: list.slice(offset, offset + limit) };
}
