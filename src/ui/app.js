// Cashflow Tracker web app (runs in the browser inside Apps Script's HtmlService).
// Talks to the server through google.script.run.api(name, payloadJson) -> JSON string.
/* global google */
import { STRINGS, pickLanguage } from './i18n.js';

const state = { boot: null, tab: 'review', month: '', filters: { status: '' }, limit: 50, addKind: 'out', busy: false, rowsById: new Map() };
const remember = (rows) => rows.forEach((r) => state.rowsById.set(String(r.id), r));
let T = STRINGS.id;

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = new Intl.NumberFormat('id-ID');
const rp = (n) => `${Number(n) < 0 ? '−' : ''}Rp${fmt.format(Math.abs(Math.round(Number(n) || 0)))}`;
const short = (n) => {
  const a = Math.abs(Number(n) || 0);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)} M` : a >= 1e6 ? `${(a / 1e6).toFixed(1)} jt` : a >= 1e3 ? `${Math.round(a / 1e3)} rb` : String(Math.round(a));
  return `${Number(n) < 0 ? '−' : ''}${s.replace('.', ',')}`;
};
const monthAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(state.boot?.lang === 'en' ? 'en-GB' : 'id-ID', { month: 'long', year: 'numeric' }); };
const dateLabel = (d, t) => `${d ? new Date(`${d}T00:00:00`).toLocaleDateString(state.boot?.lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short' }) : ''}${t ? ` ${String(t).slice(0, 5)}` : ''}`;

export function call(name, payload = {}) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((text) => {
        const r = JSON.parse(text);
        if (r.error) reject(new Error(r.error)); else resolve(r.data);
      })
      .withFailureHandler((e) => reject(e instanceof Error ? e : new Error(String(e && e.message ? e.message : e))))
      .api(name, JSON.stringify(payload));
  });
}

function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; }, 3500);
}

