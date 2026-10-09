// The web app's server API, written against a small store interface so the same code runs on
// the spreadsheet (gas/sheetstore.js) and in tests (an in-memory store).
//
// store: {
//   read(tab) -> object[]                     rows keyed by header
//   append(tab, rows)
//   update(tab, [{ id, changes }])            by the "id" column
//   remove(tab, id)
//   replace(tab, rows)                        whole table body
//   config(key) / setConfig(key, value)
//   slots() / setSlots({ income: [6], expense: [28] })   category names in CASHFLOW K5:K38
// }
// env: { now(): Date, sync(): object }

import { TABS, FIXED_CATEGORIES } from './schema.js';
import { buildCategorySlots, validateAccounts } from './categories.js';
import {
  categoryLists, summarizeMonth, streamBalances, budgetPerDay, reviewItems, ruleFromApproval, pendingMatching,
  manualRows, balanceCorrection, renamedCategories, budgetUsage, filterTransactions, isoDate, newId, suggestBudgets, bigSpends, newestFromEmail,
} from './app.js';
import { compileRule } from './rules.js';
import { recurringCharges, payee } from './recurring.js';
import { missingSalaries, salaryCategory, paydayPeriod, currentPaydayMonth } from './salary.js';
import { weeklySummary } from './summary.js';
import { monthlyReport } from './notices.js';
import { goalProgress, goalProblems } from './goals.js';

const cents = (n) => Math.round(Number(n) * 100);
export const SPLIT_REF = 'split:';

const PUBLIC_FIELDS = ['date', 'time', 'stream', 'direction', 'amount', 'category', 'description', 'details', 'status'];

