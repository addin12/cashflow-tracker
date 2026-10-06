// Cashflow Tracker web app (runs in the browser inside Apps Script's HtmlService).
// Talks to the server through google.script.run.api(name, payloadJson) -> JSON string.
//
// Saving is optimistic: the screen changes at once, the change goes into a queue that sends it
// to Google in order (retrying while a sync holds the lock), and a quiet refresh follows when the
// queue is empty. If Google refuses a change, it is put back on screen with the reason.
/* global google */
import { STRINGS, pickLanguage } from './i18n.js';
import { filterTransactions, ruleFromApproval, pendingMatching, renamedCategories } from '../core/app.js';
import { buildCategorySlots } from '../core/categories.js';
import { compileRule } from '../core/rules.js';

const state = {
  boot: null, tab: 'review', month: '', review: null, dashByMonth: {}, all: null, allStale: true,
  filters: { q: '', month: null, stream: '', category: '', status: '', direction: '' },
  limit: 50, addKind: 'out', settings: null, rowsById: new Map(),
};
let T = STRINGS.id;

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const locale = () => (state.boot?.lang === 'en' ? 'en-GB' : 'id-ID');
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }); // whole rupiah on screen; the sheet keeps cents
const rp = (n) => `${Number(n) < 0 ? '−' : ''}Rp${fmt.format(Math.abs(Number(n) || 0))}`;
const signed = (x) => `${x.direction === 'in' ? '+' : '−'}${rp(x.amount)}`;
const monthAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthDate = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1); };
const monthLabel = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
const monthShort = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'short' });
const thisYear = () => String(state.boot?.today || '').slice(0, 4);
function dateLabel(d, { weekday = true } = {}) {
  if (!d) return '';
  const opts = { day: 'numeric', month: 'short', ...(weekday ? { weekday: 'short' } : {}), ...(String(d).slice(0, 4) !== thisYear() ? { year: 'numeric' } : {}) };
  return new Date(`${d}T00:00:00`).toLocaleDateString(locale(), opts);
}
const timeLabel = (t) => (t ? String(t).slice(0, 5).replace(':', state.boot?.lang === 'en' ? ':' : '.') : '');
const when = (x) => [dateLabel(x.date), timeLabel(x.time)].filter(Boolean).join(' · ');

// Notion-style tags: a category always gets the same calm tint.
function tag(name) {
  if (!name) return `<span class="tag none">${esc(T.noCategory)}</span>`;
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return `<span class="tag c${h % 8}">${esc(name)}</span>`;
}
const statusBadge = (s) => (s === 'pending' ? `<span class="badge warn">● ${esc(T.statusPending)}</span>`
  : s === 'ignored' ? `<span class="badge neutral">${esc(T.statusIgnored)}</span>` : '');

// ---------------------------------------------------------------- server
export function call(name, payload = {}) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((text) => {
        const r = JSON.parse(text);
        if (r.error) { const e = new Error(r.error); e.retry = !!r.retry; reject(e); } else resolve(r.data);
      })
      .withFailureHandler((e) => reject(e instanceof Error ? e : new Error(String(e && e.message ? e.message : e))))
      .api(name, JSON.stringify(payload));
  });
}

const queue = [];
let draining = false;
let seq = 0; // goes up with every local change, so an older refresh never overwrites it

/** Sends a change to Google in the background. Resolves with the server's answer. */
function save(name, payload) {
  seq += 1;
  return new Promise((resolve, reject) => {
    queue.push({ name, payload, resolve, reject, tries: 0 });
    status();
    drain();
  });
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue[0];
    try {
      const r = await call(job.name, job.payload);
      queue.shift();
      job.resolve(r);
    } catch (e) {
      if (e.retry && job.tries < 12) { job.tries += 1; status('waiting'); await wait(5000); continue; }
      queue.shift();
      job.reject(e);
    }
    status();
  }
  draining = false;
  status('done');
  scheduleRefresh();
}

function status(kind) {
  const el = $('#stale');
  if (!el) return;
  clearTimeout(status.t);
  let text = '';
  if (kind === 'waiting') text = T.waitingSync;
  else if (queue.length) text = T.savingN(queue.length);
  else if (kind === 'loading') text = T.updating;
  else if (kind === 'done') {
    el.innerHTML = `<span class="spin" aria-hidden="true"></span> <b>✓ ${esc(T.allSaved)}</b>`;
    el.className = 'status show done';
    status.t = setTimeout(() => { el.className = 'status'; }, 1600);
    return;
  }
  if (!text) { el.className = 'status'; return; }
  el.innerHTML = `<span class="spin" aria-hidden="true"></span> <b>${esc(text)}</b>`;
  el.className = 'status show';
}

let refreshTimer = null;
let refreshing = false;
function scheduleRefresh(delay = 1200) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, delay);
}

/** Fresh numbers from Google after changes, without disturbing what is on screen. */
async function refresh() {
  if (queue.length || refreshing) return;
  refreshing = true;
  const mine = seq;
  try {
    const fresh = await call('init', { refresh: true });
    if (seq !== mine || queue.length) return; // a newer change is on its way and refreshes again
    writeCache(fresh);
    state.dashByMonth = {};
    absorb(fresh);
    if (state.all) {
      const r = await call('list', { limit: 1000000 });
      if (seq !== mine) return;
      setAll(r.rows);
    }
    repaint();
  } catch (e) {
    // keep what is on screen; the next change or visit tries again
  } finally {
    refreshing = false;
  }
}

// ---------------------------------------------------------------- local data
const remember = (rows) => rows.forEach((r) => state.rowsById.set(String(r.id), r));
function setAll(rows) { state.all = rows; state.allStale = false; remember(rows); }
function absorb(data) {
  state.boot = { ...data.boot, lang: state.boot?.lang };
  applyLanguage(state.boot.language);
  if (!state.month) state.month = data.boot.today.slice(0, 7);
  state.review = data.review;
  remember([...data.review.pending, ...data.review.recentAuto]);
  state.dashByMonth[data.dashboard.month] = data.dashboard;
  updateNav();
}

/** Changes one row everywhere it is shown. */
function patchRow(id, changes) {
  const key = String(id);
  const old = state.rowsById.get(key) || { id };
  const row = { ...old, ...changes };
  state.rowsById.set(key, row);
  if (state.all) state.all = state.all.map((r) => (String(r.id) === key ? row : r));
  if (state.review) {
    const pending = state.review.pending.filter((r) => String(r.id) !== key);
    if (row.status === 'pending') pending.push(row);
    state.review.pending = sortByDate(pending);
    state.review.recentAuto = state.review.recentAuto.map((r) => (String(r.id) === key ? row : r));
  }
  state.dashByMonth = {}; // totals change: fetched again when shown
  return row;
}
const sortByDate = (rows) => rows.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

// ---------------------------------------------------------------- rendering helpers
function setView(html) { $('#view').innerHTML = html; }
const skeleton = (title) => setView(`<header class="page-head"><div><h1>${esc(title)}</h1></div></header>${'<div class="skeleton"></div>'.repeat(4)}`);
function failed(e) {
  setView(`<div class="card empty error"><b>${esc(T.error)}</b>${esc(e.message)}<div class="actions" style="justify-content:center"><button class="btn primary" data-action="reload">${esc(T.retry)}</button></div></div>`);
}

/** Re-render the current screen from local data, keeping half-filled review cards as they are. */
function repaint() {
  if (state.tab === 'review') keepInputs(viewReview);
  else if (state.tab === 'dashboard' && state.dashByMonth[state.month]) viewDashboard();
  else if (state.tab === 'transactions' && state.all) showResults();
}
const cardById = (id) => $$('.txcard[data-id]').find((c) => c.dataset.id === id);
function keepInputs(render) {
  const kept = new Map($$('.txcard[data-id]').map((c) => [c.dataset.id, $$('[data-field]', c).map((i) => [i.dataset.field, i.type === 'checkbox' ? i.checked : i.value])]));
  const focus = document.activeElement && document.activeElement.closest('.txcard') ? [document.activeElement.closest('.txcard').dataset.id, document.activeElement.dataset.field] : null;
  render();
  for (const [id, fields] of kept) {
    const card = cardById(id);
    if (!card) continue;
    for (const [f, v] of fields) { const i = $(`[data-field="${f}"]`, card); if (i) { if (i.type === 'checkbox') i.checked = v; else i.value = v; } }
  }
  if (focus) { const c = cardById(focus[0]); const i = c && $(`[data-field="${focus[1]}"]`, c); if (i) i.focus(); }
}