function categoryOptions(selected, direction) {
  const c = state.boot.categories;
  const groups = direction === 'in'
    ? [[T.income, c.income], [T.expense, c.expense], ['', c.fixed]]
    : [[T.expense, c.expense], [T.income, c.income], ['', c.fixed]];
  return `<option value="">${esc(T.chooseCategory)}</option>${groups.map(([label, list]) => `<optgroup label="${esc(label || '—')}">${
    list.map((x) => `<option ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}`;
}
const accountOptions = (selected, allowEmpty = true) => `${allowEmpty ? `<option value="">${esc(T.chooseAccount)}</option>` : ''}${
  state.boot.accounts.map((a) => `<option ${a.stream === selected ? 'selected' : ''}>${esc(a.stream)}</option>`).join('')}`;

function setView(html) { $('#view').innerHTML = html; }
function loading() { setView(`<div class="empty">${esc(T.loading)}</div>`); }
function failed(e) { setView(`<div class="empty error">${esc(T.error)}: ${esc(e.message)}<br><button class="btn" data-action="reload">${esc(T.retry)}</button></div>`); }

function syncLine() {
  const c = (state.boot.connections || [])[0];
  if (!c || !c.last_sync) return esc(T.neverSynced);
  return `${esc(T.lastSync)} ${esc(new Date(c.last_sync).toLocaleString(state.boot.lang === 'en' ? 'en-GB' : 'id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}${c.last_status && /ERROR/.test(c.last_status) ? ' · ⚠️' : ''}`;
}

// ---------------------------------------------------------------- Review
async function viewReview(preloaded) {
  if (!preloaded) loading();
  const r = preloaded || await call('review');
  remember([...r.pending, ...r.recentAuto]);
  const pending = r.pending.map((x) => `
    <div class="card" data-id="${esc(x.id)}">
      <div class="row"><span class="merchant">${esc(x.description || x.details || '—')}</span><span class="amt ${x.direction}">${x.direction === 'in' ? '+' : '−'}${rp(x.amount)}</span></div>
      <div class="meta">${x.stream ? esc(x.stream) : `<select data-field="stream">${accountOptions('')}</select>`} · ${esc(dateLabel(x.date, x.time))}${x.details ? ` · ${esc(x.details)}` : ''}</div>
      <select class="full" data-field="category">${categoryOptions(x.category, x.direction)}</select>
      <div class="actions">
        <button class="btn ok" data-action="approve">✓ ${esc(T.save)}</button>
        <button class="btn ghost" data-action="ignore">${esc(T.ignore)}</button>
        ${x.description ? `<label class="check"><input type="checkbox" data-field="always" checked> ${esc(T.alwaysMerchant)}</label>` : ''}
      </div>
    </div>`).join('');
  const errors = r.errors.map((x) => `
    <div class="card unparsed">
      <div class="row"><span class="merchant">${esc(x.subject || x.from)}</span><span class="badge warn">${esc(T.unreadTitle)}</span></div>
      <div class="meta">${esc(x.reason)}</div>
      <div class="actions"><a class="btn ghost" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(x.gmail_id)}">${esc(T.openGmail)} ↗</a>
      <button class="btn ok" data-action="go" data-tab="add">${esc(T.enterManually)}</button></div>
    </div>`).join('');
  const recent = r.recentAuto.slice(0, 30).map((x) => `
    <div class="line" data-action="edit" data-id="${esc(x.id)}"><span>${esc(x.description)}<small>${esc(x.category)} · ${esc(x.stream)} · ${esc(dateLabel(x.date, x.time))}</small></span><span class="amt ${x.direction}">${rp(x.amount)}</span></div>`).join('');
  setView(`
    <header class="top"><h2>${esc(T.reviewTitle)} <span class="badge warn">${r.pending.length}</span></h2>
      <div class="sub">${syncLine()} · <button class="link" data-action="sync">${esc(T.syncNow)}</button></div></header>
    <div class="body">
      ${pending || `<div class="empty">${esc(T.reviewEmpty)}</div>`}
      ${errors ? `<h3>${esc(T.unreadTitle)}</h3>${errors}` : ''}
      ${recent ? `<h3>${esc(T.recentTitle)}</h3><p class="hint">${esc(T.recentHint)}</p><div class="card list">${recent}</div>` : ''}
    </div>`);
}

// ---------------------------------------------------------------- Dashboard
async function viewDashboard(preloaded) {
  if (!preloaded) loading();
  const d = preloaded || await call('dashboard', { month: state.month });
  state.month = d.month;
  const s = d.summary;
  const budgets = d.budgets.map((b) => `<div><div class="row"><span>${esc(b.category)}</span><span class="meta">${rp(b.spent)} / ${rp(b.budget)}</span></div>
    <div class="bar"><i class="${b.ratio > 1 ? 'over' : ''}" style="width:${Math.min(100, Math.round(b.ratio * 100))}%"></i></div></div>`).join('');
  const cats = s.byCategory.map((c) => `<div class="row"><span>${esc(c.category)}</span><span class="amt ${c.kind === 'income' ? 'in' : 'out'}">${rp(c.amount)}</span></div>`).join('');
  const group = (type) => d.balances.filter((b) => b.type === type).map((b) => `<div class="row"><span>${esc(b.stream)}</span><span>${rp(b.balance)}</span></div>`).join('');
  setView(`
    <header class="top"><div class="monthnav"><button class="btn ghost" data-action="month" data-k="-1">‹</button><h2>${esc(monthLabel(d.month))}</h2><button class="btn ghost" data-action="month" data-k="1">›</button></div></header>
    <div class="body">
      <div class="kpis">
        <div class="card kpi"><div class="k">${esc(T.income)}</div><div class="v in">${short(s.income)}</div></div>
        <div class="card kpi"><div class="k">${esc(T.expense)}</div><div class="v out">${short(s.expense)}</div></div>
        <div class="card kpi"><div class="k">${esc(T.balance)}</div><div class="v ${s.balance < 0 ? 'out' : ''}">${short(s.balance)}</div></div>
      </div>
      <div class="card"><div class="row"><span class="merchant">${esc(T.perDay)}</span><span class="merchant">${rp(d.perDay.perDay)}</span></div>
        <div class="meta">${esc(T.daysToPayday(d.perDay.daysLeft, dateLabel(d.perDay.nextPayday)))}</div></div>
      ${d.pendingCount ? `<div class="card warnbox" data-action="go" data-tab="review">${esc(T.pendingNote(d.pendingCount))} ›</div>` : ''}
      <div class="card"><div class="merchant">${esc(T.budgets)}</div><div class="list">${budgets || `<p class="hint">${esc(T.noBudgets)}</p>`}</div></div>
      <div class="card"><div class="merchant">${esc(T.byCategory)}</div><div class="list">${cats || `<p class="hint">—</p>`}</div></div>
      <div class="card"><div class="merchant">${esc(T.accounts)}</div>
        <h4>${esc(T.spending)}</h4><div class="list">${group('Spending')}</div>
        <h4>${esc(T.saving)}</h4><div class="list">${group('Saving')}</div></div>
    </div>`);
}

// ---------------------------------------------------------------- Transactions
async function viewTransactions() {
  loading();
  const f = state.filters;
  const r = await call('list', { ...f, month: f.month ?? state.month, limit: state.limit });
  remember(r.rows);
  const c = state.boot.categories;
  const items = r.rows.map((x) => `
    <div class="line" data-action="edit" data-id="${esc(x.id)}">
      <span>${esc(x.description || '—')}<small>${esc(dateLabel(x.date, x.time))} · ${esc(x.category || '?')} · ${esc(x.stream || '?')}${x.status !== 'approved' ? ` · <b class="pill ${esc(x.status)}">${esc(T[`status${x.status[0].toUpperCase()}${x.status.slice(1)}`] || x.status)}</b>` : ''}</small></span>
      <span class="amt ${x.direction}">${x.direction === 'in' ? '+' : '−'}${rp(x.amount)}</span>
    </div>`).join('');
  setView(`
    <header class="top"><h2>${esc(T.tabTransactions)}</h2>
      <div class="filters">
        <input type="search" data-filter="q" placeholder="${esc(T.search)}" value="${esc(f.q || '')}">
        <input type="month" data-filter="month" value="${esc(f.month ?? state.month)}">
        <select data-filter="stream"><option value="">${esc(T.allAccounts)}</option>${state.boot.accounts.map((a) => `<option ${a.stream === f.stream ? 'selected' : ''}>${esc(a.stream)}</option>`).join('')}</select>
        <select data-filter="category"><option value="">${esc(T.allCategories)}</option>${[...c.income, ...c.expense, ...c.fixed].map((x) => `<option ${x === f.category ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select data-filter="status"><option value="">${esc(T.allStatus)}</option>${['approved', 'pending', 'ignored'].map((x) => `<option value="${x}" ${x === f.status ? 'selected' : ''}>${esc(T[`status${x[0].toUpperCase()}${x.slice(1)}`])}</option>`).join('')}</select>
      </div></header>
    <div class="body"><div class="card list">${items || `<div class="empty">${esc(T.noTransactions)}</div>`}</div>
      <p class="hint">${esc(T.showing(r.rows.length, r.total))}</p>
      ${r.total > r.rows.length ? `<button class="btn ghost full" data-action="more">${esc(T.more)}</button>` : ''}</div>`);
}

async function openEditor(id) {
  // Rows already on screen are reused; only an unknown id asks the server.
  let x = state.rowsById.get(String(id));
  if (!x) {
    const r = await call('list', { q: '', limit: 100000 });
    x = r.rows.find((row) => String(row.id) === String(id));
  }
  if (!x) return;
  $('#modal').innerHTML = `
    <form class="sheet" data-form="edit" data-id="${esc(x.id)}">
      <h3>${esc(T.edit)}</h3>
      <label>${esc(T.description)}<input name="description" value="${esc(x.description)}"></label>
      <label>${esc(T.amount)}<input name="amount" type="number" inputmode="decimal" step="any" value="${esc(x.amount)}"></label>
      <label>${esc(T.direction)}<select name="direction"><option value="out" ${x.direction === 'out' ? 'selected' : ''}>${esc(T.kindOut)}</option><option value="in" ${x.direction === 'in' ? 'selected' : ''}>${esc(T.kindIn)}</option></select></label>
      <label>${esc(T.category)}<select name="category">${categoryOptions(x.category, x.direction)}</select></label>
      <label>${esc(T.account)}<select name="stream">${accountOptions(x.stream)}</select></label>
      <label>${esc(T.date)}<input name="date" type="date" value="${esc(x.date)}"></label>
      <label>${esc(T.details)}<input name="details" value="${esc(x.details)}"></label>
      <label>${esc(T.status)}<select name="status">${['approved', 'pending', 'ignored'].map((s) => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${esc(T[`status${s[0].toUpperCase()}${s.slice(1)}`])}</option>`).join('')}</select></label>
      ${x.gmail_id ? `<a class="hint" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(x.gmail_id)}">${esc(T.openGmail)} ↗</a>` : ''}
      <div class="actions"><button class="btn ok" type="submit">${esc(T.save)}</button><button class="btn ghost" type="button" data-action="close">${esc(T.close)}</button>
      <button class="btn danger" type="button" data-action="delete" data-id="${esc(x.id)}">${esc(T.delete)}</button></div>
    </form>`;
  $('#modal').classList.add('open');
}

// ---------------------------------------------------------------- Add
function viewAdd() {
  const k = state.addKind;
  const today = state.boot.today;
  const kinds = [['out', T.kindOut], ['in', T.kindIn], ['transfer', T.kindTransfer], ['adjust', T.kindAdjust]];
  setView(`
    <header class="top"><h2>${esc(T.tabAdd)}</h2>
      <div class="seg">${kinds.map(([v, l]) => `<button class="${v === k ? 'on' : ''}" data-action="kind" data-kind="${v}">${esc(l)}</button>`).join('')}</div></header>
    <form class="body" data-form="add">
      <input class="big ${k === 'in' ? 'in' : 'out'}" name="amount" type="number" inputmode="decimal" step="any" placeholder="0" required>
      ${k === 'adjust' ? `<p class="hint">${esc(T.adjustHint)}</p>` : ''}
      <div class="card">
        ${k === 'out' || k === 'in' ? `<label>${esc(T.category)}<select name="category" required>${categoryOptions('', k)}</select></label>` : ''}
        <label>${esc(k === 'transfer' ? `${T.account} (${T.kindOut.toLowerCase()})` : T.account)}<select name="stream" required>${accountOptions(k === 'out' ? 'Cash' : '')}</select></label>
        ${k === 'transfer' ? `<label>${esc(T.toAccount)}<select name="toStream" required>${accountOptions('')}</select></label>` : ''}
        <label>${esc(T.date)}<input name="date" type="date" value="${esc(today)}" required></label>
        <label>${esc(T.description)}<input name="description" placeholder="${esc(T.optional)}"></label>
        <label>${esc(T.details)}<input name="details" placeholder="${esc(T.optional)}"></label>
      </div>
      <button class="btn ok full" type="submit">${esc(T.save)}</button>
    </form>`);
}

// ---------------------------------------------------------------- Settings
async function viewSettings(local) {
  // `local`: re-render from unsaved local data (e.g. after "add account") without a server round trip.
  if (!local) loading();
  const s = local || await call('settings');
  const cfg = s.config;
  const acc = s.accounts.map((a, i) => `
    <div class="acct" data-i="${i}">
      <input data-a="stream" value="${esc(a.stream)}" aria-label="stream">
      <select data-a="type"><option ${a.type === 'Spending' ? 'selected' : ''}>Spending</option><option ${a.type === 'Saving' ? 'selected' : ''}>Saving</option></select>
      <input data-a="institution" value="${esc(a.institution)}" placeholder="bank">
      <input data-a="match_hint" value="${esc(a.match_hint)}" placeholder="${esc(T.hints)}">
      <input data-a="opening_balance" type="number" inputmode="decimal" step="any" value="${esc(a.opening_balance)}" title="${esc(T.openingBalance)}">
    </div>`).join('');
  const rules = s.rules.map((r, i) => `
    <div class="rule" data-i="${i}"><code>${esc(r.pattern)}</code> → ${esc(r.category)}
      <label class="check"><input type="checkbox" data-r="auto_approve" ${r.auto_approve === true || r.auto_approve === 'TRUE' ? 'checked' : ''}> ${esc(T.autoApprove)}</label>
      <span class="meta">${esc(T.hits(Number(r.hits) || 0))}</span> <button class="link" type="button" data-action="delrule" data-i="${i}">✕</button></div>`).join('');
  const budgets = s.categories.expense.map((c) => {
    const b = s.budgets.find((x) => x.category === c);
    return `<label class="inline">${esc(c)}<input data-b="${esc(c)}" type="number" inputmode="decimal" step="any" value="${esc(b ? b.monthly_budget : '')}" placeholder="0"></label>`;
  }).join('');
  const conns = (s.connections || []).map((c) => `<div><b>${esc(c.gmail)}</b><div class="meta">${esc(c.last_status || T.neverSynced)}</div></div>`).join('');
  state.settings = s;
  setView(`
    <header class="top"><h2>${esc(T.tabSettings)}</h2></header>
    <div class="body">
      <div class="card"><div class="merchant">${esc(T.settingsSync)}</div>${conns}<button class="btn ok" data-action="sync">${esc(T.syncNow)}</button></div>
      <form class="card" data-form="config">
        <label>${esc(T.language)}<select name="language"><option value="" ${!cfg.language ? 'selected' : ''}>auto</option><option value="id" ${cfg.language === 'id' ? 'selected' : ''}>Bahasa Indonesia</option><option value="en" ${cfg.language === 'en' ? 'selected' : ''}>English</option></select></label>
        <label>${esc(T.payday)}<input name="payday_day" type="number" min="1" max="31" value="${esc(cfg.payday_day)}"></label>
        <label>${esc(T.ownerNames)}<input name="owner_bank_names" value="${esc(cfg.owner_bank_names)}"></label>
        <button class="btn ok" type="submit">${esc(T.save)}</button></form>
      <form class="card" data-form="monthend"><div class="merchant">${esc(T.monthEnd)}</div>
        <label>${esc(T.account)}<select name="stream" required>${accountOptions('')}</select></label>
        <label>${esc(T.actualBalance)}<input name="actual" type="number" inputmode="decimal" step="any" required></label>
        <label>${esc(T.date)}<input name="date" type="date" value="${esc(state.boot.today)}"></label>
        <button class="btn ok" type="submit">${esc(T.check)}</button></form>
      <form class="card" data-form="accounts"><div class="merchant">${esc(T.accountsTitle)}</div>
        <p class="hint">stream · type · bank · ${esc(T.hints)} · ${esc(T.openingBalance)}</p>${acc}
        <div class="actions"><button class="btn ghost" type="button" data-action="addacct">+ ${esc(T.addAccount)}</button><button class="btn ok" type="submit">${esc(T.save)}</button></div></form>
      <form class="card" data-form="categories"><div class="merchant">${esc(T.categoriesTitle)}</div>
        <label>${esc(T.incomeCats)}<textarea name="income" rows="6">${esc(s.categories.income.join('\n'))}</textarea></label>
        <label>${esc(T.expenseCats)}<textarea name="expense" rows="12">${esc(s.categories.expense.join('\n'))}</textarea></label>
        <button class="btn ok" type="submit">${esc(T.save)}</button></form>
      <form class="card" data-form="budgets"><div class="merchant">${esc(T.budgetsTitle)}</div>${budgets}<button class="btn ok" type="submit">${esc(T.save)}</button></form>
      <form class="card" data-form="rules"><div class="merchant">${esc(T.rulesTitle)}</div>${rules || `<p class="hint">${esc(T.noRules)}</p>`}<button class="btn ok" type="submit">${esc(T.save)}</button></form>
      <div class="card"><a class="btn ghost" target="_blank" rel="noopener" href="${esc(state.boot.sheetUrl || '#')}">${esc(T.openSheet)} ↗</a>
        <p class="hint">${esc(T.selftest)}: ${esc(s.selftest || '—')}</p></div>
    </div>`);
}

// ---------------------------------------------------------------- shell
const VIEWS = { review: viewReview, dashboard: viewDashboard, transactions: viewTransactions, add: viewAdd, settings: viewSettings };

async function show(tab, preloaded) {
  state.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  try { await VIEWS[tab](preloaded); } catch (e) { failed(e); }
}

// The last startup data is kept on the phone so the app can paint instantly next time,
// then it is replaced by fresh data from the server.
const CACHE_KEY = 'cashflow.init.v1';
const TIMING_KEY = 'cashflow.lastLoad.v1';
function readCache() {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function writeCache(data) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}
function setStale(on) {
  const el = $('#stale');
  if (el) el.className = on ? 'stale show' : 'stale';
}

/** Render startup data. First paint picks the tab; later paints refresh the tab still showing. */
async function paint(data, { first }) {
  state.boot = { ...data.boot, lang: state.boot?.lang };
  applyLanguage(state.boot.language);
  if (!state.month || state.month === data.dashboard.month) state.month = data.boot.today.slice(0, 7);
  const tab = first ? (data.boot.pendingCount ? 'review' : 'dashboard') : state.tab;
  if (first || !state.userMoved) {
    if (tab === 'review') await show('review', data.review);
    else if (tab === 'dashboard' && state.month === data.dashboard.month) await show('dashboard', data.dashboard);
  }
}

async function run(label, fn, after) {
  if (state.busy) return;
  state.busy = true;
  toast(label || T.saving, 'busy');
  try {
    const res = await fn();
    if (after) await after(res);
  } catch (e) {
    toast(`${T.error}: ${e.message}`, 'bad');
  } finally {
    state.busy = false;
  }
}

async function refreshBoot() { state.boot = { ...(await call('bootstrap')), lang: state.boot?.lang }; }

function onClick(e) {
  const el = e.target.closest('[data-action],[data-tab]');
  if (!el) return;
  const a = el.dataset.action;
  const card = el.closest('[data-id]');
  if (!a && el.dataset.tab) { state.userMoved = true; return show(el.dataset.tab); }
  if (a === 'go') { state.userMoved = true; return show(el.dataset.tab); }
  if (a === 'reload') return show(state.tab);
  if (a === 'month') { state.month = monthAdd(state.month, Number(el.dataset.k)); return show('dashboard'); }
  if (a === 'kind') { state.addKind = el.dataset.kind; return viewAdd(); }
  if (a === 'more') { state.limit += 50; return show('transactions'); }
  if (a === 'edit') return openEditor(el.dataset.id);
  if (a === 'close') { $('#modal').classList.remove('open'); return null; }
  if (a === 'sync') return run(T.syncing, () => call('syncNow'), async (s) => { toast(`+${s.added ?? 0}`); await refreshBoot(); await show(state.tab); });
  if (a === 'approve') {
    const category = $('[data-field=category]', card).value;
    const streamSel = $('[data-field=stream]', card);
    if (!category) return toast(T.errNoCategory, 'bad');
    if (streamSel && !streamSel.value) return toast(T.errNoAccount, 'bad');
    const always = $('[data-field=always]', card)?.checked || false;
    return run(T.saving, () => call('approve', { id: card.dataset.id, category, stream: streamSel ? streamSel.value : '', always }), async (r) => {
      toast(r.alsoApproved ? T.alsoApproved(r.alsoApproved) : T.saved);
      await show('review');
    });
  }
  if (a === 'ignore') return run(T.saving, () => call('ignore', { id: card.dataset.id }), () => show('review'));
  if (a === 'delete') {
    if (!window.confirm(T.confirmDelete)) return null;
    return run(T.saving, () => call('remove', { id: el.dataset.id }), async (r) => {
      $('#modal').classList.remove('open');
      toast(r.ignoredInstead ? T.ignoredInstead : T.deleted);
      await show(state.tab);
    });
  }
  if (a === 'delrule') { state.settings.rules.splice(Number(el.dataset.i), 1); el.closest('.rule').remove(); return null; }
  if (a === 'addacct') {
    const form = el.closest('form');
    state.settings.accounts = [...form.querySelectorAll('.acct')].map((row) => Object.fromEntries([...row.querySelectorAll('[data-a]')].map((i) => [i.dataset.a, i.value])));
    state.settings.accounts.push({ stream: '', type: 'Spending', institution: '', match_hint: '', opening_balance: 0 });
    return viewSettings(state.settings);
  }
  return null;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  const d = formData(form);
  if (kind === 'add') {
    return run(T.saving, () => call('add', { kind: state.addKind, ...d, amount: Number(d.amount) }), async () => { toast(T.added); viewAdd(); });
  }
  if (kind === 'edit') {
    return run(T.saving, () => call('update', { id: form.dataset.id, fields: { ...d, amount: Number(d.amount) } }), async () => {
      $('#modal').classList.remove('open');
      toast(T.saved);
      await show(state.tab);
    });
  }
  if (kind === 'config') {
    return run(T.saving, () => call('saveConfig', d), async () => {
      if (d.language !== undefined) applyLanguage(d.language);
      await refreshBoot();
      toast(T.saved);
      await show('settings');
    });
  }
  if (kind === 'monthend') {
    return run(T.saving, () => call('balanceCheck', { stream: d.stream, actual: Number(d.actual), date: d.date }), (r) => toast(r.adjusted ? T.adjusted(rp(r.adjusted)) : T.matched));
  }
  if (kind === 'accounts') {
    const list = [...form.querySelectorAll('.acct')].map((row) => Object.fromEntries([...row.querySelectorAll('[data-a]')].map((i) => [i.dataset.a, i.value])))
      .filter((a) => a.stream.trim());
    return run(T.saving, () => call('saveAccounts', { accounts: list }), async () => { await refreshBoot(); toast(T.saved); });
  }
  if (kind === 'categories') {
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
    return run(T.saving, () => call('saveCategories', { income: lines(d.income), expense: lines(d.expense) }), async () => { await refreshBoot(); toast(T.saved); });
  }
  if (kind === 'budgets') {
    const budgets = [...form.querySelectorAll('[data-b]')].map((i) => ({ category: i.dataset.b, monthly_budget: Number(i.value) || 0 }));
    return run(T.saving, () => call('saveBudgets', { budgets }), () => toast(T.saved));
  }
  if (kind === 'rules') {
    const rules = state.settings.rules.map((r, i) => {
      const box = form.querySelector(`.rule[data-i="${i}"] [data-r=auto_approve]`);
      return { ...r, auto_approve: box ? box.checked : r.auto_approve };
    });
    return run(T.saving, () => call('saveRules', { rules }), () => toast(T.saved));
  }
  return null;
}

function onChange(e) {
  const f = e.target.closest('[data-filter]');
  if (!f) return;
  state.filters[f.dataset.filter] = f.value;
  state.limit = 50;
  show('transactions');
}

function applyLanguage(configured) {
  const lang = pickLanguage(configured, navigator.language);
  T = STRINGS[lang];
  if (state.boot) state.boot.lang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
}

export async function start() {
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  let searchTimer;
  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-filter=q]')) { clearTimeout(searchTimer); searchTimer = setTimeout(() => onChange(e), 400); }
  });
  // Startup timing (ms since this page began loading), sent with the next startup.
  const t0 = (window.performance && performance.timing && performance.timing.navigationStart) || Date.now();
  const timing = { client_from_cache: false };
  const cached = readCache();
  if (cached) {
    await paint(cached, { first: true });
    setStale(true);
    timing.client_from_cache = true;
    timing.client_cached_ms = Date.now() - t0;
  }
  try {
    let lastLoad = null;
    try { lastLoad = JSON.parse(window.localStorage.getItem(TIMING_KEY) || 'null'); } catch (e) { /* none */ }
    const fresh = await call('init', { lastLoad });
    writeCache(fresh);
    await paint(fresh, { first: !cached });
    timing.client_total_ms = Date.now() - t0;
    try { window.localStorage.setItem(TIMING_KEY, JSON.stringify(timing)); } catch (e) { /* storage unavailable */ }
  } catch (e) {
    if (!cached) failed(e); else toast(`${T.error}: ${e.message}`, 'bad');
  } finally {
    setStale(false);
  }
}

if (typeof window !== 'undefined' && !window.__CT_NO_AUTOSTART__) window.addEventListener('DOMContentLoaded', start);