export function createApi(store, env) {
  const now = () => env.now();
  const nowIso = () => now().toISOString();
  const owner = () => String(store.config('owner_name') || '');
  // The two fixed categories (CASHFLOW K39/K40); the transfer one can be renamed (setting cat_transfer).
  const fixedNames = () => [FIXED_CATEGORIES.adjustment, String(store.config('cat_transfer') || FIXED_CATEGORIES.transfer)];
  const cats = () => categoryLists(store.slots(), fixedNames());
  const rows = () => store.read(TABS.transactions);
  const accounts = () => store.read(TABS.accounts);
  const year = () => Number(String(store.config('start_date') || '').slice(0, 4)) || now().getFullYear();
  const findRow = (id) => {
    const r = rows().find((x) => String(x.id) === String(id));
    if (!r) throw new Error(`transaction ${id} not found`);
    return r;
  };
  const allCategories = () => { const c = cats(); return new Set([...c.income, ...c.expense, ...c.fixed]); };
  const touch = (changes) => ({ ...changes, updated_by: owner() || 'app', updated_at: nowIso() });
  const onOff = (key) => (String(store.config(key) || 'on').toLowerCase() === 'off' ? 'off' : 'on');
  const payday = () => Number(store.config('payday_day')) || 28;
  const start = () => String(store.config('start_date') || '');
  const lines = (key, sep = '\n') => String(store.config(key) || '').split(sep).map((s) => s.trim()).filter(Boolean);
  const byPayday = () => String(store.config('summary_period') || '') === 'payday';
  /** The month the Summary opens on: the calendar month, or the payday period holding today. */
  const currentMonth = () => (byPayday() ? currentPaydayMonth(now(), payday()) : isoDate(now()).slice(0, 7));
  const rangeOf = (m) => (byPayday() ? paydayPeriod(m, payday()) : null);
  const recurring = (all) => recurringCharges(all, { today: now(), skipCategories: fixedNames(), hidden: lines('recurring_hidden') });
  const salaryStream = () => String(store.config('salary_stream') || '');
  const salaries = (all) => missingSalaries(all, {
    start: start(), today: now(), payday: payday(), category: salaryCategory(cats().income),
    skipped: lines('salary_skipped', ','), expected: Number(store.config('salary_amount')) || 0,
  }).map((s) => ({ ...s, stream: salaryStream() }));
  /** Spending from this amount up is flagged (Config big_amount; empty = Rp1.000.000, 0 = off). */
  const bigAmount = () => { const v = String(store.config('big_amount') ?? '').trim(); return v === '' ? 1000000 : Math.max(0, Number(v) || 0); };
  const json = (key) => { try { return JSON.parse(String(store.config(key) || '{}')) || {}; } catch (e) { return {}; } };
  /** Last balance check per account: stored checks, opening-balance checks and "Cek saldo" rows. */
  const lastChecks = (all) => {
    const out = {};
    const bump = (st, d) => { if (st && d && (!out[st] || String(out[st]) < String(d))) out[st] = String(d).slice(0, 10); };
    Object.entries(openingChecks()).forEach(([st, d]) => bump(st, d));
    Object.entries(json('balance_checks')).forEach(([st, d]) => bump(st, d));
    all.filter((r) => r.source === 'manual' && /^Cek saldo /.test(String(r.description || ''))).forEach((r) => bump(r.stream, String(r.date).slice(0, 10)));
    return out;
  };
  const recordCheck = (stream, d) => {
    const checks = json('balance_checks');
    if (!checks[stream] || String(checks[stream]) < d) store.setConfig('balance_checks', JSON.stringify({ ...checks, [stream]: d }));
  };
  /** Accounts whose opening balance came from a balance check, and that check's date. */
  const openingChecks = () => { try { return JSON.parse(String(store.config('opening_checks') || '{}')) || {}; } catch (e) { return {}; } };

  return {
    bootstrap() {
      const c = cats();
      return {
        owner: owner(), language: String(store.config('language') || ''), today: isoDate(now()), year: year(), sheetUrl: env.sheetUrl || '',
        start: String(store.config('start_date') || ''), currentMonth: currentMonth(), summaryPeriod: byPayday() ? 'payday' : 'month',
        payday: Number(store.config('payday_day')) || 28, categories: c,
        accounts: accounts().map((a) => ({ stream: a.stream, type: a.type, owner: a.owner, institution: a.institution })),
        connections: store.read(TABS.connections).map((x) => ({ gmail: x.gmail, last_sync: x.last_sync, last_status: x.last_status })),
        pendingCount: rows().filter((r) => r.status === 'pending').length,
      };
    },

    review() {
      const all = rows();
      return { ...reviewItems(all, store.read(TABS.inboxLog), { today: now() }), salary: salaries(all) };
    },

    /**
     * Records the salary of one payday (no email reports it). When that account's opening balance
     * came from a balance check made after this date, the check already counted this money, so the
     * opening balance goes down by the same amount and today's balance stays what the bank said.
     */
    recordSalary({ month, amount, stream, date }) {
      const value = Math.round(Math.abs(Number(amount)) * 100) / 100;
      if (!(value > 0)) throw new Error('amount must be more than 0');
      if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('month must be YYYY-MM');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('date must be YYYY-MM-DD');
      if (!accounts().some((a) => a.stream === stream)) throw new Error('choose an account');
      const category = salaryCategory(cats().income);
      if (!category) throw new Error('add an income category for salary first');
      if (rows().some((r) => r.ref_no === `salary:${month}` && r.status !== 'ignored')) throw new Error('the salary of this month is already recorded');
      const [row] = manualRows({ kind: 'in', amount: value, date, stream, category, description: category, details: `Gaji ${month}` }, { owner: owner(), nowIso: nowIso() });
      row.ref_no = `salary:${month}`;
      store.append(TABS.transactions, [row]);
      let openingChange = 0;
      const checked = openingChecks()[stream];
      if (checked && String(checked) > date) {
        store.replace(TABS.accounts, accounts().map((a) => (a.stream === stream ? { ...a, opening_balance: Math.round((Number(a.opening_balance || 0) - value) * 100) / 100 } : a)));
        openingChange = -value;
      }
      store.setConfig('salary_amount', value);
      if (stream !== salaryStream()) store.setConfig('salary_stream', stream);
      return { ok: true, id: row.id, openingChange };
    },

    /** "No salary this month": the card for that payday goes away. */
    skipSalary({ month }) {
      if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('month must be YYYY-MM');
      store.setConfig('salary_skipped', [...new Set([...lines('salary_skipped', ','), month])].join(', '));
      return { ok: true };
    },

    /** Undo of skipSalary. */
    unskipSalary({ month }) {
      store.setConfig('salary_skipped', lines('salary_skipped', ',').filter((m) => m !== month).join(', '));
      return { ok: true };
    },

    /** "Not a subscription": that payee leaves the subscriptions card. */
    hideRecurring({ name }) {
      const key = payee(name);
      if (!key) throw new Error('nothing to hide');
      store.setConfig('recurring_hidden', [...new Set([...lines('recurring_hidden'), key])].join('\n'));
      return { ok: true };
    },

    /** Undo of hideRecurring. */
    unhideRecurring({ name }) {
      store.setConfig('recurring_hidden', lines('recurring_hidden').filter((k) => k !== payee(name)).join('\n'));
      return { ok: true };
    },

    /** Everything the first screen needs, in one round trip. */
    init() {
      const boot = this.bootstrap();
      return { at: nowIso(), boot, review: this.review(), dashboard: this.dashboard({}), incoming: newestFromEmail(rows()) };
    },

    approve({ id, category, stream, always }) {
      const row = findRow(id);
      if (!allCategories().has(category)) throw new Error(`unknown category ${category}`);
      const s = stream || row.stream;
      if (!accounts().some((a) => a.stream === s)) throw new Error('choose an account');
      store.update(TABS.transactions, [{ id, changes: touch({ category, stream: s, status: 'approved' }) }]);
      let alsoIds = [];
      if (always && row.description) {
        const rule = ruleFromApproval(row, category, newId('r'), owner(), nowIso());
        store.append(TABS.rules, [rule]);
        const others = pendingMatching(rows(), compileRule(rule)).filter((r) => r.id !== id);
        store.update(TABS.transactions, others.map((r) => ({ id: r.id, changes: touch({ category, status: 'approved', rule_id: rule.id }) })));
        alsoIds = others.map((r) => r.id);
      }
      return { ok: true, alsoApproved: alsoIds.length, alsoIds };
    },

    ignore({ id }) {
      findRow(id);
      store.update(TABS.transactions, [{ id, changes: touch({ status: 'ignored' }) }]);
      return { ok: true };
    },

    restore({ id }) {
      findRow(id);
      store.update(TABS.transactions, [{ id, changes: touch({ status: 'pending' }) }]);
      return { ok: true };
    },

    list(filter = {}) {
      return filterTransactions(rows(), filter);
    },

    update({ id, fields }) {
      findRow(id);
      const changes = {};
      for (const k of PUBLIC_FIELDS) if (fields && k in fields) changes[k] = fields[k];
      if ('amount' in changes) {
        changes.amount = Math.abs(Number(changes.amount));
        if (!(changes.amount > 0)) throw new Error('amount must be more than 0');
      }
      if ('category' in changes && changes.category && !allCategories().has(changes.category)) throw new Error(`unknown category ${changes.category}`);
      if ('stream' in changes && !accounts().some((a) => a.stream === changes.stream)) throw new Error('unknown account');
      if ('direction' in changes && !['in', 'out'].includes(changes.direction)) throw new Error('direction must be in or out');
      if ('date' in changes && !/^\d{4}-\d{2}-\d{2}$/.test(changes.date)) throw new Error('date must be YYYY-MM-DD');
      store.update(TABS.transactions, [{ id, changes: touch(changes) }]);
      return { ok: true };
    },

    remove({ id }) {
      const row = findRow(id);
      // Rows from email stay (as ignored) so the sync never adds them again.
      if (row.gmail_id) store.update(TABS.transactions, [{ id, changes: touch({ status: 'ignored' }) }]);
      else store.remove(TABS.transactions, id);
      return { ok: true, ignoredInstead: !!row.gmail_id };
    },

    /**
     * Splits one transaction into parts with their own category (e.g. a shop order with books and
     * hobby items). The first part stays on the original row (an email row keeps its gmail_id, so
     * the sync never adds it again); the others become rows linked by ref_no "split:<id>".
     * Splitting again replaces the earlier parts.
     */
    split({ id, parts }) {
      const row = findRow(id);
      if (String(row.ref_no || '').startsWith(SPLIT_REF)) throw new Error('this is already a part of a split; open the original transaction');
      const old = rows().filter((r) => r.ref_no === `${SPLIT_REF}${id}`);
      const total = cents(row.amount) + old.reduce((s, r) => s + cents(r.amount), 0);
      if (!Array.isArray(parts) || parts.length < 2) throw new Error('a split needs at least 2 parts');
      if (parts.some((p) => !(cents(p.amount) > 0))) throw new Error('every part needs an amount above 0');
      if (parts.reduce((s, p) => s + cents(p.amount), 0) !== total) throw new Error(`the parts must add up to ${total / 100}`);
      const known = allCategories();
      for (const p of parts) if (!known.has(p.category)) throw new Error(`unknown category ${p.category}`);
      old.forEach((r) => store.remove(TABS.transactions, r.id));
      const [first, ...rest] = parts;
      store.update(TABS.transactions, [{ id, changes: touch({
        amount: cents(first.amount) / 100, category: first.category, description: String(first.description || row.description), status: 'approved',
      }) }]);
      const added = rest.map((p, i) => ({
        ...Object.fromEntries(Object.keys(row).map((k) => [k, ''])),
        id: `${id}_s${i + 1}`, date: row.date, time: row.time, owner: row.owner, stream: row.stream, direction: row.direction,
        amount: cents(p.amount) / 100, category: p.category, description: String(p.description || row.description), details: row.details,
        source: 'split', ref_no: `${SPLIT_REF}${id}`, status: 'approved', updated_by: owner() || 'app', updated_at: nowIso(),
      }));
      store.append(TABS.transactions, added);
      return { ok: true, ids: added.map((r) => r.id) };
    },

    /** Puts a split transaction back together. */
    unsplit({ id }) {
      const row = findRow(id);
      const parts = rows().filter((r) => r.ref_no === `${SPLIT_REF}${id}`);
      if (!parts.length) return { ok: true };
      const total = cents(row.amount) + parts.reduce((s, r) => s + cents(r.amount), 0);
      parts.forEach((r) => store.remove(TABS.transactions, r.id));
      store.update(TABS.transactions, [{ id, changes: touch({ amount: total / 100 }) }]);
      return { ok: true };
    },

    add(input) {
      if (input.kind !== 'transfer' && input.kind !== 'adjust' && !allCategories().has(input.category)) throw new Error('choose a category');
      const valid = new Set(accounts().map((a) => a.stream));
      if (!valid.has(input.stream) || (input.kind === 'transfer' && !valid.has(input.toStream))) throw new Error('choose an account');
      const added = manualRows(input, { owner: owner(), nowIso: nowIso(), transferCategory: String(store.config('cat_transfer') || 'trf ke bank lain') });
      store.append(TABS.transactions, added);
      return { ok: true, ids: added.map((r) => r.id) };
    },

    dashboard({ month, owner: who } = {}) {
      const today = now();
      const m = month || currentMonth();
      const all = rows();
      const c = cats();
      // By payday, "October" is 28 Sep .. 27 Oct (the salary of 28 Sep pays for October).
      const summary = summarizeMonth(all, c, m, who || '', rangeOf(m));
      const balances = streamBalances(all, accounts(), { year: year(), asOf: isoDate(today) });
      // The six months up to this one (none before the start date), for the trend chart.
      const first = start().slice(0, 7);
      const trend = [-5, -4, -3, -2, -1, 0].map((k) => monthAdd(m, k)).filter((x) => !first || x >= first)
        .map((x) => { const t = x === m ? summary : summarizeMonth(all, c, x, who || '', rangeOf(x)); return { month: x, income: t.income, expense: t.expense }; });
      return {
        month: m, summary, balances, trend,
        perDay: budgetPerDay(balances, today, payday()),
        budgets: budgetUsage(summary, store.read(TABS.budgets)),
        pendingCount: all.filter((r) => r.status === 'pending').length,
        salaryMissing: salaries(all),
        bigAmount: bigAmount(),
        big: bigSpends(all, { from: summary.from || `${m}-01`, to: summary.to || `${m}-31`, threshold: bigAmount(), skipCategories: fixedNames() }),
        recurring: recurring(all),
        goals: goalProgress(store.read(TABS.goals), streamBalances(all, accounts(), { year: year(), asOf: isoDate(today) }), today),
      };
    },

    /** Data for the weekly summary email (gas/weekly.js turns it into the email). */
    weekly() {
      const all = rows();
      return weeklySummary({ rows: all, cats: cats(), budgets: store.read(TABS.budgets), recurring: recurring(all), today: now(), bigAmount: bigAmount() });
    },

    /** Data for the monthly report email: `month` against the month before. */
    monthly({ month }) {
      const all = rows();
      const report = monthlyReport({ rows: all, cats: cats(), budgets: store.read(TABS.budgets), month });
      return { ...report, goals: goalProgress(store.read(TABS.goals), streamBalances(all, accounts(), { year: year(), asOf: isoDate(now()) }), now()) };
    },

    sendSummary() {
      if (!env.sendSummary) throw new Error('sending email is not available here');
      return env.sendSummary();
    },

    settings() {
      return {
        accounts: accounts(), rules: store.read(TABS.rules), budgets: store.read(TABS.budgets), goals: store.read(TABS.goals), categories: cats(),
        config: {
          payday_day: store.config('payday_day'), language: store.config('language'), owner_name: store.config('owner_name'),
          owner_bank_names: store.config('owner_bank_names'), start_date: store.config('start_date'),
          weekly_email: onOff('weekly_email'), monthly_email: onOff('monthly_email'), payday_email: onOff('payday_email'),
          summary_period: byPayday() ? 'payday' : 'month', salary_stream: salaryStream(), salary_amount: Number(store.config('salary_amount')) || '',
          big_amount: bigAmount(),
        },
        balances: streamBalances(rows(), accounts(), { year: year(), asOf: isoDate(now()) }), lastChecks: lastChecks(rows()),
        budgetSuggestions: suggestBudgets(rows(), cats(), { start: start(), today: now() }),
        archives: String(store.config('archives') || '').split('\n').filter(Boolean)
          .map((line) => { const [year, url] = line.split(' '); return { year, url }; }),
        connections: store.read(TABS.connections), selftest: store.config('last_selftest'),
      };
    },

    saveAccounts({ accounts: list }) {
      const clean = list.map((a) => ({
        stream: String(a.stream || '').trim(), type: a.type, owner: a.owner || owner(), institution: String(a.institution || '').trim(),
        match_hint: String(a.match_hint || '').trim(), opening_balance: Number(a.opening_balance) || 0, notes: a.notes || '',
      }));
      validateAccounts(clean);
      const used = new Set(rows().map((r) => r.stream).filter(Boolean));
      const kept = new Set(clean.map((a) => a.stream));
      const missing = [...used].filter((s) => !kept.has(s));
      if (missing.length) throw new Error(`these accounts have transactions and can't be removed: ${missing.join(', ')}`);
      store.replace(TABS.accounts, clean);
      return { ok: true };
    },

    saveCategories({ income, expense }) {
      const before = store.slots();
      const next = buildCategorySlots({ income, expense }, fixedNames());
      const renamed = renamedCategories(before, next);
      const nextSet = new Set([...next.income, ...next.expense]);
      const inUse = new Set(rows().map((r) => r.category));
      const dropped = [...before.income, ...before.expense].filter((c) => c !== '-' && !nextSet.has(c) && !renamed[c] && inUse.has(c));
      if (dropped.length) throw new Error(`these categories are used by transactions; rename them instead of removing: ${dropped.join(', ')}`);
      changeCategorySlots(store, next);
      return { ok: true, renamed };
    },

    saveRules({ rules }) {
      const known = allCategories();
      const clean = rules.map((r) => {
        const c = compileRule(r);
        if (!c.re) throw new Error(`rule "${r.pattern}": ${c.error}`);
        if (!known.has(r.category)) throw new Error(`rule "${r.pattern}": unknown category ${r.category}`);
        return {
          id: r.id || newId('r'), field: r.field || 'description', pattern: r.pattern, category: r.category,
          stream_override: r.stream_override || '', auto_approve: r.auto_approve !== false && r.auto_approve !== 'FALSE',
          hits: Number(r.hits) || 0, created_by: r.created_by || owner(), created_at: r.created_at || nowIso(),
        };
      });
      store.replace(TABS.rules, clean);
      return { ok: true };
    },

    saveGoals({ goals }) {
      const clean = (goals || []).map((g) => ({
        stream: String(g.stream || ''), name: String(g.name || '').trim(), target: Number(g.target) || 0, target_date: String(g.target_date || ''),
      }));
      const problems = goalProblems(clean, accounts());
      if (problems.length) throw new Error(problems.join('; '));
      store.replace(TABS.goals, clean);
      return { ok: true };
    },

    saveBudgets({ budgets }) {
      const known = new Set(cats().expense);
      const clean = budgets.filter((b) => Number(b.monthly_budget) > 0).map((b) => {
        if (!known.has(b.category)) throw new Error(`unknown expense category ${b.category}`);
        return { category: b.category, monthly_budget: Number(b.monthly_budget) };
      });
      store.replace(TABS.budgets, clean);
      return { ok: true };
    },

    saveConfig(values) {
      if ('payday_day' in values) {
        const d = Number(values.payday_day);
        if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error('payday must be a day 1-31');
        store.setConfig('payday_day', d);
      }
      if ('language' in values) {
        if (!['', 'id', 'en'].includes(values.language)) throw new Error('language must be id or en');
        store.setConfig('language', values.language);
      }
      if ('owner_bank_names' in values) store.setConfig('owner_bank_names', String(values.owner_bank_names || ''));
      for (const key of ['weekly_email', 'monthly_email', 'payday_email']) if (key in values) store.setConfig(key, values[key] === 'off' ? 'off' : 'on');
      if ('summary_period' in values) store.setConfig('summary_period', values.summary_period === 'payday' ? 'payday' : 'month');
      if ('salary_stream' in values) {
        if (values.salary_stream && !accounts().some((a) => a.stream === values.salary_stream)) throw new Error('unknown account');
        store.setConfig('salary_stream', String(values.salary_stream || ''));
      }
      if ('big_amount' in values) {
        const n = Number(values.big_amount);
        if (!(n >= 0)) throw new Error('big spending amount must be a number');
        store.setConfig('big_amount', n);
      }
      if ('salary_amount' in values) {
        const n = Number(values.salary_amount || 0);
        if (!(n >= 0)) throw new Error('salary must be a number');
        store.setConfig('salary_amount', n || '');
      }
      return { ok: true };
    },

    /**
     * Month-end balance check. Normally the difference becomes a Penyesuaian row. `asOpening`
     * (an account checked for the first time) puts it into the account's opening balance instead:
     * the money was there before the start date, it didn't arrive today. `category` files the
     * difference as real income (bank shows more) or spending (bank shows less) instead, e.g. money
     * that came into BCA, which never emails about money coming in.
     */
    balanceCheck({ stream, actual, date, asOpening, category }) {
      const d = date || isoDate(now());
      if (!Number.isFinite(Number(actual)) || actual === '' || actual == null) throw new Error(`${stream}: enter the balance`);
      const problem = this.balanceCheckProblem({ stream, actual, date: d, asOpening, category });
      if (problem) throw new Error(problem);
      recordCheck(stream, d);
      const balances = streamBalances(rows(), accounts(), { year: year(), asOf: d });
      if (asOpening) {
        const b = balances.find((x) => x.stream === stream);
        const diff = Math.round((Number(actual) - b.balance) * 100) / 100;
        if (Math.abs(diff) < 0.005) return { ok: true, stream, adjusted: 0, opening: null };
        const list = accounts().map((a) => (a.stream === stream ? { ...a, opening_balance: Math.round((Number(a.opening_balance || 0) + diff) * 100) / 100 } : a));
        store.replace(TABS.accounts, list);
        // Remembered so money recorded later for an earlier date (a salary) can keep this balance.
        const checks = openingChecks();
        if (!checks[stream] || String(checks[stream]) < d) store.setConfig('opening_checks', JSON.stringify({ ...checks, [stream]: d }));
        return { ok: true, stream, adjusted: 0, opening: list.find((a) => a.stream === stream).opening_balance, openingChange: diff };
      }
      const cat = category && category !== FIXED_CATEGORIES.adjustment ? category : FIXED_CATEGORIES.adjustment;
      const fix = balanceCorrection(balances, stream, actual, {
        owner: owner(), nowIso: nowIso(), date: d, adjustCategory: cat,
      });
      if (fix) store.append(TABS.transactions, [fix]);
      return { ok: true, stream, category: fix ? cat : '', adjusted: fix ? (fix.direction === 'in' ? fix.amount : -fix.amount) : 0 };
    },

    /** What is wrong with one balance check, before anything is written ('' = nothing). */
    balanceCheckProblem({ stream, actual, date, asOpening, category }) {
      if (!accounts().some((a) => a.stream === stream)) return `unknown account ${stream}`;
      if (!Number.isFinite(Number(actual))) return `${stream}: the balance must be a number`;
      if (asOpening || !category || category === FIXED_CATEGORIES.adjustment) return '';
      const b = streamBalances(rows(), accounts(), { year: year(), asOf: date || isoDate(now()) }).find((x) => x.stream === stream);
      const diff = Number(actual) - b.balance;
      if (Math.abs(diff) < 0.005) return '';
      const c = cats();
      if (diff > 0 && !c.income.includes(category)) return `${stream}: "${category}" is not an income category`;
      if (diff < 0 && !c.expense.includes(category)) return `${stream}: "${category}" is not an expense category`;
      return '';
    },

    /** Balance check of several accounts at once (the ones the owner filled in): all checked first, then saved. */
    balanceCheckAll({ date, items }) {
      const list = (items || []).filter((i) => i && i.stream && i.actual !== '' && i.actual != null)
        .map((i) => ({ stream: i.stream, actual: Number(i.actual), date, asOpening: !!i.asOpening, category: i.category || '' }));
      if (!list.length) throw new Error('enter at least one balance');
      const problems = list.map((i) => this.balanceCheckProblem(i)).filter(Boolean);
      if (problems.length) throw new Error(problems.join('; '));
      return { ok: true, results: list.map((i) => this.balanceCheck(i)) };
    },

    syncNow() {
      return env.sync();
    },
  };
}

