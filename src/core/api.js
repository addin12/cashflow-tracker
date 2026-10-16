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
  manualRows, balanceCorrection, renamedCategories, budgetUsage, filterTransactions, isoDate, newId, suggestBudgets, bigSpends, newestFromEmail, dailySpending, rowView,
} from './app.js';
import { compileRule } from './rules.js';
import { recurringCharges, payee } from './recurring.js';
import { missingSalaries, salaryCategory, paydayPeriod, currentPaydayMonth } from './salary.js';
import { topPlaces, biggestExpenses, moneyFlow, spendingPattern, tagTotals, newPlaceIds } from './insights.js';
import { netWorth, assetProblems, ASSET_KINDS, duePlans, owedSummary, upcomingBills, financialHealth } from './wealth.js';
import { cardBills, cardProblems } from './cards.js';
import { sptList } from './spt.js';
import { yearlyItems } from './yearly.js';
import { pushEventsOf, PUSH_EVENTS, testNotice } from './push.js';
import { parseQuick, usualEntries } from './quick.js';
import { weeklySummary } from './summary.js';
import { monthlyReport } from './notices.js';
import { goalProgress, goalProblems } from './goals.js';

const cents = (n) => Math.round(Number(n) * 100);
export const SPLIT_REF = 'split:';

const PUBLIC_FIELDS = ['date', 'time', 'stream', 'direction', 'amount', 'category', 'description', 'details', 'status'];