function categoryOptions(selected, direction) {
  const c = state.boot.categories;
  const groups = direction === 'in'
    ? [[T.income, c.income], [T.expense, c.expense], [T.otherGroup, c.fixed]]
    : [[T.expense, c.expense], [T.income, c.income], [T.otherGroup, c.fixed]];
  return `<option value="">${esc(T.chooseCategory)}</option>${groups.map(([label, list]) => `<optgroup label="${esc(label)}">${
    list.map((x) => `<option ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}`;
}
const accountOptions = (selected, empty = T.chooseAccount) => `${empty ? `<option value="">${esc(empty)}</option>` : ''}${
  state.boot.accounts.map((a) => `<option ${a.stream === selected ? 'selected' : ''}>${esc(a.stream)}</option>`).join('')}`;

/** Shows (or clears) the message under a field. Returns true when there is no problem. */
function fieldMessage(input, msg) {
  const field = input.closest('.field');
  const el = field && $('.msg', field);
  if (el) el.textContent = msg || '';
  if (field) field.classList.toggle('invalid', !!msg);
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  return !msg;
}
const field = (label, control, { help = '', wide = false } = {}) => `<label class="field${wide ? ' wide' : ''}"><span>${esc(label)}</span>${control}${help ? `<small>${esc(help)}</small>` : ''}<em class="msg" role="alert"></em></label>`;

function syncLine() {
  const c = (state.boot.connections || [])[0];
  if (!c || !c.last_sync) return esc(T.neverSynced);
  const at = new Date(c.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const bad = /^ERROR/.test(String(c.last_status || '')); // a failed sync writes "ERROR: …"
  return `${esc(T.lastSync)} ${esc(at)}${bad ? ` <span class="badge bad">⚠ ${esc(T.syncProblem)}</span>` : ''}`;
}

function updateNav() {
  const n = state.review ? state.review.pending.length : 0;
  const count = $('#reviewCount');
  if (count) { count.hidden = !n; count.textContent = String(n); count.setAttribute('aria-label', T.pendingNote(n)); }
  const owner = $('#brandOwner');
  if (owner && state.boot) owner.textContent = state.boot.owner || '';
  const foot = $('#navSync');
  if (foot && state.boot) foot.innerHTML = syncLine();
}

// ---------------------------------------------------------------- Review
function viewReview() {
  const r = state.review;
  if (!r) return skeleton(T.reviewTitle);
  const n = r.pending.length;
  const cards = r.pending.map((x) => `
    <article class="card txcard" data-id="${esc(x.id)}">
      <div class="top"><div class="name">${esc(x.description || x.details || '—')}</div><div class="amt ${esc(x.direction)}">${signed(x)}</div></div>
      <div class="meta">${esc(when(x))} · ${esc(x.stream || T.noAccount)}${x.details && x.description ? ` · ${esc(x.details)}` : ''}</div>
      ${x.stream ? '' : field(T.account, `<select data-field="stream">${accountOptions('')}</select>`)}
      ${field(T.category, `<select data-field="category">${categoryOptions(x.category, x.direction)}</select>`)}
      ${x.description && x.source !== 'summary' ? `<label class="check"><input type="checkbox" data-field="always" checked> ${esc(T.alwaysFor(x.description))}</label>` : ''}
      <div class="actions fill"><button class="btn secondary" data-action="ignore">${esc(T.ignore)}</button><button class="btn primary" data-action="approve">${esc(T.saveToReports)}</button></div>
    </article>`).join('');
  const empty = `<div class="card empty"><div class="big" aria-hidden="true">✓</div><b>${esc(T.reviewEmpty)}</b>${esc(T.reviewEmptySub)}
    <div class="actions" style="justify-content:center"><button class="btn secondary" data-action="go" data-tab="dashboard">${esc(T.seeSummary)}</button></div></div>`;
  const errors = r.errors.map((x) => `
    <div class="rowi"><div class="what"><b>${esc(x.subject || x.from)}</b><div class="meta">${esc(x.reason)}</div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px"><a class="btn secondary small" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(x.gmail_id)}">${esc(T.openGmail)} ↗</a>
      <button class="btn plain small" data-action="go" data-tab="add">${esc(T.enterManually)}</button></div></div></div>`).join('');
  const recent = r.recentAuto.slice(0, 30).map((x) => `
    <button class="rowi" data-action="edit" data-id="${esc(x.id)}"><span class="what"><b>${esc(x.description)}</b><span class="meta">${tag(x.category)} · ${esc(x.stream)} · ${esc(dateLabel(x.date))}</span></span><span class="amt ${esc(x.direction)}">${signed(x)}</span></button>`).join('');
  setView(`
    <header class="page-head"><div><h1>${esc(T.reviewTitle)}</h1><p class="sub">${esc(n ? T.reviewSub(n) : T.reviewSubNone)} · ${syncLine()}</p></div>
      <div class="tools"><button class="btn secondary small" data-action="sync">↻ ${esc(T.syncNow)}</button></div></header>
    <div class="split">
      <section class="stack" aria-label="${esc(T.reviewTitle)}">${cards || empty}</section>
      <aside>
        ${errors ? `<h2 class="section-title">${esc(T.unreadTitle)}<small>${esc(T.unreadHint)}</small></h2><div class="card rows">${errors}</div>` : ''}
        ${recent ? `<h2 class="section-title">${esc(T.recentTitle)}<small>${esc(T.recentHint)}</small></h2><div class="card rows">${recent}</div>` : ''}
      </aside>
    </div>`);
}

let leaveTimer = null;
/** Takes rows off the review list now; their cards slide away, then the list is redrawn. */
function leaveReview(ids) {
  state.review.pending = state.review.pending.filter((r) => !ids.has(String(r.id)));
  updateNav();
  if (state.tab !== 'review') return;
  $$('.txcard[data-id]').forEach((c) => { if (ids.has(c.dataset.id)) c.classList.add('leaving'); });
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (state.tab === 'review') keepInputs(viewReview); }, 180);
}
function backToReview(rows) {
  rows.forEach((r) => patchRow(r.id, { ...r, status: 'pending' }));
  updateNav();
  if (state.tab === 'review') keepInputs(viewReview);
}

function approve(card) {
  const id = card.dataset.id;
  const row = state.review.pending.find((r) => String(r.id) === id);
  if (!row) return;
  const catSel = $('[data-field=category]', card);
  const streamSel = $('[data-field=stream]', card);
  let ok = fieldMessage(catSel, catSel.value ? '' : T.errNoCategory);
  if (streamSel) ok = fieldMessage(streamSel, streamSel.value ? '' : T.errNoAccount) && ok;
  if (!ok) { (catSel.value ? streamSel : catSel).focus(); return; }
  const category = catSel.value;
  const stream = streamSel ? streamSel.value : row.stream;
  const always = !!$('[data-field=always]', card)?.checked;
  // The same other rows the server files with an "always" rule.
  const others = always && row.description
    ? pendingMatching(state.review.pending, ruleFromApproval(row, category, 'new', '', '')).filter((r) => String(r.id) !== id) : [];
  const moved = [{ ...row }, ...others.map((r) => ({ ...r }))];
  const ids = new Set(moved.map((r) => String(r.id)));
  moved.forEach((r) => patchRow(r.id, { category, status: 'approved', ...(String(r.id) === id ? { stream } : {}) }));
  leaveReview(ids);
  toast(others.length ? T.savedWithOthers(others.length) : T.savedToReports, {
    undo: () => { backToReview(moved); moved.forEach((r) => save('restore', { id: r.id }).catch(() => {})); },
  });
  save('approve', { id, category, stream: streamSel ? stream : '', always })
    .then((res) => {
      const extra = (res.alsoIds || []).map(String).filter((x) => !ids.has(x));
      if (extra.length) { extra.forEach((x) => patchRow(x, { category, status: 'approved' })); leaveReview(new Set(extra)); }
    })
    .catch((e) => { backToReview(moved); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}

function ignore(card) {
  const id = card.dataset.id;
  const row = state.review.pending.find((r) => String(r.id) === id);
  if (!row) return;
  patchRow(id, { status: 'ignored' });
  leaveReview(new Set([id]));
  toast(T.ignored, { undo: () => { backToReview([row]); save('restore', { id }).catch(() => {}); } });
  save('ignore', { id }).catch((e) => { backToReview([row]); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}

// ---------------------------------------------------------------- Dashboard
async function viewDashboard() {
  let d = state.dashByMonth[state.month];
  if (!d) {
    skeleton(T.tabDashboard);
    d = await call('dashboard', { month: state.month });
    state.dashByMonth[d.month] = d;
    if (state.tab !== 'dashboard' || d.month !== state.month) return;
  }
  const s = d.summary;
  const current = state.boot.today.slice(0, 7);
  const prev = monthAdd(d.month, -1);
  const next = monthAdd(d.month, 1);
  const budgets = new Map(d.budgets.map((b) => [b.category, b]));
  const spent = s.byCategory.filter((c) => c.kind !== 'income');
  for (const b of d.budgets) if (!spent.some((c) => c.category === b.category)) spent.push({ category: b.category, kind: 'expense', amount: 0 });
  spent.sort((a, b) => b.amount - a.amount);
  const expenseRows = spent.map((c) => {
    const b = budgets.get(c.category);
    const pct = b ? Math.min(100, Math.round(b.ratio * 100)) : 0;
    const over = b && b.ratio > 1;
    return `<button class="rowi" data-action="drill" data-category="${esc(c.category)}">
      <span class="what" style="flex:1">${tag(c.category)}${b ? `<span class="bar" role="img" aria-label="${esc(T.budgetUse(Math.round(b.ratio * 100)))}"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></span>
        <span class="budget-note ${over ? 'over' : ''}">${esc(over ? T.overBudget(rp(b.spent - b.budget), rp(b.budget)) : T.ofBudget(rp(b.budget), rp(b.budget - b.spent)))}</span>` : ''}</span>
      <span class="amt">${rp(c.amount)}</span></button>`;
  }).join('');
  const incomeRows = s.byCategory.filter((c) => c.kind === 'income').sort((a, b) => b.amount - a.amount).map((c) => `
    <button class="rowi" data-action="drill" data-category="${esc(c.category)}"><span class="what">${tag(c.category)}</span><span class="amt in">+${rp(c.amount)}</span></button>`).join('');
  const group = (type, title) => {
    const list = d.balances.filter((b) => b.type === type);
    if (!list.length) return '';
    const total = list.reduce((a, b) => a + b.balance, 0);
    return `<div class="rowi total-row"><span>${esc(title)}</span><span class="amt">${rp(total)}</span></div>${list.map((b) => `
      <button class="rowi" data-action="drill" data-stream="${esc(b.stream)}"><span class="what"><b>${esc(b.stream)}</b></span><span class="amt">${rp(b.balance)}</span></button>`).join('')}`;
  };
  const trend = d.trend || [];
  const top = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));
  const chart = trend.map((t) => `
    <button class="m ${t.month === d.month ? 'on' : ''}" data-action="setmonth" data-month="${t.month}" aria-label="${esc(`${monthLabel(t.month)}: ${T.income} ${rp(t.income)}, ${T.expense} ${rp(t.expense)}`)}">
      <span class="bars"><i class="in" style="height:${Math.round((t.income / top) * 100)}%"></i><i class="out" style="height:${Math.round((t.expense / top) * 100)}%"></i></span>
      <span>${esc(monthShort(t.month))}</span></button>`).join('');
  setView(`
    <header class="page-head"><div><h1>${esc(T.tabDashboard)}</h1><p class="sub">${esc(monthLabel(d.month))}</p></div>
      <div class="tools monthnav">
        <button class="btn secondary small" data-action="setmonth" data-month="${prev}" aria-label="${esc(monthLabel(prev))}">‹ ${esc(monthShort(prev))}</button>
        <button class="btn secondary small" data-action="setmonth" data-month="${next}" aria-label="${esc(monthLabel(next))}" ${next > current ? 'disabled' : ''}>${esc(monthShort(next))} ›</button>
      </div></header>
    ${d.pendingCount ? `<button class="notice" data-action="go" data-tab="review"><span aria-hidden="true">⚠</span><span><b>${esc(T.pendingNote(d.pendingCount))}</b><br>${esc(T.pendingNoteSub)}</span><span class="go">${esc(T.reviewNow)} ›</span></button>` : ''}
    <div class="kpis" style="margin-top:16px">
      <button class="card kpi main" data-action="drill"><div class="k">${esc(T.netThisMonth)}</div><div class="v ${s.balance < 0 ? 'bad' : ''}">${s.balance < 0 ? '' : '+'}${rp(s.balance)}</div><div class="meta">${esc(T.netHint)}</div></button>
      <button class="card kpi" data-action="drill" data-direction="in"><div class="k">${esc(T.income)}</div><div class="v in">+${rp(s.income)}</div><div class="meta">${esc(T.seeList)} ›</div></button>
      <button class="card kpi" data-action="drill" data-direction="out"><div class="k">${esc(T.expense)}</div><div class="v">${rp(s.expense)}</div><div class="meta">${esc(T.seeList)} ›</div></button>
      <div class="card kpi"><div class="k">${esc(T.perDay)}</div><div class="v">${rp(d.perDay.perDay)}</div><div class="meta">${esc(T.daysToPayday(d.perDay.daysLeft, dateLabel(d.perDay.nextPayday, { weekday: false })))}</div>${d.perDay.spending < 0 ? `<div class="meta"><button class="link" data-action="go" data-tab="settings">⚠ ${esc(T.negativeSpending)}</button></div>` : ''}</div>
    </div>
    ${trend.length ? `<h2 class="section-title">${esc(T.trendTitle)}<small>${esc(T.trendHint)}</small></h2>
    <div class="card"><div class="chart">${chart}</div>
      <div class="legend"><span><i class="in"></i>${esc(T.income)} ${rp(s.income)}</span><span><i class="out"></i>${esc(T.expense)} ${rp(s.expense)}</span><span class="muted">${esc(monthLabel(d.month))}</span></div></div>` : ''}
    <div class="grid2" style="margin-top:16px">
      <section class="card"><h2>${esc(T.expenseByCategory)}</h2><p class="lead">${esc(d.budgets.length ? T.expenseByCategoryHint : T.noBudgets)}</p><div class="rows">${expenseRows || `<p class="hint">${esc(T.nothingYet)}</p>`}</div></section>
      <div class="stack">
        <section class="card"><h2>${esc(T.incomeByCategory)}</h2><div class="rows">${incomeRows || `<p class="hint">${esc(T.nothingYet)}</p>`}</div></section>
        ${recurringCard(d.recurring)}
        <section class="card"><h2>${esc(T.accounts)}</h2><p class="lead">${esc(T.accountsHint)}</p><div class="rows">${group('Spending', T.spendingGroup)}${group('Saving', T.savingGroup)}</div></section>
      </div>
    </div>`);
}

function recurringCard(r) {
  if (!r || !r.items || !r.items.length) return '';
  const when = (i) => (i.daysLeft < 0 ? T.recurringLate(dateLabel(i.nextDate, { weekday: false }), -i.daysLeft)
    : i.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(i.nextDate, { weekday: false }), i.daysLeft));
  const rows = r.items.map((i) => `
    <button class="rowi" data-action="drill" data-q="${esc(i.name)}"><span class="what"><b>${esc(i.name)}</b>
      <span class="meta">${esc(when(i))}${i.stream ? ` · ${esc(i.stream)}` : ''}${i.basis === 'category' ? ` · <span class="badge neutral">${esc(T.recurringGuess)}</span>` : ''}${i.daysLeft < 0 ? ` <span class="badge warn">${esc(T.recurringLateBadge)}</span>` : ''}</span></span>
      <span class="amt">${rp(i.amount)}</span></button>`).join('');
  return `<section class="card"><h2>${esc(T.recurringTitle)}</h2><p class="lead">${esc(T.recurringHint(rp(r.monthlyTotal)))}</p><div class="rows">${rows}</div></section>`;
}

// ---------------------------------------------------------------- Transactions
async function viewTransactions() {
  if (state.filters.month == null) state.filters.month = state.month;
  if (!state.all) {
    skeleton(T.tabTransactions);
    setAll((await call('list', { limit: 1000000 })).rows);
    if (state.tab !== 'transactions') return;
  } else if (state.allStale) {
    call('list', { limit: 1000000 }).then((r) => { setAll(r.rows); if (state.tab === 'transactions') showResults(); }).catch(() => {});
  }
  const f = state.filters;
  const c = state.boot.categories;
  const start = String(state.boot.start || `${state.boot.year}-01`).slice(0, 7);
  const months = [];
  for (let m = state.boot.today.slice(0, 7); m >= start && months.length < 36; m = monthAdd(m, -1)) months.push(m);
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  setView(`
    <header class="page-head"><div><h1>${esc(T.tabTransactions)}</h1><p class="sub">${esc(T.transactionsSub)}</p></div>
      <div class="tools"><button class="btn primary small" data-action="go" data-tab="add">＋ ${esc(T.addTransaction)}</button></div></header>
    <div class="filters ${state.filtersOpen ? 'open' : ''}">
      <div class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" data-filter="q" aria-label="${esc(T.search)}" placeholder="${esc(T.searchPlaceholder)}" value="${esc(f.q)}"></div>
      <button type="button" class="btn secondary small filter-toggle" data-action="togglefilters" aria-expanded="${!!state.filtersOpen}">${esc(T.filters)}<span id="filterCount"></span></button>
      <div class="filter-grid">
        ${field(T.month, `<select data-filter="month">${opt('', T.allMonths, f.month)}${months.map((m) => opt(m, monthLabel(m), f.month)).join('')}</select>`)}
        ${field(T.account, `<select data-filter="stream">${opt('', T.allAccounts, f.stream)}${state.boot.accounts.map((a) => opt(a.stream, a.stream, f.stream)).join('')}</select>`)}
        ${field(T.category, `<select data-filter="category">${opt('', T.allCategories, f.category)}${[...c.expense, ...c.income, ...c.fixed].map((x) => opt(x, x, f.category)).join('')}</select>`)}
        ${field(T.kind, `<select data-filter="direction">${opt('', T.allKinds, f.direction)}${opt('out', T.kindOut, f.direction)}${opt('in', T.kindIn, f.direction)}</select>`)}
        ${field(T.status, `<select data-filter="status">${opt('', T.allStatus, f.status)}${['approved', 'pending', 'ignored'].map((x) => opt(x, T[`status${x[0].toUpperCase()}${x.slice(1)}`], f.status)).join('')}</select>`)}
      </div>
      <div class="chips" id="txChips"></div>
    </div>
    <div id="txResults"></div>`);
  showResults();
}

/** Filter chips and the table only, so typing in the search box keeps its place. */
function showResults() {
  const box = $('#txResults');
  if (!box) return;
  const f = state.filters;
  const all = filterTransactions(state.all, { ...f, limit: 1e9 });
  const rows = all.rows.slice(0, state.limit);
  remember(rows);
  const counted = all.rows.filter((r) => r.status !== 'ignored');
  const sum = (dir) => counted.filter((r) => r.direction === dir).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const chips = [
    f.q && ['q', `“${f.q}”`], f.month && ['month', monthLabel(f.month)], f.stream && ['stream', f.stream], f.category && ['category', f.category],
    f.direction && ['direction', f.direction === 'in' ? T.kindIn : T.kindOut], f.status && ['status', T[`status${f.status[0].toUpperCase()}${f.status.slice(1)}`]],
  ].filter(Boolean);
  const fc = $('#filterCount');
  if (fc) fc.textContent = chips.length ? ` (${T.activeN(chips.length)})` : '';
  $('#txChips').innerHTML = chips.length ? `${chips.map(([k, label]) => `<button class="chip" data-action="unfilter" data-key="${k}" aria-label="${esc(T.removeFilter(label))}">${esc(label)} <span class="x" aria-hidden="true">✕</span></button>`).join('')}
    <button class="btn plain small" data-action="resetfilters">${esc(T.resetFilters)}</button>` : '';
  const items = rows.map((x) => `
    <button class="trow" data-action="edit" data-id="${esc(x.id)}">
      <span class="c-date">${esc(dateLabel(x.date))}<br><small class="muted">${esc(timeLabel(x.time))}</small></span>
      <span class="c-desc">${esc(x.description || '—')}${x.details ? `<small>${esc(x.details)}</small>` : ''}</span>
      <span class="c-mobile-meta">${esc(when(x))} · ${esc(x.stream || T.noAccount)}</span>
      <span class="c-cat">${tag(x.category)}${statusBadge(x.status)}</span>
      <span class="c-acct">${esc(x.stream || '—')}</span>
      <span class="c-amt amt ${esc(x.direction)}">${signed(x)}</span>
    </button>`).join('');
  box.innerHTML = `${f.category ? categoryTrend(f.category) : ''}
    <div class="summary-bar"><span><b>${esc(T.countTransactions(all.total))}</b></span>
      <span>${esc(T.kindIn)} <b class="amt in">+${rp(sum('in'))}</b> · ${esc(T.kindOut)} <b class="amt">${rp(sum('out'))}</b></span></div>
    ${rows.length ? `<div class="table" role="table"><div class="thead" role="row"><span>${esc(T.date)}</span><span>${esc(T.description)}</span><span>${esc(T.category)}</span><span>${esc(T.account)}</span><span class="r">${esc(T.amount)}</span></div>${items}</div>`
    : `<div class="card empty"><b>${esc(T.noTransactions)}</b>${esc(chips.length ? T.noTransactionsFiltered : '')}</div>`}
    ${all.total > rows.length ? `<div class="more"><span>${esc(T.showing(rows.length, all.total))}</span><button class="btn secondary" data-action="more">${esc(T.showMore)}</button></div>` : ''}`;
}

/** Six months of one category, as labelled bars (tap a month to filter on it). */
function categoryTrend(category) {
  const c = state.boot.categories;
  const dir = c.income.includes(category) ? 'in' : 'out';
  const now = state.boot.today.slice(0, 7);
  const start = String(state.boot.start || '').slice(0, 7);
  const months = [-5, -4, -3, -2, -1, 0].map((k) => monthAdd(now, k)).filter((m) => !start || m >= start);
  const total = (m) => state.all.filter((r) => r.status === 'approved' && r.category === category && r.direction === dir && String(r.date).startsWith(m))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const data = months.map((m) => ({ m, v: total(m) }));
  const top = Math.max(1, ...data.map((d) => d.v));
  const avg = data.reduce((s, d) => s + d.v, 0) / Math.max(1, data.length);
  return `<section class="card trend-card"><h2>${esc(T.categoryTrend(category))}</h2><p class="lead">${esc(T.categoryTrendHint(rp(avg)))}</p>
    <div class="rows">${data.map((d) => `<button class="rowi hbar-row ${state.filters.month === d.m ? 'on' : ''}" data-action="trendmonth" data-month="${d.m}">
      <span class="hbar-label">${esc(monthLabel(d.m))}</span><span class="hbar"><i class="${dir}" style="width:${Math.round((d.v / top) * 100)}%"></i></span><span class="amt ${dir}">${rp(d.v)}</span></button>`).join('')}</div></section>`;
}

function drill(el) {
  state.filters = { q: el.dataset.q || '', month: el.dataset.stream || el.dataset.q ? '' : state.month, stream: el.dataset.stream || '', category: el.dataset.category || '', status: '', direction: el.dataset.direction || '' };
  state.limit = 50;
  return show('transactions');
}

// ---------------------------------------------------------------- Editor
function openEditor(id) {
  const x = state.rowsById.get(String(id));
  if (!x) return;
  const statuses = ['approved', 'pending', 'ignored'].map((s) => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${esc(T[`status${s[0].toUpperCase()}${s.slice(1)}`])}</option>`).join('');
  const parentId = String(x.ref_no || '').startsWith('split:') ? String(x.ref_no).slice(6) : '';
  $('#modal').innerHTML = `<div class="sheet">
    <form data-form="edit" data-id="${esc(x.id)}" novalidate>
      <h2>${esc(T.editTitle)}</h2>
      <p class="lead">${esc(x.gmail_id ? T.fromEmail : T.enteredByHand)}${x.gmail_id ? ` · <a class="link" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(x.gmail_id)}">${esc(T.openGmail)} ↗</a>` : ''}</p>
      ${field(T.description, `<input name="description" value="${esc(x.description)}">`)}
      <div class="fields2" style="margin-top:16px">
        ${field(T.amountRp, `<input name="amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(x.amount)}">`)}
        ${field(T.kind, `<select name="direction"><option value="out" ${x.direction === 'out' ? 'selected' : ''}>${esc(T.kindOut)}</option><option value="in" ${x.direction === 'in' ? 'selected' : ''}>${esc(T.kindIn)}</option></select>`)}
        ${field(T.category, `<select name="category">${categoryOptions(x.category, x.direction)}</select>`)}
        ${field(T.account, `<select name="stream">${accountOptions(x.stream)}</select>`)}
        ${field(T.date, `<input name="date" type="date" value="${esc(x.date)}">`)}
        ${field(T.status, `<select name="status">${statuses}</select>`, { help: T.statusHelp })}
      </div>
      ${field(T.notes, `<input name="details" value="${esc(x.details)}">`, { help: T.optional })}
      <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.cancel)}</button><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div>
    </form>
    ${parentId ? `<div class="split-box"><p>${esc(T.isSplitPart)}</p><button class="btn secondary" type="button" data-action="edit" data-id="${esc(parentId)}">${esc(T.openSplitParent)}</button></div>`
    : `<div class="split-box" id="splitBox">${splitSummary(x)}</div>`}
    <div class="danger-zone"><button class="btn danger" type="button" data-action="delete" data-id="${esc(x.id)}">${esc(T.deleteTransaction)}</button>
      ${x.gmail_id ? `<p class="hint">${esc(T.deleteEmailHint)}</p>` : ''}</div>
  </div>`;
  $('#modal').classList.add('open');
  const first = $('#modal input[name=description]');
  if (first && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) first.focus();
}
const closeModal = () => { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; };

// ---------------------------------------------------------------- Split
const splitParts = (id) => (state.all || []).filter((r) => r.ref_no === `split:${id}`);
const cents = (n) => Math.round((Number(n) || 0) * 100);
function splitSummary(x) {
  const parts = splitParts(x.id);
  if (!parts.length) return `<h3>${esc(T.splitTitle)}</h3><p class="hint">${esc(T.splitHint)}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="splitopen" data-id="${esc(x.id)}">${esc(T.splitOpen)}</button></div>`;
  const all = [x, ...parts];
  return `<h3>${esc(T.splitDone(all.length))}</h3><div class="rows">${all.map((p) => `<div class="rowi"><span class="what">${tag(p.category)} <span class="meta">${esc(p.description)}</span></span><span class="amt">${rp(p.amount)}</span></div>`).join('')}</div>
    <div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="splitopen" data-id="${esc(x.id)}">${esc(T.splitChange)}</button><button class="btn plain" type="button" data-action="unsplit" data-id="${esc(x.id)}">${esc(T.splitUndo)}</button></div>`;
}
function splitRow(p, i) {
  return `<div class="split-row" data-i="${i}">
    ${field(T.amountRp, `<input data-s="amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(p.amount || '')}">`)}
    ${field(T.category, `<select data-s="category">${categoryOptions(p.category, p.direction)}</select>`)}
    ${field(T.splitName, `<input data-s="description" value="${esc(p.description || '')}">`, { help: T.optional })}
  </div>`;
}
function openSplit(id) {
  const x = state.rowsById.get(String(id));
  if (!x) return;
  const existing = splitParts(id);
  const parts = existing.length ? [x, ...existing] : [{ ...x }, { amount: '', category: '', description: '', direction: x.direction }];
  state.splitTotal = cents(x.amount) + existing.reduce((s, r) => s + cents(r.amount), 0);
  $('#splitBox').innerHTML = `<form data-form="split" data-id="${esc(id)}" novalidate>
    <h3>${esc(T.splitTitle)}</h3><p class="hint">${esc(T.splitTotal(rp(state.splitTotal / 100)))}</p>
    <div id="splitRows">${parts.map((p, i) => splitRow({ ...p, direction: x.direction }, i)).join('')}</div>
    <div class="actions" style="justify-content:flex-start"><button class="btn plain" type="button" data-action="splitadd">＋ ${esc(T.splitAdd)}</button></div>
    <p class="split-left" id="splitLeft" role="status"></p>
    <div class="actions"><span class="state" role="status"></span><button class="btn secondary" type="button" data-action="splitcancel" data-id="${esc(id)}">${esc(T.cancel)}</button><button class="btn primary" type="submit">${esc(T.splitSave)}</button></div>
  </form>`;
  updateSplitLeft();
}
function readSplit(form) {
  return $$('.split-row', form).map((r) => ({ amount: Number($('[data-s=amount]', r).value) || 0, category: $('[data-s=category]', r).value, description: $('[data-s=description]', r).value.trim() }));
}
function updateSplitLeft() {
  const form = $('form[data-form=split]');
  if (!form) return 0;
  const left = state.splitTotal - readSplit(form).reduce((s, p) => s + cents(p.amount), 0);
  const el = $('#splitLeft');
  el.className = `split-left ${left === 0 ? 'ok' : 'bad'}`;
  el.textContent = left === 0 ? `✓ ${T.splitBalanced}` : left > 0 ? T.splitLeft(rp(left / 100)) : T.splitOver(rp(-left / 100));
  return left;
}
function submitSplit(form) {
  const id = form.dataset.id;
  const parts = readSplit(form);
  let ok = true;
  $$('.split-row', form).forEach((r, i) => {
    ok = fieldMessage($('[data-s=amount]', r), parts[i].amount > 0 ? '' : T.errAmount) && ok;
    ok = fieldMessage($('[data-s=category]', r), parts[i].category ? '' : T.errNoCategory) && ok;
  });
  if (!ok) return null;
  if (updateSplitLeft() !== 0) return null;
  const x = state.rowsById.get(String(id));
  const old = splitParts(id).map((r) => String(r.id));
  // On screen at once: the first part stays on this row, the others are new rows.
  const desc = (p) => p.description || x.description;
  patchRow(id, { amount: parts[0].amount, category: parts[0].category, description: desc(parts[0]), status: 'approved' });
  if (state.all) state.all = state.all.filter((r) => !old.includes(String(r.id)));
  parts.slice(1).forEach((p, i) => {
    const row = { ...x, id: `${id}_s${i + 1}`, amount: p.amount, category: p.category, description: desc(p), source: 'split', ref_no: `split:${id}`, gmail_id: '', status: 'approved' };
    state.rowsById.set(row.id, row);
    if (state.all) state.all.push(row);
  });
  closeModal();
  repaint();
  toast(T.splitSaved(parts.length));
  return save('split', { id, parts }).then(() => { state.allStale = true; scheduleRefresh(0); })
    .catch((e) => { toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); state.allStale = true; scheduleRefresh(0); });
}
function unsplit(id) {
  const x = state.rowsById.get(String(id));
  const parts = splitParts(id);
  const total = cents(x.amount) + parts.reduce((s, r) => s + cents(r.amount), 0);
  patchRow(id, { amount: total / 100 });
  if (state.all) state.all = state.all.filter((r) => r.ref_no !== `split:${id}`);
  closeModal();
  repaint();
  toast(T.splitUndone);
  return save('unsplit', { id }).then(() => scheduleRefresh(0)).catch((e) => { toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); scheduleRefresh(0); });
}

// ---------------------------------------------------------------- Add
function viewAdd() {
  const k = state.addKind;
  const kinds = [['out', T.kindOut], ['in', T.kindIn], ['transfer', T.kindTransfer], ['adjust', T.kindAdjust]];
  const last = state.addLast || {};
  setView(`<div class="narrow">
    <header class="page-head"><div><h1>${esc(T.addTitle)}</h1><p class="sub">${esc(T.addSub)}</p></div></header>
    <form class="card" data-form="add" novalidate>
      <div class="field"><span id="kindLabel">${esc(T.kind)}</span><div class="seg wrap" role="group" aria-labelledby="kindLabel">${kinds.map(([v, l]) => `<button type="button" class="${v === k ? 'on' : ''}" aria-pressed="${v === k}" data-action="kind" data-kind="${v}">${esc(l)}</button>`).join('')}</div></div>
      ${field(T.amountRp, `<input class="amount-input" name="amount" type="number" inputmode="decimal" step="any" ${k === 'adjust' ? '' : 'min="0"'} placeholder="0">`, { help: k === 'adjust' ? T.adjustHint : T.amountHelp })}
      <div class="fields2" style="margin-top:16px">
        ${k === 'out' || k === 'in' ? field(T.category, `<select name="category">${categoryOptions('', k)}</select>`) : ''}
        ${field(k === 'transfer' ? T.fromAccount : T.account, `<select name="stream">${accountOptions(last.stream || (k === 'out' ? 'Cash' : ''))}</select>`)}
        ${k === 'transfer' ? field(T.toAccount, `<select name="toStream">${accountOptions('')}</select>`) : ''}
        ${field(T.date, `<input name="date" type="date" value="${esc(last.date || state.boot.today)}">`)}
      </div>
      ${field(T.description, '<input name="description" autocomplete="off">', { help: T.descriptionHelp })}
      ${field(T.notes, '<input name="details" autocomplete="off">', { help: T.optional })}
      <div class="actions"><span class="state" id="addState" role="status"></span><button class="btn primary" type="submit">${esc(T.saveTransaction)}</button></div>
    </form></div>`);
}

function submitAdd(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const k = state.addKind;
  const amount = Number(d.amount);
  const el = (n) => form.querySelector(`[name=${n}]`);
  let ok = fieldMessage(el('amount'), !d.amount || !amount || (k !== 'adjust' && amount < 0) ? T.errAmount : '');
  if (el('category')) ok = fieldMessage(el('category'), d.category ? '' : T.errNoCategory) && ok;
  ok = fieldMessage(el('stream'), d.stream ? '' : T.errNoAccount) && ok;
  if (el('toStream')) ok = fieldMessage(el('toStream'), !d.toStream ? T.errNoAccount : d.toStream === d.stream ? T.errSameAccount : '') && ok;
  if (!ok) { const bad = form.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }
  const label = `${d.description || d.category || T[`kind${k[0].toUpperCase()}${k.slice(1)}`]} ${rp(amount)}`;
  state.addLast = { stream: d.stream, date: d.date };
  ['amount', 'description', 'details'].forEach((n) => { el(n).value = ''; });
  if (el('category')) el('category').value = '';
  const st = $('#addState');
  st.className = 'state'; st.textContent = `${T.saving} ${label}`;
  toast(T.addedNamed(label));
  state.allStale = true;
  save('add', { kind: k, ...d, amount })
    .then(() => { if ($('#addState') === st) { st.className = 'state ok'; st.textContent = `✓ ${T.addedNamed(label)}`; } })
    .catch((e) => { if ($('#addState') === st) { st.className = 'state bad'; st.textContent = `${T.notSaved}: ${e.message}`; } toast(`${T.notSaved}: ${label} — ${e.message}`, { kind: 'bad' }); });
  el('amount').focus();
}

// ---------------------------------------------------------------- Settings
async function viewSettings(local) {
  // `local`: re-render from unsaved local data (e.g. after "add account") without a server round trip.
  if (!local) skeleton(T.tabSettings);
  const s = local || await call('settings');
  if (state.tab !== 'settings') return;
  state.settings = s;
  const cfg = s.config;
  const saveRow = (label) => `<div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(label)}</button></div>`;
  const acc = s.accounts.map((a, i) => `
    <fieldset class="acct-row acct" data-i="${i}"><legend>${esc(a.stream || T.newAccount)}</legend>
      <div class="fields2">
        ${field(T.accountName, `<input data-a="stream" value="${esc(a.stream)}">`)}
        ${field(T.accountType, `<select data-a="type"><option value="Spending" ${a.type === 'Spending' ? 'selected' : ''}>${esc(T.typeSpending)}</option><option value="Saving" ${a.type === 'Saving' ? 'selected' : ''}>${esc(T.typeSaving)}</option></select>`)}
        ${field(T.bank, `<input data-a="institution" value="${esc(a.institution)}">`, { help: T.optional })}
        ${field(T.openingBalance, `<input data-a="opening_balance" type="number" inputmode="decimal" step="any" value="${esc(a.opening_balance)}">`)}
        ${field(T.hints, `<input data-a="match_hint" value="${esc(a.match_hint)}">`, { help: T.hintsHelp, wide: true })}
      </div></fieldset>`).join('');
  // Rule previews need every transaction: fetched if missing or out of date, then the previews redrawn.
  if (!state.all || state.allStale) call('list', { limit: 1000000 }).then((r) => { setAll(r.rows); $$('.rule').forEach(previewRule); }).catch(() => {});
  const rules = s.rules.map((r, i) => `
    <fieldset class="acct-row rule" data-i="${i}"><legend>${tag(r.category)}</legend>
      <div class="fields2">
        ${field(T.rulePattern, `<input data-r="pattern" value="${esc(r.pattern)}" autocomplete="off" spellcheck="false">`, { help: T.rulePatternHelp })}
        ${field(T.category, `<select data-r="category">${categoryOptions(r.category, 'out')}</select>`)}
      </div>
      <label class="check"><input type="checkbox" data-r="auto_approve" ${r.auto_approve === true || r.auto_approve === 'TRUE' ? 'checked' : ''}> ${esc(T.autoApprove)}</label>
      <p class="hint rule-preview" role="status">${esc(T.hits(Number(r.hits) || 0))}</p>
      <div class="actions"><button class="btn danger small" type="button" data-action="delrule" data-i="${i}">${esc(T.deleteRule)}</button></div>
    </fieldset>`).join('');
  const budgets = s.categories.expense.map((c) => {
    const b = s.budgets.find((x) => x.category === c);
    return field(c, `<input data-b="${esc(c)}" type="number" inputmode="decimal" step="any" min="0" value="${esc(b ? b.monthly_budget : '')}" placeholder="0">`);
  }).join('');
  const conns = (s.connections || []).map((c) => {
    const st = String(c.last_status || '');
    const failed = /^ERROR/.test(st);
    const note = !c.last_sync ? T.neverSynced : failed ? `${T.syncProblem}: ${st.replace(/^ERROR:s*/, '').split(' | ')[0]}` : T.syncHealthy;
    const at = c.last_sync ? new Date(c.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="rowi"><span class="what"><b>${esc(c.gmail)}</b><span class="meta">${at ? `${esc(T.lastSync)} ${esc(at)} · ` : ''}${failed ? `<span class="badge bad">⚠ ${esc(note)}</span>` : `<span class="badge ok">✓ ${esc(note)}</span>`}</span></span></div>`;
  }).join('');
  setView(`<div class="narrow">
    <header class="page-head"><div><h1>${esc(T.tabSettings)}</h1><p class="sub">${esc(T.settingsSub)}</p></div></header>
    <div class="stack">
      <section class="card"><h2>${esc(T.settingsSync)}</h2><p class="lead">${esc(T.settingsSyncHint)}</p><div class="rows">${conns}</div>
        <div class="actions"><button class="btn primary" type="button" data-action="sync">↻ ${esc(T.syncNow)}</button></div></section>
      <form class="card" data-form="config" novalidate><h2>${esc(T.preferences)}</h2>
        <div class="fields2" style="margin-top:12px">
          ${field(T.language, `<select name="language"><option value="" ${!cfg.language ? 'selected' : ''}>${esc(T.languageAuto)}</option><option value="id" ${cfg.language === 'id' ? 'selected' : ''}>Bahasa Indonesia</option><option value="en" ${cfg.language === 'en' ? 'selected' : ''}>English</option></select>`)}
          ${field(T.payday, `<input name="payday_day" type="number" min="1" max="31" value="${esc(cfg.payday_day)}">`, { help: T.paydayHelp })}
          ${field(T.ownerNames, `<input name="owner_bank_names" value="${esc(cfg.owner_bank_names)}">`, { help: T.ownerNamesHelp, wide: true })}
        </div>${saveRow(T.saveChanges)}</form>
      <form class="card" data-form="monthend" novalidate><h2>${esc(T.monthEnd)}</h2><p class="lead">${esc(T.monthEndHint)}</p>
        <div class="fields2">
          ${field(T.account, `<select name="stream">${accountOptions('')}</select>`)}
          ${field(T.actualBalance, '<input name="actual" type="number" inputmode="decimal" step="any">', { help: T.actualBalanceHelp })}
          ${field(T.date, `<input name="date" type="date" value="${esc(state.boot.today)}">`)}
        </div>${saveRow(T.checkBalance)}</form>
      <form class="card" data-form="accounts" novalidate><h2>${esc(T.accountsTitle)}</h2><p class="lead">${esc(T.accountsTitleHint)}</p>${acc}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addacct">＋ ${esc(T.addAccount)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveAccounts)}</button></div></form>
      <form class="card" data-form="categories" novalidate><h2>${esc(T.categoriesTitle)}</h2><p class="lead">${esc(T.categoriesHint)}</p>
        <div class="fields2">
          ${field(T.incomeCats, `<textarea name="income" rows="7">${esc(s.categories.income.join('\n'))}</textarea>`, { help: T.onePerLine })}
          ${field(T.expenseCats, `<textarea name="expense" rows="14">${esc(s.categories.expense.join('\n'))}</textarea>`, { help: T.onePerLine })}
        </div>${saveRow(T.saveCategories)}</form>
      <form class="card" data-form="budgets" novalidate><h2>${esc(T.budgetsTitle)}</h2><p class="lead">${esc(T.budgetsHint)}</p><div class="budget-grid">${budgets}</div>${saveRow(T.saveBudgets)}</form>
      <form class="card" data-form="rules" novalidate><h2>${esc(T.rulesTitle)}</h2><p class="lead">${esc(T.rulesHint)}</p>${rules || `<p class="hint">${esc(T.noRules)}</p>`}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addrule">＋ ${esc(T.addRule)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveRules)}</button></div></form>
      <form class="card" data-form="weekly" novalidate><h2>${esc(T.weeklyTitle)}</h2><p class="lead">${esc(T.weeklyHint)}</p>
        <label class="check"><input type="checkbox" name="weekly_email" ${cfg.weekly_email !== 'off' ? 'checked' : ''}> ${esc(T.weeklyOn)}</label>
        <div class="actions"><button class="btn secondary left" type="button" data-action="sendsummary">${esc(T.weeklySendNow)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>
      <section class="card"><h2>${esc(T.more)}</h2>
        <div class="rows"><div class="rowi"><span class="what"><b>${esc(T.selftest)}</b><span class="meta">${esc(s.selftest || '—')}</span></span></div></div>
        <div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="${esc(state.boot.sheetUrl || '#')}">${esc(T.openSheet)} ↗</a></div></section>
    </div></div>`);
  $$('.rule').forEach(previewRule);
}