const monthAdd = (ym, k) => {
  const [y, mo] = ym.split('-').map(Number);
  const d = new Date(y, mo - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Writes new category slots. A different name in the same slot is a rename: it is carried into
 * transactions, rules, budgets and the default-category settings.
 */
export function changeCategorySlots(store, next) {
  const renamed = renamedCategories(store.slots(), next);
  store.setSlots(next);
  return renameCategoryEverywhere(store, renamed);
}

/** Carries renames (old -> new) into transactions, rules, budgets and the default-category settings. */
export function renameCategoryEverywhere(store, renamed) {
  if (!Object.keys(renamed).length) return renamed;
  const to = (r) => ({ id: r.id, changes: { category: renamed[r.category] } });
  store.update(TABS.transactions, store.read(TABS.transactions).filter((r) => renamed[r.category]).map(to));
  store.update(TABS.rules, store.read(TABS.rules).filter((r) => renamed[r.category]).map(to));
  store.replace(TABS.budgets, store.read(TABS.budgets).map((b) => ({ ...b, category: renamed[b.category] || b.category })));
  for (const key of ['cat_transfer', 'cat_fee', 'cat_dividend']) {
    const v = String(store.config(key) || '');
    if (renamed[v]) store.setConfig(key, renamed[v]);
  }
  return renamed;
}

export const API_METHODS = [
  'init', 'bootstrap', 'review', 'approve', 'ignore', 'restore', 'list', 'update', 'remove', 'add', 'dashboard', 'settings',
  'saveAccounts', 'saveCategories', 'saveRules', 'saveBudgets', 'saveConfig', 'balanceCheck', 'syncNow', 'split', 'unsplit', 'sendSummary', 'saveGoals',
  'recordSalary', 'skipSalary', 'unskipSalary', 'hideRecurring', 'unhideRecurring', 'balanceCheckAll',
];