export function createApi(store, env) {
  const now = () => env.now();
  const nowIso = () => now().toISOString();
  // The person using the app (each of you when two share it); the owner when the script runs by itself.
  const owner = () => String(env.meName || store.config('owner_name') || '');
  const members = () => [store.config('owner_name'), store.config('partner_email') ? store.config('partner_name') : ''].map((s) => String(s || '')).filter(Boolean);
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
  const list = (key) => { try { const v = JSON.parse(String(store.config(key) || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  /** Subscriptions seen in the app's rows, plus yearly plans found further back in Gmail (Config yearly_subs). */
  const recurring = (all) => {
    const r = recurringCharges(all, { today: now(), skipCategories: fixedNames(), hidden: lines('recurring_hidden'), start: start() });
    const known = new Set(r.items.map((i) => i.key));
    const yearly = yearlyItems(list('yearly_subs'), all, { today: now(), hidden: lines('recurring_hidden') }).filter((i) => !known.has(i.key));
    if (!yearly.length) return r;
    return {
      items: [...r.items, ...yearly].sort((a, b) => a.nextDate.localeCompare(b.nextDate) || b.amount - a.amount),
      monthlyTotal: Math.round((r.monthlyTotal + yearly.reduce((t, i) => t + i.amount / 12, 0)) * 100) / 100,
    };
  };
  /** Credit cards and paylater (Config cards): the last bill, what is paid, when it's due. */
  const cards = (all) => cardBills(list('cards'), all, now(), fixedNames()[1]);
  /** The one-time code a phone brings back from the site's /notifikasi page (valid 30 minutes, renewed after 20). */
  const pushCode = () => {
    const [code, at] = String(store.config('push_nonce') || '').split(' ');
    if (code && now().getTime() - Number(at) < 20 * 60000) return code;
    const fresh = env.push.token();
    store.setConfig('push_nonce', `${fresh} ${now().getTime()}`);
    return fresh;
  };
  /** "Pertama kali": rows paying a place for the first time get first: true. */
  const firstIds = (all) => newPlaceIds(all, { start: start(), today: now(), skipCategories: fixedNames() });
  const withFirst = (rs, ids) => rs.map((r) => (ids.has(String(r.id)) ? { ...r, first: true } : r));
  const salaryStream = () => String(store.config('salary_stream') || '');
  const salaries = (all) => missingSalaries(all, {
    start: start(), today: now(), payday: payday(), category: salaryCategory(cats().income),
    skipped: lines('salary_skipped', ','), expected: Number(store.config('salary_amount')) || 0,
  }).map((s) => ({ ...s, stream: salaryStream() }));
  const lastDayIso = (ym) => { const [y, mo] = ym.split('-').map(Number); return isoDate(new Date(y, mo, 0)); };
  /** The dates a month stands for: the calendar month, or its payday period. */
  const spanOf = (ym) => rangeOf(ym) || { from: `${ym}-01`, to: lastDayIso(ym) };
  const newestFirst = (a, b) => `${String(b.date).slice(0, 10)}${b.time}`.localeCompare(`${String(a.date).slice(0, 10)}${a.time}`);
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
  /** Trips and events: #tags with a budget, spent all-time against it. */
  const eventBudgets = (all) => {
    const budgets = json('tag_budgets');
    const tags = Object.keys(budgets);
    if (!tags.length) return [];
    const totals = new Map(tagTotals(all, { from: '0000-01-01', to: '9999-12-31' }).map((t) => [t.tag, t]));
    return tags.map((tag) => ({ tag, budget: Number(budgets[tag]) || 0, ...(totals.get(tag) || { out: 0, in: 0, count: 0, first: '', last: '' }) }))
      .sort((a, b) => String(b.last).localeCompare(String(a.last)));
  };
  /** "Tutup hari": is today closed, how many days in a row, and was anything logged by hand today. */
  const closedDays = () => String(store.config('closed_days') || '').split(',').map((d) => d.trim()).filter(Boolean);
  const dayState = (all) => {
    const t = isoDate(now());
    const days = new Set(closedDays());
    let streak = 0;
    const d = new Date(now().getFullYear(), now().getMonth(), now().getDate());
    if (!days.has(t)) d.setDate(d.getDate() - 1); // an open today doesn't break yesterday's streak
    while (days.has(isoDate(d))) { streak += 1; d.setDate(d.getDate() - 1); }
    const byHand = all.filter((r) => String(r.date).slice(0, 10) === t && ['manual', 'note'].includes(r.source) && r.status !== 'ignored').length;
    // Until 12:00 a streak can still be kept by closing yesterday.
    const day = (k) => isoDate(new Date(now().getFullYear(), now().getMonth(), now().getDate() - k));
    const late = now().getHours() < 12 && !days.has(day(1)) && days.has(day(2));
    return { date: t, closed: days.has(t), streak, byHand, ...(late ? { yesterday: day(1) } : {}) };
  };
  /** Open and paid "Tagih" entries, each with the name of the payment it belongs to. */
  const owedView = (all) => {
    const names = new Map(all.map((r) => [String(r.id), r.description || r.details || '']));
    const s = owedSummary(store.read(TABS.owed));
    const withName = (o) => ({ ...o, date: String(o.date || '').slice(0, 10), amount: Number(o.amount) || 0, payment: names.get(String(o.tx_id)) || o.note || '' });
    return { open: s.open.map(withName), total: s.total, paid: s.paid.slice(-20).map(withName) };
  };
  const importHistory = () => { try { return JSON.parse(String(store.config('imports') || '[]')) || []; } catch (e) { return []; } };
  /** Accounts whose opening balance came from a balance check, and that check's date. */
  const openingChecks = () => { try { return JSON.parse(String(store.config('opening_checks') || '{}')) || {}; } catch (e) { return {}; } };

  return {
    bootstrap() {
      const c = cats();
      return {
        owner: owner(), me: owner(), members: members(), language: String(store.config('language') || ''), today: isoDate(now()), year: year(), sheetUrl: env.sheetUrl || '',
        start: String(store.config('start_date') || ''), currentMonth: currentMonth(), summaryPeriod: byPayday() ? 'payday' : 'month',
        payday: Number(store.config('payday_day')) || 28, categories: c,
        accounts: accounts().map((a) => ({ stream: a.stream, type: a.type, owner: a.owner, institution: a.institution })),
        connections: store.read(TABS.connections).map((x) => ({ gmail: x.gmail, last_sync: x.last_sync, last_status: x.last_status })),
        pendingCount: rows().filter((r) => r.status === 'pending').length,
        rules: store.read(TABS.rules).map((r) => ({ pattern: r.pattern, category: r.category })), // for typing a transaction as a sentence
        usual: usualEntries(rows(), { today: now() }),
      };
    },

    review() {
      const all = rows();
      const r = reviewItems(all, store.read(TABS.inboxLog), { today: now() });
      return { ...r, pending: withFirst(r.pending, firstIds(all)), salary: salaries(all), day: dayState(all) };
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
      const all = rows();
      const res = filterTransactions(all, filter);
      return { ...res, rows: withFirst(res.rows, firstIds(all)) };
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
      // Kita / Aku / Dia: one person's rows and accounts, or the household.
      const all = who ? rows().filter((r) => r.owner === who) : rows();
      const accts = who ? accounts().filter((a) => a.owner === who) : accounts();
      const c = cats();
      // By payday, "October" is 28 Sep .. 27 Oct (the salary of 28 Sep pays for October).
      const summary = summarizeMonth(all, c, m, '', rangeOf(m));
      const balances = streamBalances(all, accts, { year: year(), asOf: isoDate(today) });
      // The six months up to this one (none before the start date), for the trend chart.
      const first = start().slice(0, 7);
      const trend = [-5, -4, -3, -2, -1, 0].map((k) => monthAdd(m, k)).filter((x) => !first || x >= first)
        .map((x) => { const t = x === m ? summary : summarizeMonth(all, c, x, '', rangeOf(x)); return { month: x, income: t.income, expense: t.expense }; });
      const rec = recurring(all);
      const cardList = cards(all);
      const wealth = store.read(TABS.assets).length ? netWorth(balances, store.read(TABS.assets)) : null;
      const goals = goalProgress(store.read(TABS.goals), balances, today);
      const ids = firstIds(all);
      return {
        month: m, who: who || '', summary, balances, trend,
        perDay: budgetPerDay(balances, today, payday()),
        budgets: budgetUsage(summary, store.read(TABS.budgets)),
        pendingCount: all.filter((r) => r.status === 'pending').length,
        salaryMissing: salaries(all),
        // Day by day this month and last month: the calendar and the "compared with last month" line.
        daily: dailySpending(all, c, spanOf(m)),
        prevDaily: dailySpending(all, c, spanOf(monthAdd(m, -1))),
        // Today's payments (also the ones still waiting for a category) and the latest rows.
        today: withFirst(all.filter((r) => String(r.date).slice(0, 10) === isoDate(today) && r.direction === 'out' && r.status !== 'ignored' && !fixedNames().includes(r.category))
          .sort(newestFirst).map(rowView), ids),
        recent: withFirst(all.filter((r) => r.status === 'approved').sort(newestFirst).slice(0, 8).map(rowView), ids),
        places: topPlaces(all, c, spanOf(m)),
        biggest: biggestExpenses(all, c, spanOf(m)),
        flow: moneyFlow(all, c, spanOf(m), fixedNames()[1]),
        pattern: spendingPattern(all, c, spanOf(m)),
        tags: tagTotals(all, spanOf(m)),
        owed: owedView(all),
        bills: upcomingBills(store.read(TABS.plans), rec.items, today, 7, cardList),
        events: eventBudgets(all),
        cards: cardList,
        health: financialHealth({ balances, goals, trend, month: m, summary, wealth }),
        wealth,
        recurringMarks: json('recurring_marks'),
        bigAmount: bigAmount(),
        big: bigSpends(all, { from: summary.from || `${m}-01`, to: summary.to || `${m}-31`, threshold: bigAmount(), skipCategories: fixedNames() }),
        recurring: rec,
        goals,
      };
    },

    /**
     * The SPT asset and debt list for a year: accounts on 31 December (today while the year runs)
     * and the Aset tab as it is now.
     */
    spt({ year: y } = {}) {
      const yy = Number(y) || now().getFullYear();
      const asOf = isoDate(now()) < `${yy}-12-31` ? isoDate(now()) : `${yy}-12-31`;
      const balances = streamBalances(rows(), accounts(), { year: year(), asOf });
      return sptList({ balances, assets: store.read(TABS.assets), year: yy, asOf });
    },

    /** Credit cards and paylater: which account, its statement day and due day. */
    saveCards({ cards: input }) {
      const clean = (input || []).map((c) => ({ stream: String(c.stream || ''), statement: Number(c.statement), due: Number(c.due) }));
      const problems = cardProblems(clean, accounts());
      if (problems.length) throw new Error(problems.join('; '));
      store.setConfig('cards', JSON.stringify(clean));
      return { ok: true };
    },

    /** The partner connects their own Gmail: a sync trigger that runs as them, then a first sync. */
    connectMe() {
      if (!env.connect) throw new Error('connecting Gmail is not available here');
      return env.connect();
    },

    /** A test notification to every phone that joined. */
    pushTest() {
      if (!env.push) throw new Error('notifications are not set up');
      return env.push.send(testNotice(String(store.config('language') || 'id') === 'en' ? 'en' : 'id'));
    },

    /** Forgets every phone (they stop getting notifications). */
    pushForget() {
      store.setConfig('push_devices', '[]');
      return { ok: true };
    },

    /** Reads receipts a year back in Gmail for yearly plans (gas/yearly.js). */
    scanYearly() {
      if (!env.scanYearly) throw new Error('reading Gmail is not available here');
      return env.scanYearly();
    },

    /** A year month by month (each month as the summary counts it), with the year's places and biggest payments. */
    yearly({ year: y } = {}) {
      const yy = Number(y) || now().getFullYear();
      const all = rows();
      const c = cats();
      const months = [...Array(12)].map((_, i) => `${yy}-${String(i + 1).padStart(2, '0')}`).map((m) => {
        const t = summarizeMonth(all, c, m, '', rangeOf(m));
        return { month: m, income: t.income, expense: t.expense, byCategory: Object.fromEntries(t.byCategory.filter((x) => x.kind === 'expense').map((x) => [x.category, x.amount])) };
      });
      const range = { from: spanOf(`${yy}-01`).from, to: spanOf(`${yy}-12`).to };
      return { year: yy, months, places: topPlaces(all, c, range, 10), biggest: biggestExpenses(all, c, range, 8), pattern: spendingPattern(all, c, range), tags: tagTotals(all, range) };
    },

    /**
     * Rows from a bank statement (already read and checked against the app's rows on the phone).
     * A row with a category is saved as approved, one without waits in Review. Rows dated on or
     * before the account's first balance check were already in that balance, so the opening
     * balance moves by the same amount and today's balance stays what the bank said.
     */
    importStatement({ stream, rows: list, file }) {
      if (!accounts().some((a) => a.stream === stream)) throw new Error('choose an account');
      if (!Array.isArray(list) || !list.length) throw new Error('nothing to import');
      if (list.length > 2000) throw new Error('too many rows in one import (max 2000)');
      const known = allCategories();
      const batch = newId('b');
      const added = list.map((r, i) => {
        const amount = Math.round(Math.abs(Number(r.amount)) * 100) / 100;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) throw new Error(`row ${i + 1}: date must be YYYY-MM-DD`);
        if (!(amount > 0)) throw new Error(`row ${i + 1}: amount must be more than 0`);
        if (r.direction !== 'in' && r.direction !== 'out') throw new Error(`row ${i + 1}: direction must be in or out`);
        if (r.category && !known.has(r.category)) throw new Error(`row ${i + 1}: unknown category ${r.category}`);
        return {
          id: newId('i'), date: r.date, time: '', owner: owner(), stream, direction: r.direction, amount, category: r.category || '',
          description: String(r.description || '').slice(0, 200), details: 'Mutasi', source: 'import', sender: '', gmail: '', gmail_id: '',
          ref_no: `import:${batch}`, status: r.category ? 'approved' : 'pending', transfer_id: '', rule_id: '', updated_by: owner() || 'app', updated_at: nowIso(),
        };
      });
      store.append(TABS.transactions, added);
      const checked = openingChecks()[stream];
      const openingChange = checked ? -Math.round(added.filter((r) => r.date <= String(checked))
        .reduce((t, r) => t + (r.direction === 'in' ? r.amount : -r.amount), 0) * 100) / 100 : 0;
      if (openingChange) {
        store.replace(TABS.accounts, accounts().map((a) => (a.stream === stream ? { ...a, opening_balance: Math.round((Number(a.opening_balance || 0) + openingChange) * 100) / 100 } : a)));
      }
      const history = [{ batch, stream, file: String(file || '').slice(0, 80), at: nowIso(), count: added.length, openingChange }, ...importHistory()].slice(0, 30);
      store.setConfig('imports', JSON.stringify(history));
      return { ok: true, batch, added: added.length, pending: added.filter((r) => r.status === 'pending').length, openingChange };
    },

    /** Takes an import back out: its rows, and the opening-balance change it made. */
    undoImport({ batch }) {
      const h = importHistory();
      const entry = h.find((x) => x.batch === batch);
      if (!entry) throw new Error('import not found');
      rows().filter((r) => r.ref_no === `import:${batch}`).forEach((r) => store.remove(TABS.transactions, r.id));
      if (entry.openingChange) {
        store.replace(TABS.accounts, accounts().map((a) => (a.stream === entry.stream ? { ...a, opening_balance: Math.round((Number(a.opening_balance || 0) - entry.openingChange) * 100) / 100 } : a)));
      }
      store.setConfig('imports', JSON.stringify(h.filter((x) => x.batch !== batch)));
      return { ok: true };
    },

    /**
     * Notes from an email you sent yourself ("catat kopi 28rb gopay"): one transaction per note,
     * saved when amount, account and category are all clear, otherwise waiting in Review.
     * Notes without an amount are skipped. The email id goes on every row, so it is read once.
     */
    addNotes({ gmailId, sentMs, notes }) {
      const day = isoDate(new Date(Number(sentMs) || now().getTime()));
      const c = cats();
      const salaryCat = salaryCategory(c.income);
      const ctx = { accounts: accounts(), rules: store.read(TABS.rules), today: day, salaryCategory: salaryCat };
      const added = [];
      const skipped = [];
      (notes || []).forEach((text, i) => {
        const p = parseQuick(text, ctx);
        if (!(p.amount > 0)) { skipped.push(text); return; }
        const fits = p.category && (p.direction === 'in' ? c.income : c.expense).includes(p.category);
        added.push({
          id: `n_${gmailId}_${i}`, date: p.date, time: '', owner: owner(), stream: p.stream, direction: p.direction, amount: Math.round(p.amount * 100) / 100,
          category: fits ? p.category : '', description: p.description ? p.description[0].toUpperCase() + p.description.slice(1) : text,
          details: ['Catatan', ...p.tags.map((t) => `#${t}`)].join(' '), source: 'note', sender: '', gmail: '', gmail_id: gmailId, ref_no: '',
          status: fits && p.stream ? 'approved' : 'pending', transfer_id: '', rule_id: '', updated_by: owner() || 'note', updated_at: nowIso(),
        });
      });
      if (added.length) store.append(TABS.transactions, added);
      return { added: added.length, pending: added.filter((r) => r.status === 'pending').length, skipped };
    },

    /** A budget for a #tag (a trip, an event); 0 removes it. */
    setTagBudget({ tag, amount }) {
      const t = String(tag || '').replace(/^#/, '').trim().toLowerCase();
      if (!/^[\p{L}\p{N}_-]+$/u.test(t)) throw new Error('tag must be one word');
      const v = Number(amount);
      if (!(v >= 0)) throw new Error('budget must be a number');
      const b = json('tag_budgets');
      if (v > 0) b[t] = v; else delete b[t];
      store.setConfig('tag_budgets', JSON.stringify(b));
      return { ok: true };
    },

    /** "Tutup hari": today (or another day) is done; undone with reopenDay. */
    closeDay({ date }) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : isoDate(now());
      store.setConfig('closed_days', [d, ...closedDays().filter((x) => x !== d)].sort().reverse().slice(0, 120).join(','));
      return { ok: true, ...dayState(rows()) };
    },
    reopenDay({ date }) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : isoDate(now());
      store.setConfig('closed_days', closedDays().filter((x) => x !== d).join(','));
      return { ok: true, ...dayState(rows()) };
    },

    /** "Tagih": friends who share a payment you made, and what each owes you. */
    tagih({ txId, people }) {
      const row = findRow(txId);
      const list = (Array.isArray(people) ? people : []).map((p) => ({ who: String(p.who || '').trim(), amount: Math.round(Math.abs(Number(p.amount)) * 100) / 100 }));
      if (!list.length) throw new Error('add at least one name');
      list.forEach((p, i) => {
        if (!p.who) throw new Error(`person ${i + 1}: name is required`);
        if (!(p.amount > 0)) throw new Error(`${p.who}: amount must be more than 0`);
      });
      const added = list.map((p) => ({ id: newId('o'), tx_id: row.id, who: p.who, amount: p.amount, note: row.description || row.details || '', date: String(row.date).slice(0, 10), status: 'open', paid_at: '' }));
      store.append(TABS.owed, added);
      return { ok: true, ids: added.map((o) => o.id) };
    },

    /** Marks a "Tagih" entry paid back (or open again). */
    owedSet({ id, status }) {
      if (!store.read(TABS.owed).some((o) => String(o.id) === String(id))) throw new Error('not found');
      if (status !== 'paid' && status !== 'open') throw new Error('status must be paid or open');
      store.update(TABS.owed, [{ id, changes: { status, paid_at: status === 'paid' ? isoDate(now()) : '' } }]);
      return { ok: true };
    },

    owedRemove({ id }) {
      if (!store.read(TABS.owed).some((o) => String(o.id) === String(id))) throw new Error('not found');
      store.remove(TABS.owed, id);
      return { ok: true };
    },

    /** Planned recurring transactions. A new one starts next month when its day has passed this month. */
    savePlans({ plans }) {
      const known = new Set(accounts().map((a) => a.stream));
      const c = cats();
      const month = isoDate(now()).slice(0, 7);
      const before = new Map(store.read(TABS.plans).map((p) => [String(p.id), p]));
      const clean = (plans || []).map((p, i) => {
        const n = `plan ${i + 1}`;
        const amount = Math.round(Math.abs(Number(p.amount)) * 100) / 100;
        const day = Number(p.day);
        if (!String(p.name || '').trim()) throw new Error(`${n}: name is required`);
        if (!(amount > 0)) throw new Error(`${n}: amount must be more than 0`);
        if (p.direction !== 'in' && p.direction !== 'out') throw new Error(`${n}: choose money in or out`);
        if (!known.has(p.stream)) throw new Error(`${n}: choose an account`);
        if (p.category && !(p.direction === 'in' ? c.income : c.expense).includes(p.category)) throw new Error(`${n}: "${p.category}" doesn't fit`);
        if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error(`${n}: day must be 1-31`);
        const old = before.get(String(p.id));
        const fresh = !old;
        const passed = Number(isoDate(now()).slice(8)) > Math.min(day, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate());
        return {
          id: old ? old.id : newId('p'), name: String(p.name).trim(), amount, direction: p.direction, stream: p.stream, category: p.category || '', day,
          auto: !!p.auto && !!p.category, last: fresh ? (passed ? month : '') : String(old.last || ''), active: p.active !== false,
        };
      });
      store.replace(TABS.plans, clean);
      return { ok: true };
    },

    /** Adds the planned transactions that are due (run by the daily trigger and the sync). */
    createDuePlanned() {
      const plans = store.read(TABS.plans);
      if (!plans.length) return { created: 0 };
      const due = duePlans(plans, rows(), now());
      if (!due.length) return { created: 0 };
      const added = due.map(({ plan, month, date }) => ({
        ...manualRows({ kind: plan.direction, amount: plan.amount, date, stream: plan.stream, category: plan.category || '-', description: plan.name, details: 'Rutin' }, { owner: owner(), nowIso: nowIso() })[0],
        category: plan.category || '', ref_no: `plan:${plan.id}:${month}`, source: 'plan', status: plan.auto && plan.category ? 'approved' : 'pending',
      }));
      store.append(TABS.transactions, added);
      const months = new Map(due.map((x) => [String(x.plan.id), x.month]));
      store.replace(TABS.plans, plans.map((p) => (months.has(String(p.id)) ? { ...p, last: months.get(String(p.id)) } : p)));
      return { created: added.length };
    },

    /** What you own and owe beyond the accounts. A ticker's market price is fetched by the script (gas/prices.js). */
    saveAssets({ assets }) {
      const before = new Map(store.read(TABS.assets).map((a) => [String(a.id), a]));
      const list = (assets || []).map((a) => ({
        id: a.id || newId('a'), name: String(a.name || '').trim(), kind: a.kind, qty: a.qty === '' || a.qty == null ? 1 : Number(a.qty),
        unit_value: Number(a.unit_value) || 0, ticker: String(a.ticker || '').trim().toUpperCase(), paid: Number(a.paid) || '', notes: String(a.notes || '').trim(),
      }));
      const problems = assetProblems(list);
      if (problems.length) throw new Error(problems.join('; '));
      // A price already fetched stays while the ticker is the same; a new ticker is fetched after saving.
      store.replace(TABS.assets, list.map((a) => {
        const old = before.get(String(a.id));
        const keep = old && ((a.ticker && String(old.ticker || '').toUpperCase() === a.ticker) || (a.kind === 'gold' && !a.ticker && old.kind === 'gold' && !old.ticker));
        return { ...a, price: keep ? old.price : '', price_at: keep ? old.price_at : '' };
      }));
      return { ok: true, fetch: list.some((a) => a.ticker || a.kind === 'gold') };
    },

    /** "Keep" or "stop" on a subscription ('' clears it). */
    markRecurring({ name, mark }) {
      const key = payee(name);
      if (!key) throw new Error('nothing to mark');
      if (!['keep', 'stop', ''].includes(mark)) throw new Error('mark must be keep or stop');
      const marks = json('recurring_marks');
      if (mark) marks[key] = mark; else delete marks[key];
      store.setConfig('recurring_marks', JSON.stringify(marks));
      return { ok: true };
    },

    /** One category (or "ignore") for several rows at once. */
    updateMany({ ids, category, status }) {
      const list = Array.isArray(ids) ? ids.map(String) : [];
      if (!list.length) throw new Error('choose at least one transaction');
      if (category && !allCategories().has(category)) throw new Error(`unknown category ${category}`);
      if (status && !['approved', 'pending', 'ignored'].includes(status)) throw new Error('unknown status');
      if (!category && !status) throw new Error('nothing to change');
      const byId = new Map(rows().map((r) => [String(r.id), r]));
      const missing = list.filter((id) => !byId.has(id));
      if (missing.length) throw new Error(`transaction ${missing[0]} not found`);
      store.update(TABS.transactions, list.map((id) => ({ id, changes: touch({ ...(category ? { category, status: status || 'approved' } : { status }) }) })));
      return { ok: true, changed: list.length };
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
          bill_email: onOff('bill_email'), close_email: String(store.config('close_email') || 'off') === 'on' ? 'on' : 'off',
          calendar_sync: String(store.config('calendar_sync') || 'off') === 'on' ? 'on' : 'off', calendar_status: String(store.config('calendar_status') || ''),
          summary_period: byPayday() ? 'payday' : 'month', salary_stream: salaryStream(), salary_amount: Number(store.config('salary_amount')) || '',
          big_amount: bigAmount(),
        },
        balances: streamBalances(rows(), accounts(), { year: year(), asOf: isoDate(now()) }), lastChecks: lastChecks(rows()),
        imports: importHistory(), salaryStream: salaryStream(), plans: store.read(TABS.plans), assets: store.read(TABS.assets), assetKinds: ASSET_KINDS, cards: list('cards'),
        yearly: { found: list('yearly_subs').length, at: String(store.config('yearly_scan') || '') },
        household: {
          me: owner(), isOwner: env.isOwner !== false, ownerName: String(store.config('owner_name') || ''),
          partner: { emails: String(store.config('partner_email') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean), email: String(store.config('partner_email') || ''), name: String(store.config('partner_name') || ''), bankNames: String(store.config('partner_bank_names') || '') },
          myGmailConnected: !env.myEmail || store.read(TABS.connections).some((c) => String(c.gmail).toLowerCase() === env.myEmail),
        },
        push: env.push && env.push.site ? {
          site: env.push.site, events: pushEventsOf(store.config('push_events')), link: `${env.push.site}/notifikasi?n=${pushCode()}`,
          devices: list('push_devices').map((d) => ({ label: d.label || '', at: d.at || '' })),
        } : null,
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
      // The partner: only the owner sets who it is (it decides who can open the spreadsheet).
      if (['partner_email', 'partner_name', 'partner_bank_names'].some((k) => k in values)) {
        if (env.isOwner === false) throw new Error('only the owner can change the partner');
        // One partner may use several Google accounts: a comma-separated list.
        const emails = String(values.partner_email ?? store.config('partner_email') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
        const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        if (bad) throw new Error(`partner email: "${bad}" is not an email address`);
        const email = [...new Set(emails)].join(', ');
        const name = String(values.partner_name ?? store.config('partner_name') ?? '').trim();
        if (email && !name) throw new Error('partner name: required');
        if (name && name === String(store.config('owner_name') || '')) throw new Error('partner name: must differ from yours');
        store.setConfig('partner_email', email);
        store.setConfig('partner_name', name);
        if ('partner_bank_names' in values) store.setConfig('partner_bank_names', String(values.partner_bank_names || '').trim());
        if (email && env.share) env.share();
      }
      for (const key of ['weekly_email', 'monthly_email', 'payday_email', 'bill_email', 'close_email', 'calendar_sync']) if (key in values) store.setConfig(key, values[key] === 'off' ? 'off' : 'on');
      // Switching the calendar on fills it straight away (gas/calendar.js); its result is shown in Settings.
      if (values.calendar_sync === 'on' && env.syncCalendar) {
        try { return { ok: true, calendar: env.syncCalendar() }; } catch (e) { return { ok: true, calendar: { error: e.message } }; }
      }
      if ('summary_period' in values) store.setConfig('summary_period', values.summary_period === 'payday' ? 'payday' : 'month');
      if ('push_events' in values) {
        const ev = (Array.isArray(values.push_events) ? values.push_events : String(values.push_events || '').split(',')).filter((x) => PUSH_EVENTS.includes(x));
        store.setConfig('push_events', ev.length ? ev.join(',') : 'none');
      }
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
  'yearly', 'importStatement', 'undoImport', 'updateMany', 'tagih', 'owedSet', 'owedRemove', 'savePlans', 'saveAssets', 'markRecurring',
  'setTagBudget', 'closeDay', 'reopenDay', 'spt', 'saveCards', 'scanYearly', 'pushTest', 'pushForget', 'connectMe',
];