/** Settings forms: the button shows the save, and the result appears next to it. */
async function saveForm(form, name, payload, after) {
  const btn = form.querySelector('button[type=submit]');
  const st = form.querySelector('.state');
  btn.disabled = true;
  st.className = 'state'; st.textContent = T.saving;
  try {
    const r = await save(name, payload);
    st.className = 'state ok'; st.textContent = `✓ ${T.saved}`;
    if (after) await after(r);
  } catch (e) {
    st.className = 'state bad'; st.textContent = `${T.notSaved}: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------- shell
const VIEWS = { review: viewReview, dashboard: viewDashboard, transactions: viewTransactions, add: viewAdd, settings: viewSettings };

async function show(tab) {
  state.tab = tab;
  $$('.nav button[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  try { await VIEWS[tab](); } catch (e) { if (state.tab === tab) failed(e); }
  if (typeof window.scrollTo === 'function') try { window.scrollTo(0, 0); } catch (e) { /* not available */ }
}

// The last startup data is kept in this browser so the app can paint instantly next time,
// then it is replaced by fresh data from the server.
const CACHE_KEY = 'cashflow.init.v1';
const TIMING_KEY = 'cashflow.lastLoad.v1';
function readCache() {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}
function writeCache(data) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

function toast(msg, { kind = 'ok', undo } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" data-toast="undo">${esc(T.undo)}</button>` : ''}`;
  el.className = `toast show ${kind}`;
  toast.undo = undo || null;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; toast.undo = null; }, undo ? 6000 : kind === 'bad' ? 7000 : 3000);
}

async function syncNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = T.syncing; }
  status('loading');
  try {
    const s = await call('syncNow');
    toast(s.status === 'busy' ? T.syncBusy : T.syncDone(s.added || 0));
    await refresh();
  } catch (e) {
    toast(`${T.error}: ${e.message}`, { kind: 'bad' });
  } finally {
    status();
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = `↻ ${T.syncNow}`; }
  }
}

function onClick(e) {
  if (e.target.closest('[data-toast=undo]')) {
    const u = toast.undo;
    $('#toast').className = 'toast';
    toast.undo = null;
    if (u) u();
    return null;
  }
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-action],[data-tab]');
  if (!el) return null;
  const a = el.dataset.action;
  const card = el.closest('[data-id]');
  if (!a || a === 'go') return show(el.dataset.tab);
  if (a === 'reload') return show(state.tab);
  if (a === 'reloadpage') { window.location.reload(); return null; }
  if (a === 'setmonth') { state.month = el.dataset.month; return show('dashboard'); }
  if (a === 'drill') return drill(el);
  if (a === 'kind') { state.addKind = el.dataset.kind; return viewAdd(); }
  if (a === 'more') { state.limit += 50; return showResults(); }
  if (a === 'trendmonth') { state.filters.month = state.filters.month === el.dataset.month ? '' : el.dataset.month; state.limit = 50; return viewTransactions(); }
  if (a === 'togglefilters') {
    state.filtersOpen = !state.filtersOpen;
    el.closest('.filters').classList.toggle('open', state.filtersOpen);
    el.setAttribute('aria-expanded', String(state.filtersOpen));
    return null;
  }
  if (a === 'unfilter') { state.filters[el.dataset.key] = ''; state.limit = 50; return viewTransactions(); }
  if (a === 'resetfilters') { state.filters = { q: '', month: '', stream: '', category: '', status: '', direction: '' }; state.limit = 50; return viewTransactions(); }
  if (a === 'edit') return openEditor(el.dataset.id);
  if (a === 'splitopen') return openSplit(el.dataset.id);
  if (a === 'splitcancel') { $('#splitBox').innerHTML = splitSummary(state.rowsById.get(String(el.dataset.id))); return null; }
  if (a === 'splitadd') {
    const box = $('#splitRows');
    const x = state.rowsById.get(String(el.closest('form').dataset.id));
    box.insertAdjacentHTML('beforeend', splitRow({ direction: x.direction }, box.children.length));
    updateSplitLeft();
    return null;
  }
  if (a === 'unsplit') { if (!window.confirm(T.splitUndoConfirm)) return null; return unsplit(el.dataset.id); }
  if (a === 'addrule') {
    state.settings.rules = readRules($('form[data-form=rules]'));
    state.settings.rules.push({ id: '', field: 'description', pattern: '', category: '', auto_approve: true, hits: 0 });
    viewSettings(state.settings);
    const inputs = $$('.rule [data-r=pattern]');
    if (inputs.length) inputs[inputs.length - 1].focus();
    return null;
  }
  if (a === 'sendsummary') return sendSummaryNow(el);
  if (a === 'close') return closeModal();
  if (a === 'sync') return syncNow(el);
  if (a === 'approve') return approve(card);
  if (a === 'ignore') return ignore(card);
  if (a === 'delete') {
    if (!window.confirm(T.confirmDelete)) return null;
    const id = el.dataset.id;
    const row = state.rowsById.get(String(id));
    closeModal();
    if (row && row.gmail_id) patchRow(id, { status: 'ignored' });
    else {
      if (state.all) state.all = state.all.filter((r) => String(r.id) !== String(id));
      if (state.review) state.review.recentAuto = state.review.recentAuto.filter((r) => String(r.id) !== String(id));
      state.dashByMonth = {};
    }
    repaint();
    toast(row && row.gmail_id ? T.ignoredInstead : T.deleted);
    return save('remove', { id }).catch((err) => { toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); scheduleRefresh(0); });
  }
  if (a === 'delrule') { state.settings.rules = readRules(el.closest('form')); state.settings.rules.splice(Number(el.dataset.i), 1); return viewSettings(state.settings); }
  if (a === 'addacct') {
    const form = el.closest('form');
    state.settings.accounts = readAccounts(form);
    state.settings.accounts.push({ stream: '', type: 'Spending', institution: '', match_hint: '', opening_balance: 0 });
    viewSettings(state.settings);
    const rows = $$('.acct [data-a=stream]');
    if (rows.length) rows[rows.length - 1].focus();
    return null;
  }
  return null;
}

/** Rules as edited on screen, keeping each one's id, hits and author. */
function readRules(form) {
  return $$('.rule', form).map((el, i) => ({
    ...(state.settings.rules[i] || {}),
    pattern: $('[data-r=pattern]', el).value.trim(), category: $('[data-r=category]', el).value, auto_approve: $('[data-r=auto_approve]', el).checked,
  }));
}

/** Under each rule: how many transactions it matches, with a few examples. */
function previewRule(el) {
  const out = $('.rule-preview', el);
  if (!out) return;
  const pattern = $('[data-r=pattern]', el).value.trim();
  const c = compileRule({ pattern, category: 'x' });
  if (!pattern) { out.textContent = ''; return; }
  if (!c.re) { out.textContent = T.errRuleInvalid; return; }
  if (!state.all) { out.textContent = T.loading; return; }
  const hits = state.all.filter((r) => c.re.test(String(r.description || '')));
  const names = [...new Set(hits.map((r) => r.description))].slice(0, 3);
  out.textContent = hits.length ? T.ruleMatches(hits.length, names.join(', ')) : T.ruleMatchesNone;
}

async function sendSummaryNow(btn) {
  const st = btn.closest('form').querySelector('.state');
  btn.disabled = true;
  st.className = 'state'; st.textContent = T.weeklySending;
  try {
    const r = await call('sendSummary');
    st.className = 'state ok'; st.textContent = `✓ ${T.weeklySent(r.to || '')}`;
  } catch (e) {
    st.className = 'state bad'; st.textContent = `${T.notSaved}: ${e.message}`;
  } finally { btn.disabled = false; }
}

const readAccounts = (form) => $$('.acct', form).map((row) => Object.fromEntries($$('[data-a]', row).map((i) => [i.dataset.a, i.value])));

function onSubmit(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return null;
  e.preventDefault();
  const kind = form.dataset.form;
  const d = Object.fromEntries(new FormData(form).entries());
  if (kind === 'add') return submitAdd(form);
  if (kind === 'split') return submitSplit(form);
  if (kind === 'edit') {
    const amount = Number(d.amount);
    if (!fieldMessage(form.querySelector('[name=amount]'), amount > 0 ? '' : T.errAmount)) return null;
    const id = form.dataset.id;
    const before = { ...state.rowsById.get(String(id)) };
    const fields = { ...d, amount };
    closeModal();
    patchRow(id, fields);
    updateNav();
    repaint();
    toast(T.saved);
    return save('update', { id, fields }).catch((err) => {
      patchRow(id, before); updateNav(); repaint();
      toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' });
    });
  }
  if (kind === 'config') {
    return saveForm(form, 'saveConfig', d, async () => { applyLanguage(d.language); await refresh(); if (state.tab === 'settings') viewSettings(); });
  }
  if (kind === 'monthend') {
    let ok = fieldMessage(form.querySelector('[name=stream]'), d.stream ? '' : T.errNoAccount);
    ok = fieldMessage(form.querySelector('[name=actual]'), d.actual === '' ? T.errAmount : '') && ok;
    if (!ok) return null;
    return saveForm(form, 'balanceCheck', { stream: d.stream, actual: Number(d.actual), date: d.date }, (r) => {
      const st = form.querySelector('.state');
      st.textContent = `✓ ${r.adjusted ? T.adjusted(rp(r.adjusted)) : T.matched}`;
      state.allStale = true;
    });
  }
  if (kind === 'accounts') {
    const list = readAccounts(form).filter((a) => a.stream.trim());
    return saveForm(form, 'saveAccounts', { accounts: list }, () => refresh());
  }
  if (kind === 'categories') {
    const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const next = { income: lines(d.income), expense: lines(d.expense) };
    // Say which names count as renames (their transactions follow) before anything changes.
    let renames = [];
    try {
      const was = state.settings.categories;
      renames = Object.entries(renamedCategories(buildCategorySlots({ income: was.income, expense: was.expense }), buildCategorySlots(next)));
    } catch (err) {
      const st = form.querySelector('.state');
      st.className = 'state bad'; st.textContent = err.message;
      return null;
    }
    if (renames.length && !window.confirm(T.confirmRenames(renames.map(([a, b]) => `${a} → ${b}`).join('\n')))) return null;
    return saveForm(form, 'saveCategories', next, (r) => {
      const done = Object.entries(r.renamed || {});
      if (done.length) form.querySelector('.state').textContent = `✓ ${T.renamedDone(done.map(([a, b]) => `${a} → ${b}`).join(', '))}`;
      state.settings.categories = { ...state.settings.categories, ...next };
      state.allStale = true;
      return refresh();
    });
  }
  if (kind === 'budgets') {
    const budgets = $$('[data-b]', form).map((i) => ({ category: i.dataset.b, monthly_budget: Number(i.value) || 0 }));
    return saveForm(form, 'saveBudgets', { budgets }, () => { state.dashByMonth = {}; });
  }
  if (kind === 'rules') {
    const rules = readRules(form);
    let ok = true;
    $$('.rule', form).forEach((el, i) => {
      const c = compileRule(rules[i]);
      ok = fieldMessage($('[data-r=pattern]', el), !rules[i].pattern ? T.errRulePattern : c.re ? '' : T.errRuleInvalid) && ok;
      ok = fieldMessage($('[data-r=category]', el), rules[i].category ? '' : T.errNoCategory) && ok;
    });
    if (!ok) return null;
    return saveForm(form, 'saveRules', { rules }, () => { state.settings.rules = rules; });
  }
  if (kind === 'weekly') {
    return saveForm(form, 'saveConfig', { weekly_email: form.querySelector('[name=weekly_email]').checked ? 'on' : 'off' });
  }
  return null;
}

function onChange(e) {
  const f = e.target.closest('[data-filter]');
  if (f) {
    state.filters[f.dataset.filter] = f.value;
    state.limit = 50;
    return showResults();
  }
  // A changed category clears its "choose a category" message.
  if (e.target.closest('.field.invalid') && e.target.value) fieldMessage(e.target, '');
  if (e.target.name === 'direction' && e.target.closest('form[data-form=edit]')) {
    const cat = e.target.form.querySelector('[name=category]');
    cat.innerHTML = categoryOptions(cat.value, e.target.value);
  }
  return null;
}

function applyLanguage(configured) {
  const lang = pickLanguage(configured, navigator.language);
  T = STRINGS[lang];
  if (state.boot) state.boot.lang = lang;
  document.documentElement.lang = lang;
  $$('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  updateNav();
}

export async function start() {
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal(); });
  let searchTimer;
  document.addEventListener('input', (e) => {
    if (e.target.closest('form[data-form=split]')) updateSplitLeft();
    const rule = e.target.closest('.rule');
    if (rule && e.target.dataset.r === 'pattern') previewRule(rule);
    if (e.target.matches('[data-filter=q]')) { clearTimeout(searchTimer); searchTimer = setTimeout(() => onChange(e), 150); }
  });
  // Startup timing (ms since this page began loading), sent with the next startup.
  const t0 = (window.performance && performance.timing && performance.timing.navigationStart) || Date.now();
  const timing = { client_from_cache: false };
  // Data to paint at once: the snapshot built into the page by the server, or the copy saved in
  // this browser last time, whichever is newer. Fresh data follows in the background.
  const embedded = window.__INIT__ || null;
  const saved = readCache();
  const instant = [embedded, saved].filter(Boolean).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
  let waitTimer = null;
  const firstTab = (data) => (data.review.pending.length ? 'review' : 'dashboard');
  if (instant) {
    absorb(instant);
    status('loading');
    await show(firstTab(instant));
    timing.client_from_cache = true;
    timing.client_cached_ms = Date.now() - t0;
  } else {
    // Nothing to show yet: count the seconds, and offer a reload if Google is very slow.
    const began = Date.now();
    const tick = () => {
      const secs = Math.round((Date.now() - began) / 1000);
      setView(secs < 45
        ? `<div class="empty">${esc(T.loading)} ${secs}s</div>`
        : `<div class="card empty error"><b>${esc(T.slowServer)}</b><div class="actions" style="justify-content:center"><button class="btn primary" data-action="reloadpage">${esc(T.reloadPage)}</button></div></div>`);
    };
    tick();
    waitTimer = setInterval(tick, 1000);
  }
  const mine = seq;
  try {
    let lastLoad = null;
    try { lastLoad = JSON.parse(window.localStorage.getItem(TIMING_KEY) || 'null'); } catch (e) { /* none */ }
    const fresh = await call('init', { lastLoad });
    clearInterval(waitTimer);
    writeCache(fresh);
    if (seq !== mine) scheduleRefresh(); // something was saved meanwhile: don't paint over it
    else {
      state.dashByMonth = {};
      absorb(fresh);
      if (!instant) await show(firstTab(fresh)); else repaint();
    }
    timing.client_total_ms = Date.now() - t0;
    try { window.localStorage.setItem(TIMING_KEY, JSON.stringify(timing)); } catch (e) { /* storage unavailable */ }
  } catch (e) {
    clearInterval(waitTimer);
    if (!instant) failed(e); else toast(`${T.error}: ${e.message}`, { kind: 'bad' });
  } finally {
    if (!queue.length) status();
  }
}

// Start right away. This script is the last thing in <body>, so the page it needs is already
// there. Don't wait for DOMContentLoaded: Apps Script writes the page into its frame with
// document.write and may never close the document, so that event never fires (2026-10-06).
if (typeof window !== 'undefined' && !window.__CT_NO_AUTOSTART__) start();
