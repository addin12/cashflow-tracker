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
import { parseStatement, matchStatement } from '../core/statement.js';
import { parseQuick, evalAmount } from '../core/quick.js';
import { interestCompare } from '../core/wealth.js';

const state = {
  boot: null, tab: 'review', month: '', review: null, dashByMonth: {}, all: null, allStale: true,
  filters: { q: '', month: null, stream: '', category: '', status: '', direction: '' },
  limit: 50, addKind: 'out', settings: null, rowsById: new Map(), picked: new Set(), yearly: null,
};
let T = STRINGS.id;

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const locale = () => (state.boot?.lang === 'en' ? 'en-GB' : 'id-ID');
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }); // whole rupiah on screen; the sheet keeps cents
// "Hide amounts" (the eye on the summary): kept in this browser, for looking at the app in public.
const HIDE_KEY = 'cashflow.hide.v1';
let hideAmounts = (() => { try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; } })();
const rp = (n) => (hideAmounts ? 'Rp •••' : `${Number(n) < 0 ? '−' : ''}Rp${fmt.format(Math.abs(Number(n) || 0))}`);
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
const rangeLabel = (a, b) => `${dateLabel(a, { weekday: false })} – ${dateLabel(b, { weekday: false })}`;
const currentMonth = () => state.boot.currentMonth || state.boot.today.slice(0, 7);
const timeLabel = (t) => (t ? String(t).slice(0, 5).replace(':', state.boot?.lang === 'en' ? ':' : '.') : '');
const when = (x) => [dateLabel(x.date), timeLabel(x.time)].filter(Boolean).join(' · ');

// Notion-style tags: a category always gets the same calm tint.
const hashOf = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997; return h % 8; };
function tag(name) {
  if (!name) return `<span class="tag none">${esc(T.noCategory)}</span>`;
  return `<span class="tag c${hashOf(name)}">${esc(name)}</span>`;
}
// A picture per category, found from words in its name (the owner can rename categories freely).
const ICONS = [
  [/pemasukan|income/i, '💰'], [/food|makan|minum|kopi|coffee|resto|jajan/i, '🍜'], [/harian|grocer|sembako/i, '🛒'], [/online|shop/i, '🛍️'],
  [/servis|cuci|kendaraan|bengkel/i, '🔧'], [/transport|bensin|parkir|ojek/i, '🛵'], [/langganan|subscription|digital/i, '📺'],
  [/hobi|game|board/i, '🎲'], [/buku|book/i, '📚'], [/kesehatan|optik|health|obat/i, '💊'], [/skincare|kecantikan|beauty/i, '🧴'],
  [/barber|cukur|salon/i, '💈'], [/tagihan|utilitas|listrik|bill/i, '🧾'], [/pulsa|internet/i, '📱'], [/rumah|house|home/i, '🏠'],
  [/pakaian|baju|cloth/i, '👕'], [/nongkrong|hiburan|entertain/i, '🎬'], [/hadiah|sosial|gift/i, '🎁'], [/iuran|patungan/i, '🤝'],
  [/pendidikan|kursus|educ/i, '🎓'], [/admin|biaya|fee/i, '🏦'], [/gaji|salary/i, '💼'], [/proyek|freelance/i, '💻'],
  [/dividen|bunga|invest|saham/i, '📈'], [/cashback|refund/i, '↩️'], [/penyesuaian|adjust/i, '⚖️'], [/transfer/i, '🔁'], [/lainnya|other/i, '📦'],
];
function icon(category) {
  const found = category && ICONS.find(([re]) => re.test(category));
  return `<span class="cat-ic ${category ? `c${hashOf(category)}` : 'none'}" aria-hidden="true">${found ? found[1] : '•'}</span>`;
}
// A picture per account, from words in its name, else from its type (Saving or Spending). Order matters: "Dana Darurat" is not the DANA wallet.
const ACCT_ICONS = [
  [/darurat|emergency/i, '🛟'], [/saham|sekuritas|stock|reksa|invest|crypto|kripto/i, '📈'], [/cash|tunai|dompet/i, '💵'],
  [/gopay|ovo|\bdana\b|shopeepay|linkaja|e-?wallet|flip/i, '📱'], [/kredit|credit|paylater/i, '💳'],
];
// Bank and wallet logos, loaded from Google's favicon service so no logo artwork lives in the repo.
// A colour = the logo's own background, so a square logo blends into the circle (others sit on white). Order matters: "Mandiri Sekuritas" before Mandiri, "Jago Dana Darurat" before DANA.
const ACCT_LOGOS = [
  [/sekuritas/i, 'mandirisekuritas.co.id', '#163d6e'], [/\bbca\b|klikbca/i, 'mybca.bca.co.id', '#0f63ab'], [/\bblu\b/i, 'blubybcadigital.id'], [/jago/i, 'jago.com', '#ffac00'],
  [/mandiri|livin/i, 'bankmandiri.co.id'], [/\bbni\b/i, 'bni.co.id'], [/\bbri\b|brimo/i, 'bri.co.id'], [/seabank/i, 'seabank.co.id'],
  [/jenius/i, 'jenius.com'], [/gopay/i, 'gopay.co.id'], [/\bovo\b/i, 'ovo.id'], [/(?<!reksa\s)\bdana\b(?!\s*darurat)/i, 'dana.id'],
  [/shopee/i, 'shopee.co.id'], [/bibit/i, 'bibit.id'], [/ajaib/i, 'ajaib.co.id'], [/stockbit/i, 'stockbit.com'],
];
const logoUrl = (domain) => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;
function acctIcon(stream, type) {
  const found = ACCT_ICONS.find(([re]) => re.test(stream));
  const emoji = found ? found[1] : type === 'Saving' ? '🐷' : '🏦';
  const logo = ACCT_LOGOS.find(([re]) => re.test(stream));
  // A logo that fails to load is swapped back to the emoji (see the 'error' listener in start()).
  if (logo) return `<span class="cat-ic logo" aria-hidden="true"${logo[2] ? ` style="background:${logo[2]}"` : ''} data-fallback="${emoji}"><img src="${logoUrl(logo[1])}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return `<span class="cat-ic c${hashOf(stream)}" aria-hidden="true">${emoji}</span>`;
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
  // The page says who opened it (the cached first screen may have been made for the other person).
  state.boot = { ...data.boot, me: window.__ME__ || data.boot.me, lang: state.boot?.lang };
  state.dataAt = data.at; // when Google built this data: newer sync changes mean refresh
  const incoming = data.incoming || [];
  if (state.incomingIds) {
    const fresh = incoming.filter((x) => !state.incomingIds.has(String(x.id)));
    if (fresh.length) toast(T.newRows(fresh.length, `${fresh[0].description} ${fresh[0].direction === 'in' ? '+' : '−'}${rp(fresh[0].amount)}`));
  }
  state.incomingIds = new Set([...(state.incomingIds || []), ...incoming.map((x) => String(x.id))]);
  applyLanguage(state.boot.language);
  if (!state.month) state.month = data.boot.currentMonth || data.boot.today.slice(0, 7);
  state.review = data.review;
  remember([...data.review.pending, ...data.review.recentAuto]);
  if (!state.who) state.dashByMonth[data.dashboard.month] = data.dashboard;
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
  const n = state.review ? state.review.pending.length + (state.review.salary || []).length : 0;
  const count = $('#reviewCount');
  if (count) { count.hidden = !n; count.textContent = String(n); count.setAttribute('aria-label', T.pendingNote(n)); }
  const owner = $('#brandOwner');
  if (owner && state.boot) owner.textContent = state.boot.owner || '';
  const foot = $('#navSync');
  if (foot && state.boot) foot.innerHTML = syncLine();
  updateBell();
}

// ---------------------------------------------------------------- Review
function viewReview() {
  const r = state.review;
  if (!r) return skeleton(T.reviewTitle);
  const n = r.pending.length + (r.salary || []).length;
  // Salary: no email reports it, so each payday without one asks for the amount.
  const salary = (r.salary || []).map((x) => `
    <article class="card txcard salary-card" data-id="salary:${esc(x.month)}" data-month="${esc(x.month)}" data-date="${esc(x.date)}">
      <div class="top"><div class="name">${esc(T.salaryTitle(dateLabel(x.date, { weekday: false })))}</div>${x.amount ? `<div class="amt in">+${rp(x.amount)}</div>` : ''}</div>
      <div class="meta">${esc(T.salaryMeta)}</div>
      <div class="fields2">
        ${field(T.amountRp, `<input class="amount-input" data-field="amount" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${esc(x.amount || '')}">`, { help: T.salaryAmountHelp })}
        ${field(T.account, `<select data-field="stream">${accountOptions(x.stream)}</select>`)}
      </div>
      <div class="actions fill"><button class="btn secondary" data-action="salaryskip">${esc(T.salarySkip)}</button><button class="btn primary" data-action="salarysave">${esc(T.salarySave)}</button></div>
    </article>`).join('');
  const cards = r.pending.map((x) => `
    <article class="card txcard" data-id="${esc(x.id)}">
      <div class="top"><div class="name">${esc(x.description || x.details || '—')}</div><div class="amt ${esc(x.direction)}">${signed(x)}</div></div>
      <div class="meta">${esc(when(x))} · ${esc(x.stream || T.noAccount)}${x.details && x.description ? ` · ${esc(x.details)}` : ''}${otherOwner(x)}${firstBadge(x)}</div>
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
      <section class="stack" aria-label="${esc(T.reviewTitle)}">${dayCard(r.day)}${salary}${cards || (salary ? '' : empty)}</section>
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

function takeSalary(month) {
  const x = (state.review.salary || []).find((y) => y.month === month);
  state.review.salary = (state.review.salary || []).filter((y) => y.month !== month);
  leaveReview(new Set([`salary:${month}`]));
  state.dashByMonth = {};
  return x;
}
function putSalaryBack(x) {
  if (!x) return;
  state.review.salary = [...(state.review.salary || []), x].sort((a, b) => a.month.localeCompare(b.month));
  updateNav();
  if (state.tab === 'review') keepInputs(viewReview);
}
function saveSalary(card) {
  const month = card.dataset.month;
  const amountEl = $('[data-field=amount]', card);
  const streamEl = $('[data-field=stream]', card);
  const amount = Number(amountEl.value);
  const stream = streamEl.value;
  let ok = fieldMessage(amountEl, amount > 0 ? '' : T.errAmount);
  ok = fieldMessage(streamEl, stream ? '' : T.errNoAccount) && ok;
  if (!ok) { (amount > 0 ? streamEl : amountEl).focus(); return null; }
  const x = takeSalary(month);
  toast(T.salarySaved(rp(amount)));
  return save('recordSalary', { month, amount, stream, date: card.dataset.date })
    .then((r) => {
      state.dashByMonth = {}; state.allStale = true;
      if (r.openingChange) toast(T.salaryOpening(stream, rp(-r.openingChange)));
    })
    .catch((e) => { putSalaryBack(x); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}
function skipSalary(card) {
  const month = card.dataset.month;
  const x = takeSalary(month);
  toast(T.salarySkipped, { undo: () => { putSalaryBack(x); save('unskipSalary', { month }).catch(() => {}); } });
  return save('skipSalary', { month }).catch((e) => { putSalaryBack(x); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}

/** "Not a subscription": gone from the card at once, kept out on the server. */
function hideRecurring(name) {
  const strip = (d) => {
    if (!d || !d.recurring) return;
    d.recurring.items = d.recurring.items.filter((i) => i.name !== name);
    d.recurring.monthlyTotal = Math.round(d.recurring.items.reduce((a, i) => a + i.amount, 0) * 100) / 100;
  };
  Object.values(state.dashByMonth).forEach(strip);
  if (state.tab === 'dashboard') viewDashboard();
  updateBell();
  toast(T.recurringHidden(name), { undo: () => { save('unhideRecurring', { name }).then(() => { state.dashByMonth = {}; if (state.tab === 'dashboard') viewDashboard(); }).catch(() => {}); } });
  return save('hideRecurring', { name }).catch((e) => { state.dashByMonth = {}; toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}

/** Empty budget fields get the suggestion (average spending); nothing is saved until "Save budgets". */
function fillBudgets(form) {
  const tips = new Map((state.settings.budgetSuggestions || []).map((b) => [b.category, b.amount]));
  let n = 0;
  $$('[data-b]', form).forEach((i) => {
    if (!(Number(i.value) > 0) && tips.has(i.dataset.b)) { i.value = String(tips.get(i.dataset.b)); n += 1; }
  });
  const st = $('.state', form);
  st.className = 'state'; st.textContent = T.budgetsFilled(n);
  return null;
}

// ---------------------------------------------------------------- Dashboard
// Two views of one month: the overview (today, where the money went, the latest rows) and the
// report (money out, a calendar of daily spending, the running total against last month, a donut).
async function viewDashboard() {
  let d = state.dashByMonth[state.month];
  if (!d) {
    skeleton(T.tabDashboard);
    d = await call('dashboard', { month: state.month, owner: state.who || '' });
    state.dashByMonth[d.month] = d;
    if (state.tab !== 'dashboard' || d.month !== state.month) return;
  }
  remember([...(d.today || []), ...(d.recent || [])]);
  const s = d.summary;
  const current = currentMonth();
  const prev = monthAdd(d.month, -1);
  const next = monthAdd(d.month, 1);
  const report = state.dashView === 'report';
  // The year view: one request per year, fetched again whenever the month data was.
  const yr = Number(d.month.slice(0, 4));
  if (report && state.reportYearly && !(state.yearly && state.yearly.forDash === d && state.yearly.data.year === yr)) {
    skeleton(T.tabDashboard);
    state.yearly = { forDash: d, data: await call('yearly', { year: yr }) };
    if (state.tab !== 'dashboard' || state.dashView !== 'report') return;
  }
  const viewBtn = (v, label) => `<button type="button" class="${(v === 'report') === report ? 'on' : ''}" aria-pressed="${(v === 'report') === report}" data-action="dashview" data-view="${v}">${esc(label)}</button>`;
  setView(`
    <header class="page-head"><div><h1>${esc(T.tabDashboard)}</h1><p class="sub">${esc(monthLabel(d.month))}${s.from ? ` · ${esc(rangeLabel(s.from, s.to))}` : ''}</p></div>
      <div class="tools">${whoSeg()}
        <div class="seg">${viewBtn('overview', T.viewOverview)}${viewBtn('report', T.viewReport)}</div>
        <div class="monthnav">
          <button class="btn secondary small" data-action="setmonth" data-month="${prev}" aria-label="${esc(monthLabel(prev))}">‹ ${esc(monthShort(prev))}</button>
          <button class="btn secondary small" data-action="setmonth" data-month="${next}" aria-label="${esc(monthLabel(next))}" ${next > current ? 'disabled' : ''}>${esc(monthShort(next))} ›</button>
        </div></div></header>
    ${report ? `<div class="seg report-seg">${[['month', T.reportMonthly], ['year', T.reportYearly]].map(([v, l]) => `<button type="button" class="${(v === 'year') === !!state.reportYearly ? 'on' : ''}" aria-pressed="${(v === 'year') === !!state.reportYearly}" data-action="reportmode" data-mode="${v}">${esc(l)}</button>`).join('')}</div>${state.reportYearly ? yearlyHtml(state.yearly.data) : reportHtml(d)}` : overviewHtml(d)}`);
}

/** Total balance, then what is free and what is set aside for savings goals. */
function walletLine(d) {
  const total = (d.balances || []).reduce((t, b) => t + b.balance, 0);
  const goals = (d.goals || []).reduce((t, g) => t + Math.min(g.saved, g.target), 0);
  return `<div class="wallet-total">${bigRp(total, 'lg')}<p class="muted">${esc(goals > 0 ? T.walletSplit(rp(total - goals), rp(goals)) : T.walletTotal)}</p></div>`;
}

/** Day number of today inside the month's dates (the whole month for a past one). */
function dayOfPeriod(d) {
  const days = d.daily || [];
  const i = days.findIndex((x) => x.date === state.boot.today);
  return i >= 0 ? i + 1 : days.length;
}
const monthName = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'long' });
const bigRp = (n, cls = '') => `<span class="big-num ${cls}"><span class="cur">Rp</span>${hideAmounts ? '•••' : fmt.format(Math.round(Number(n) || 0))}</span>`;
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

/** One transaction as a list line: icon, name, when · category · account, amount. */
const lineRow = (x) => `<button class="lrow" data-action="edit" data-id="${esc(x.id)}">${icon(x.category)}
  <span class="what"><b>${esc(x.description || x.details || '—')}</b><span class="meta">${esc([`${dateLabel(x.date, { weekday: false })}${x.time ? `, ${timeLabel(x.time)}` : ''}`, x.category || T.noCategory, x.stream].filter(Boolean).join(' · '))}${firstBadge(x)}</span></span>
  <span class="amt ${esc(x.direction)}">${signed(x)}</span></button>`;

function overviewHtml(d) {
  const s = d.summary;
  const isNow = d.month === currentMonth();
  const today = d.today || [];
  const todayTotal = today.reduce((a, x) => a + x.amount, 0);
  const days = d.daily || [];
  const idx = dayOfPeriod(d);
  const elapsed = isNow && days.length ? idx / days.length : 1;
  const prevName = monthName(monthAdd(d.month, -1));
  // Last month up to the same day, for "Rp… more than September".
  const prevSame = (d.prevDaily || []).slice(0, idx).reduce((a, x) => a + x.amount, 0);
  const diff = s.expense - prevSame;
  const bills = d.bills || ((d.recurring && d.recurring.items) || []).filter((i) => i.daysLeft >= 0 && i.daysLeft <= 7);
  const hour = new Date().getHours();
  const greet = hour < 11 ? T.greetMorning : hour < 15 ? T.greetNoon : hour < 18 ? T.greetAfternoon : T.greetEvening;
  const chips = [
    d.pendingCount ? `<button class="hchip warn" data-action="go" data-tab="review">⚠ ${esc(T.pendingNote(d.pendingCount))}</button>` : '',
    (d.salaryMissing || []).length ? `<button class="hchip warn" data-action="go" data-tab="review">💼 ${esc(T.salaryNotice(dateLabel(d.salaryMissing[0].date, { weekday: false })))}</button>` : '',
    bills.length ? `<button class="hchip" data-action="bills">📅 ${esc(T.billsThisWeek(bills.length))}</button>` : '',
  ].join('');
  const todayLong = new Date(`${state.boot.today}T00:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const hero = isNow ? `<section class="hero">
      <div class="hero-top"><h2>${esc(greet)}</h2>
        <button class="icon-btn" data-action="hide" aria-pressed="${hideAmounts}" aria-label="${esc(hideAmounts ? T.showAmounts : T.hideAmounts)}" title="${esc(hideAmounts ? T.showAmounts : T.hideAmounts)}">${hideAmounts ? EYE_OFF : EYE}</button></div>
      <p class="hero-date">${esc(T.todayIs(todayLong))}</p>
      <button class="hero-num" data-action="drillday" data-date="${esc(state.boot.today)}" aria-label="${esc(T.paymentsToday(today.length))}">${bigRp(todayTotal, 'xl')}</button>
      <p class="hero-sub">${esc(T.paymentsToday(today.length))}</p>
      ${chips ? `<div class="hchips">${chips}</div>` : ''}
    </section>` : '';

  // Where it went: every spending category, against its budget (with a "how far into the month" marker).
  const budgets = new Map(d.budgets.map((b) => [b.category, b]));
  const spent = s.byCategory.filter((c) => c.kind !== 'income');
  for (const b of d.budgets) if (!spent.some((c) => c.category === b.category)) spent.push({ category: b.category, kind: 'expense', amount: 0 });
  spent.sort((a, b) => b.amount - a.amount);
  const top = Math.max(1, ...spent.map((c) => c.amount));
  const catRows = spent.map((c) => {
    const b = budgets.get(c.category);
    const over = b && b.ratio > 1;
    const ahead = b && !over && isNow && b.ratio > elapsed + 0.05;
    const pct = Math.min(100, Math.round((b ? b.ratio : c.amount / top) * 100));
    return `<button class="cat-row" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}
      <span class="cat-main"><span class="cat-top"><b>${esc(c.category)}</b><span class="amt ${over ? 'bad' : ''}">${rp(c.amount)}</span></span>
        <span class="bar ${b ? '' : 'plain'}" ${b ? `role="img" aria-label="${esc(T.budgetUse(Math.round(b.ratio * 100)))}"` : ''}><i class="${over ? 'over' : ahead ? 'ahead' : ''}" style="width:${pct}%"></i>${b && isNow ? `<em style="left:${Math.round(elapsed * 100)}%"></em>` : ''}</span>
        ${b ? `<span class="budget-note ${over ? 'over' : ahead ? 'ahead' : ''}">${esc(over ? T.overBudget(rp(b.spent - b.budget), rp(b.budget)) : T.ofBudget(rp(b.budget), rp(b.budget - b.spent)))}${ahead ? ` · ${esc(T.aheadOfPace)}` : ''}</span>` : ''}
      </span></button>`;
  }).join('');
  const totalBudget = d.budgets.reduce((a, b) => a + b.budget, 0);
  const inBudgets = d.budgets.reduce((a, b) => a + b.spent, 0);
  const daysLeft = Math.max(1, days.length - idx + 1);
  const foot = totalBudget ? `<div class="budget-foot">
      <span class="bar total"><i class="${inBudgets > totalBudget ? 'over' : ''}" style="width:${Math.min(100, Math.round((inBudgets / totalBudget) * 100))}%"></i>${isNow ? `<em style="left:${Math.round(elapsed * 100)}%"></em>` : ''}</span>
      <p><b>${esc(inBudgets > totalBudget ? T.budgetOverLine(rp(inBudgets - totalBudget)) : isNow ? T.budgetLeftLine(rp(totalBudget - inBudgets), rp((totalBudget - inBudgets) / daysLeft), daysLeft) : T.budgetLeftEnd(rp(totalBudget - inBudgets)))}</b></p>
      ${s.expense - inBudgets > 0 ? `<p class="muted">${esc(T.outsideBudgets(rp(s.expense - inBudgets)))}</p>` : ''}
      ${isNow && idx > 2 ? `<p class="muted">${esc(T.onPace(rp((s.expense / idx) * days.length)))}</p>` : ''}
    </div>` : `<p class="hint"><button class="link" data-action="go" data-tab="settings" data-section="budgets">${esc(T.noBudgetsSet)}</button></p>`;

  const incomeRows = s.byCategory.filter((c) => c.kind === 'income').sort((a, b) => b.amount - a.amount).map((c) => `
    <button class="lrow" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}<span class="what"><b>${esc(c.category)}</b></span><span class="amt in">+${rp(c.amount)}</span></button>`).join('');
  const group = (type, title) => {
    const list = d.balances.filter((b) => b.type === type);
    if (!list.length) return '';
    const total = list.reduce((a, b) => a + b.balance, 0);
    return `<div class="rowi total-row"><span>${esc(title)}</span><span class="amt">${rp(total)}</span></div>${list.map((b) => `
      <button class="lrow" data-action="drill" data-stream="${esc(b.stream)}">${acctIcon(b.stream, b.type)}<span class="what"><b>${esc(b.stream)}</b></span><span class="amt">${rp(b.balance)}</span></button>`).join('')}`;
  };
  const todayCard = isNow ? `<section class="card today-card">
      <p class="eyebrow">${esc(T.todayIs(dateLabel(state.boot.today)))}</p>
      <h2>${esc(today.length ? T.todayLine(today.length, rp(todayTotal)) : T.noPaymentsToday)}</h2>
      ${today.length ? `<div class="rows">${today.slice(0, 3).map(lineRow).join('')}</div>${today.length > 3 ? `<button class="link" data-action="drillday" data-date="${esc(state.boot.today)}">${esc(T.moreN(today.length - 3))}</button>` : ''}` : ''}
    </section>` : '';
  return `${hero}
    <div class="ov-grid">
      <div class="stack">
        <section class="spend">
          <p class="k">${esc(T.monthSpending(monthName(d.month), isNow ? idx : 0))}</p>
          <button class="hero-num" data-action="drill" data-direction="out">${bigRp(s.expense, 'lg')}</button>
          ${prevSame > 0 ? `<p class="cmp ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '↑' : '↓'} ${esc(diff > 0 ? T.moreThan(rp(diff), prevName) : T.lessThan(rp(-diff), prevName))}</p>` : ''}
          <div class="mini-stats">
            <button data-action="drill" data-direction="in"><span>${esc(T.income)}</span><b class="amt in">+${rp(s.income)}</b></button>
            <button data-action="drill"><span>${esc(T.netThisMonth)}</span><b class="amt ${s.balance < 0 ? 'bad' : ''}">${s.balance < 0 ? '' : '+'}${rp(s.balance)}</b></button>
            ${isNow ? `<div><span>${esc(T.perDay)}</span><b class="amt">${rp(d.perDay.perDay)}</b><small>${esc(T.daysToPayday(d.perDay.daysLeft, dateLabel(d.perDay.nextPayday, { weekday: false })))}</small></div>` : ''}
          </div>
          ${isNow && d.perDay.spending < 0 ? `<p><button class="link" data-action="go" data-tab="settings" data-section="accounts">⚠ ${esc(T.negativeSpending)}</button></p>` : ''}
        </section>
        <section><h2 class="section-title">${esc(T.whereItWent)}<small>${esc(T.expenseByCategoryHint)}</small></h2>
          <div class="card list-card">${catRows || `<p class="hint">${esc(T.nothingYet)}</p>`}${foot}</div></section>
        ${(d.recent || []).length ? `<section><h2 class="section-title row-title">${esc(T.latestTitle)}<button class="link" data-action="go" data-tab="transactions">${esc(T.seeAll)}</button></h2>
          <div class="card list-card">${d.recent.map(lineRow).join('')}</div></section>` : ''}
      </div>
      <div class="stack">
        ${todayCard}
        ${owedCard(d.owed)}
        ${incomeRows ? `<section class="card"><h2>${esc(T.incomeByCategory)}</h2><div class="rows">${incomeRows}</div></section>` : ''}
        ${goalsCard(d.goals)}
        ${recurringCard(d.recurring)}
        ${eventsCard(d.events)}
        ${cardsCard(d.cards)}
        ${healthCard(d.health)}
        ${wealthCard(d.wealth)}
        <section class="card"><h2>${esc(T.accounts)}</h2>${walletLine(d)}<p class="lead">${esc(T.accountsHint)}</p><div class="rows">${group('Spending', T.spendingGroup)}${group('Saving', T.savingGroup)}</div></section>
      </div>
    </div>`;
}

function reportHtml(d) {
  const s = d.summary;
  const days = d.daily || [];
  const prevDays = d.prevDaily || [];
  const idx = Math.max(1, dayOfPeriod(d));
  const today = state.boot.today;
  // Calendar: Monday first, one cell per day, darker = more spent.
  const max = Math.max(1, ...days.map((x) => x.amount));
  const lead = days.length ? (new Date(`${days[0].date}T00:00:00`).getDay() + 6) % 7 : 0;
  const weekdays = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  const cells = `${'<span class="hm-cell blank" aria-hidden="true"></span>'.repeat(lead)}${days.map((x) => {
    const future = x.date > today;
    const lvl = x.amount > 0 ? Math.min(4, 1 + Math.floor((x.amount / max) * 3.999)) : 0;
    return `<button class="hm-cell l${lvl}${future ? ' future' : ''}${x.date === today ? ' today' : ''}" data-action="drillday" data-date="${x.date}" ${future ? 'disabled' : ''} aria-label="${esc(`${dateLabel(x.date)}: ${rp(x.amount)}`)}" title="${esc(`${dateLabel(x.date)}: ${rp(x.amount)}`)}">${Number(x.date.slice(8))}</button>`;
  }).join('')}`;
  // Running total this month against last month.
  const run = (list) => { let t = 0; return list.map((x) => { t += x.amount; return t; }); };
  const a = run(days).slice(0, d.month === currentMonth() ? idx : days.length);
  const b = run(prevDays);
  const n = Math.max(days.length, prevDays.length, 2);
  const top = Math.max(1, ...a, ...b);
  const W = 600; const H = 180;
  const path = (list) => list.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * W).toFixed(1)},${(H - (v / top) * (H - 10)).toFixed(1)}`).join(' ');
  const lastA = a.length ? a[a.length - 1] : 0;
  const lastB = b.length ? b[b.length - 1] : 0;
  const prevName = monthName(monthAdd(d.month, -1));
  const line = `<svg class="line-chart" viewBox="0 0 ${W} ${H + 4}" preserveAspectRatio="none" role="img" aria-label="${esc(`${monthName(d.month)} ${rp(lastA)}, ${prevName} ${rp(lastB)}`)}">
      ${b.length ? `<path class="prev" d="${path(b)}"/>` : ''}${a.length ? `<path class="now-fill" d="${path(a)} L${(((a.length - 1) / (n - 1)) * W).toFixed(1)},${H} L0,${H} Z"/><path class="now" d="${path(a)}"/>` : ''}
    </svg>`;
  const cats = s.byCategory.filter((c) => c.kind !== 'income').sort((x, y) => y.amount - x.amount);
  const trend = d.trend || [];
  const tTop = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));
  const chart = trend.map((t) => `
    <button class="m ${t.month === d.month ? 'on' : ''}" data-action="setmonth" data-month="${t.month}" aria-label="${esc(`${monthLabel(t.month)}: ${T.income} ${rp(t.income)}, ${T.expense} ${rp(t.expense)}`)}">
      <span class="bars"><i class="in" style="height:${Math.round((t.income / tTop) * 100)}%"></i><i class="out" style="height:${Math.round((t.expense / tTop) * 100)}%"></i></span>
      <span>${esc(monthShort(t.month))}</span></button>`).join('');
  return `<div class="ov-grid">
    <div class="stack">
      <section class="spend"><p class="k">${esc(T.moneyOut)}</p><button class="hero-num" data-action="drill" data-direction="out">${bigRp(s.expense, 'lg')}</button>
        <p class="muted">${esc(T.ofIncome(rp(s.income), rp(s.balance)))}</p></section>
      <section class="card"><h2>${esc(T.dailyTrend)}</h2><p class="lead">${esc(T.avgPerDay(rp(s.expense / idx)))}</p>
        <div class="hm-grid">${weekdays.map((w) => `<span class="hm-wd">${esc(w)}</span>`).join('')}${cells}</div>
        <div class="hm-legend"><span>${esc(T.heatLess)}</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>${esc(T.heatMore)}</span></div></section>
      <section class="card"><h2>${esc(T.spendTrend)}</h2><p class="lead">${esc(T.spendTrendHint)}</p>${line}
        <div class="legend"><span><i class="out-now"></i>${esc(monthName(d.month))} ${rp(lastA)}</span>${b.length ? `<span><i class="out-prev"></i>${esc(prevName)} ${rp(lastB)}</span>` : ''}</div></section>
      ${flowCard(d.flow, d)}
    </div>
    <div class="stack">
      ${donutCard(cats, (v) => T.perDayShort(rp(v / idx)))}
      ${patternCard(d.pattern)}
      ${tagsCard(d.tags)}
      ${placesCard(d.places)}
      ${biggestCard(d.biggest)}
      ${trend.length ? `<section class="card"><h2>${esc(T.trendTitle)}</h2><p class="lead">${esc(T.trendHint)}</p><div class="chart">${chart}</div></section>` : ''}
    </div>
  </div>`;
}


/** Donut and list of spending categories; `per` labels each row's average (per day or per month). */
function donutCard(cats, per, title = T.whereItWent) {
  const total = cats.reduce((t, c) => t + c.amount, 0);
  let at = 0;
  const stops = cats.map((c, i) => { const from = at; at += total ? (c.amount / total) * 100 : 0; return `var(--ch${i % 8}) ${from.toFixed(2)}% ${at.toFixed(2)}%`; }).join(', ');
  const list = cats.map((c, i) => `<button class="lrow" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}
      <span class="what"><b><i class="dot" style="background:var(--ch${i % 8})"></i>${esc(c.category)}</b><span class="meta">${esc(`${total ? Math.round((c.amount / total) * 100) : 0}% · ${per(c.amount)}`)}</span></span>
      <span class="amt">${rp(c.amount)}</span></button>`).join('');
  return `<section class="card"><h2>${esc(title)}</h2><p class="lead">${esc(T.donutHint)}</p>
    ${total ? `<div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="${esc(`${T.moneyOut} ${rp(total)}`)}"><div><span>${esc(T.moneyOut)}</span><b>${rp(total)}</b><small>${esc(T.nCats(cats.length))}</small></div></div>
    <div class="rows">${list}</div>` : `<p class="hint">${esc(T.nothingYet)}</p>`}</section>`;
}

/** Top places (by transaction name) and the biggest single payments. */
function placesCard(places) {
  if (!places || !places.length) return '';
  return `<section class="card"><h2>${esc(T.topPlaces)}</h2><p class="lead">${esc(T.topPlacesHint)}</p><div class="rows">${places.map((p, i) => `
    <button class="lrow" data-action="drill" data-q="${esc(p.name)}"><span class="rank">${i + 1}</span><span class="what"><b>${esc(p.name)}</b><span class="meta">${esc(`${p.count}× · ${p.category}`)}</span></span><span class="amt">${rp(p.total)}</span></button>`).join('')}</div></section>`;
}
function biggestCard(list) {
  if (!list || !list.length) return '';
  remember(list);
  return `<section class="card"><h2>${esc(T.biggestTitle)}</h2><p class="lead">${esc(T.biggestHint)}</p><div class="rows">${list.map(lineRow).join('')}</div></section>`;
}

/**
 * Where the money moved this month: income into accounts, transfers between them (a saving
 * account is "saved"), and what was spent from each.
 */
function flowCard(flow, d) {
  if (!flow || (!flow.income.length && !flow.transfers.length && !flow.spent.length)) return '';
  const type = new Map((d.balances || []).map((b) => [b.stream, b.type]));
  const income = new Map(flow.income.map((x) => [x.stream, x.amount]));
  const spent = new Map(flow.spent.map((x) => [x.stream, x.amount]));
  const inFrom = new Map();
  for (const t of flow.transfers) inFrom.set(t.to, (inFrom.get(t.to) || 0) + t.amount);
  const order = [...new Set([...flow.income.map((x) => x.stream), ...flow.transfers.map((t) => t.from), ...flow.transfers.map((t) => t.to), ...flow.spent.map((x) => x.stream)])];
  const totalIn = flow.income.reduce((t, x) => t + x.amount, 0);
  const node = (stream) => {
    const kids = [
      ...flow.transfers.filter((t) => t.from === stream).map((t) => `<li><span class="flow-tag ${type.get(t.to) === 'Saving' ? 'save' : ''}">${esc(type.get(t.to) === 'Saving' ? T.flowSave : T.flowMove)}</span><span>→ ${esc(t.to)}</span><b class="amt">${rp(t.amount)}</b></li>`),
      spent.get(stream) ? `<li><span class="flow-tag spend">${esc(T.flowSpend)}</span><button class="link" data-action="drill" data-stream="${esc(stream)}">${esc(T.flowSpentFrom(stream))}</button><b class="amt">${rp(spent.get(stream))}</b></li>` : '',
    ].filter(Boolean);
    const got = [income.get(stream) ? T.flowIncome(rp(income.get(stream))) : '', inFrom.get(stream) ? T.flowFrom(rp(inFrom.get(stream))) : ''].filter(Boolean).join(' · ');
    return `<div class="flow-node"><div class="flow-acct">${acctIcon(stream)}<b>${esc(stream)}</b>${got ? `<small>${esc(got)}</small>` : ''}</div>${kids.length ? `<ul>${kids.join('')}</ul>` : ''}</div>`;
  };
  return `<section class="card"><h2>${esc(T.flowTitle)}</h2><p class="lead">${esc(T.flowHint)}</p>
    <div class="flow"><div class="flow-root"><span class="flow-in" aria-hidden="true">↓</span><b>${esc(T.flowMoneyIn)}</b><span class="amt in">+${rp(totalIn)}</span></div>
    ${order.map(node).join('')}</div></section>`;
}

/** A year month by month: bars split by the biggest categories, a category × month grid, places. */
function yearlyHtml(y) {
  const nowMonth = state.boot.today.slice(0, 7);
  const months = y.months.filter((m) => m.month <= nowMonth || m.expense || m.income);
  const shown = months.filter((m) => m.expense || m.income);
  const totalOut = months.reduce((t, m) => t + m.expense, 0);
  const totalIn = months.reduce((t, m) => t + m.income, 0);
  const byCat = new Map();
  for (const m of y.months) for (const [c, v] of Object.entries(m.byCategory)) byCat.set(c, (byCat.get(c) || 0) + v);
  const cats = [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  const top = cats.slice(0, 4).map((c) => c.category);
  const max = Math.max(1, ...y.months.map((m) => m.expense));
  const avg = shown.length ? totalOut / shown.length : 0;
  const bars = y.months.map((m) => {
    const other = m.expense - top.reduce((t, c) => t + (m.byCategory[c] || 0), 0);
    const segs = [...top.map((c, i) => [m.byCategory[c] || 0, `var(--ch${i})`]), [other, 'var(--ch7)']].filter(([v]) => v > 0)
      .map(([v, color]) => `<i style="height:${((v / max) * 100).toFixed(1)}%;background:${color}"></i>`).join('');
    return `<button class="m ${m.month === nowMonth ? 'on' : ''}" data-action="yearmonth" data-month="${m.month}" ${m.month > nowMonth ? 'disabled' : ''} aria-label="${esc(`${monthLabel(m.month)}: ${rp(m.expense)}`)}"><span class="stack-bar">${segs}</span><span>${esc(monthShort(m.month))}</span></button>`;
  }).join('');
  const legend = [...top.map((c, i) => [c, `var(--ch${i})`]), [T.otherCats, 'var(--ch7)']].map(([c, color]) => `<span><i style="background:${color}"></i>${esc(c)}</span>`).join('');
  // The grid shows the months since the start date (up to now), so it fits a phone.
  const first = String(state.boot.start || '').slice(0, 7);
  const gridMonths = y.months.filter((m) => (!first || m.month >= first) && m.month <= nowMonth);
  const gridCats = cats.slice(0, 8);
  const grid = gridCats.map((c) => {
    const rowMax = Math.max(1, ...gridMonths.map((m) => m.byCategory[c.category] || 0));
    return `<button class="ct-row" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}<span class="ct-name">${esc(c.category)}</span>${gridMonths.map((m) => {
      const v = m.byCategory[c.category] || 0;
      const lvl = v > 0 ? Math.min(4, 1 + Math.floor((v / rowMax) * 3.999)) : 0;
      return `<i class="hm-dot l${lvl}" title="${esc(`${monthShort(m.month)}: ${rp(v)}`)}"></i>`;
    }).join('')}<span class="amt">${rp(c.amount)}</span></button>`;
  }).join('');
  return `<div class="ov-grid">
    <div class="stack">
      <section class="spend"><p class="k">${esc(T.moneyOutYear(shown.length ? `${monthShort(shown[0].month)}–${monthShort(shown[shown.length - 1].month)}` : String(y.year)))}</p>${bigRp(totalOut, 'lg')}
        <p class="muted">${esc(T.ofIncome(rp(totalIn), rp(totalIn - totalOut)))}</p></section>
      <section class="card"><h2>${esc(T.monthlyTrend)}</h2><p class="lead">${esc(T.monthlyTrendHint(rp(avg)))}</p>
        <div class="chart year-chart">${avg ? `<span class="avg-line" style="bottom:calc(${((avg / max) * 100).toFixed(1)}% * 0.82 + 30px)"></span>` : ''}${bars}</div>
        <div class="legend">${legend}</div></section>
      ${grid ? `<section class="card"><h2>${esc(T.catsOverTime)}</h2><p class="lead">${esc(T.catsOverTimeHint)}</p>
        <div class="ct-grid" style="--n:${gridMonths.length}"><div class="ct-head"><span></span><span></span>${gridMonths.map((m) => `<span>${esc(monthShort(m.month).slice(0, 3))}</span>`).join('')}<span></span></div>${grid}</div></section>` : ''}
    </div>
    <div class="stack">
      ${donutCard(cats, (v) => T.perMonthShort(rp(v / Math.max(1, shown.length))))}
      ${patternCard(y.pattern)}
      ${tagsCard(y.tags)}
      ${placesCard(y.places)}
      ${biggestCard(y.biggest)}
      ${sptCard(y.year)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Statement import
/** The import section: the account, the file, then the rows to add (the ones already in the app are skipped). */
function importForm(s) {
  const def = s.salaryStream || (s.accounts[0] && s.accounts[0].stream) || '';
  const hist = (s.imports || []).map((h) => `<div class="rowi"><span class="what"><b>${esc(T.importDone(h.count, h.stream))}</b><span class="meta">${esc([h.file, new Date(h.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · '))}</span></span>
    <button class="btn secondary small" type="button" data-action="undoimport" data-batch="${esc(h.batch)}">${esc(T.undo)}</button></div>`).join('');
  return `<form class="card" data-form="import" novalidate><h2>${esc(T.importTitle)}</h2><p class="lead">${esc(T.importHint)}</p>
    <div class="fields2">
      ${field(T.account, `<select name="stream">${accountOptions(def, '')}</select>`)}
      ${field(T.importFile, '<input name="statement" type="file" accept=".csv,text/csv,text/plain">', { help: T.importFileHelp })}
    </div>
    <details class="howto"><summary>${esc(T.importHowTo)}</summary><ol>${T.importSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>
    <div id="impReview" role="status"></div>
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit" disabled>${esc(T.importSave(0))}</button></div></form>
    ${hist ? `<section class="card"><h2>${esc(T.importHistory)}</h2><p class="lead">${esc(T.importHistoryHint)}</p><div class="rows">${hist}</div></section>` : ''}`;
}

/** Category for a statement row from the automatic rules (only rules that file by themselves). */
function ruleCategory(description) {
  for (const r of (state.settings && state.settings.rules) || []) {
    if (!(r.auto_approve === true || r.auto_approve === 'TRUE')) continue;
    const c = compileRule(r);
    if (c.re && c.re.test(description)) return r.category;
  }
  return '';
}

async function readStatement(form) {
  const input = form.querySelector('[name=statement]');
  const box = $('#impReview');
  const btn = form.querySelector('button[type=submit]');
  const file = input.files && input.files[0];
  state.importRows = null;
  btn.disabled = true;
  if (!file) { box.innerHTML = ''; return; }
  box.innerHTML = `<p class="hint">${esc(T.loading)}</p>`;
  try {
    // file.text() is missing in older phone browsers.
    const text = file.text ? await file.text() : await new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsText(file); });
    const parsed = parseStatement(text);
    if (!state.all || state.allStale) setAll((await call('list', { limit: 1000000 })).rows);
    const stream = form.querySelector('[name=stream]').value;
    const rows = matchStatement(parsed.rows, state.all, { stream }).map((r) => ({ ...r, category: r.matchId ? '' : ruleCategory(r.description) }));
    state.importRows = { file: file.name, stream, rows };
    renderImport(form);
  } catch (e) {
    box.innerHTML = `<p class="hint bad">${esc(T.importFailed(e.message))}</p>`;
  }
}

function renderImport(form) {
  const box = $('#impReview');
  const btn = form.querySelector('button[type=submit]');
  const imp = state.importRows;
  if (!imp) return;
  const fresh = imp.rows.filter((r) => !r.matchId);
  const known = imp.rows.length - fresh.length;
  const c = state.boot.categories;
  const opts = (dir, sel) => `<option value="">${esc(T.importLater)}</option>${(dir === 'in' ? [...c.income, ...c.fixed] : [...c.expense, ...c.fixed]).map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('')}`;
  box.innerHTML = `<p class="imp-sum"><b>${esc(T.importRead(imp.rows.length))}</b> · ${esc(T.importKnown(known))} · <b>${esc(T.importNew(fresh.length))}</b></p>
    ${fresh.length ? `<div class="imp-list">${imp.rows.map((r, i) => (r.matchId ? '' : `<div class="imp-row" data-i="${i}">
      <label class="check"><input type="checkbox" data-imp="on" checked><span><b>${esc(r.description || '—')}</b><small>${esc(dateLabel(r.date))}</small></span></label>
      <span class="amt ${r.direction}">${r.direction === 'in' ? '+' : '−'}${rp(r.amount)}</span>
      <select data-imp="category" aria-label="${esc(T.category)}">${opts(r.direction, r.category)}</select></div>`)).join('')}</div>
      <p class="hint">${esc(T.importNote)}</p>` : `<p class="hint">${esc(T.importNothingNew)}</p>`}`;
  const n = fresh.length;
  btn.disabled = !n;
  btn.textContent = T.importSave(n);
}

function importChosen(form) {
  const imp = state.importRows;
  return $$('.imp-row', form).filter((el) => $('[data-imp=on]', el).checked).map((el) => {
    const r = imp.rows[Number(el.dataset.i)];
    return { date: r.date, description: r.description, amount: r.amount, direction: r.direction, category: $('[data-imp=category]', el).value };
  });
}

// ---------------------------------------------------------------- Transactions: export, select several
function exportCsv() {
  const list = filterTransactions(state.all || [], { ...state.filters, limit: 1e9 }).rows;
  const head = [T.date, T.time, T.description, T.notes, T.category, T.account, T.kind, T.amount, T.status];
  downloadCsv(`cashflow-${state.boot.today}.csv`, head, list.map((r) => [String(r.date).slice(0, 10), String(r.time || '').slice(0, 5), r.description, r.details, r.category, r.stream,
    r.direction === 'in' ? T.kindIn : T.kindOut, (r.direction === 'in' ? 1 : -1) * (Number(r.amount) || 0), T[`status${r.status[0].toUpperCase()}${r.status.slice(1)}`] || r.status]));
  toast(T.exported(list.length));
}

/** Applies a category (or "ignore") to the picked rows at once, with undo. */
function applyPicked(category, status) {
  const ids = [...state.picked];
  if (!ids.length) return null;
  const before = ids.map((id) => ({ id, ...state.rowsById.get(id) }));
  ids.forEach((id) => patchRow(id, category ? { category, status: 'approved' } : { status }));
  state.picked = new Set();
  state.selecting = false;
  updateNav();
  showResults();
  toast(T.changedN(ids.length), {
    undo: () => {
      before.forEach((r) => { patchRow(r.id, { category: r.category, status: r.status }); save('update', { id: r.id, fields: { category: r.category, status: r.status } }).catch(() => {}); });
      updateNav(); showResults();
    },
  });
  return save('updateMany', { ids, category: category || '', status: status || '' })
    .catch((e) => { before.forEach((r) => patchRow(r.id, { category: r.category, status: r.status })); updateNav(); showResults(); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}


// ---------------------------------------------------------------- Round 12 pieces
/** Amount fields accept a little sum ("12000+3500", "3x25rb"); a leading minus stays (adjustments). */
function amountValue(raw) {
  const s = String(raw ?? '').trim();
  if (/^-/.test(s)) return -evalAmount(s.slice(1));
  return evalAmount(s);
}
/** Under an amount field: "= Rp15.500" while the field holds a sum. */
function showCalc(input) {
  const out = input.closest('.field') && $('.calc-out', input.closest('.field'));
  if (!out) return;
  const v = amountValue(input.value);
  out.textContent = /[+\-x×*/÷:]/.test(input.value.replace(/^-/, '')) && Number.isFinite(v) ? `= ${rp(v)}` : '';
}
const CALC_KEYS = [['+', '+'], ['−', '-'], ['×', 'x'], ['÷', '/']];

/** The sentence on Add fills the form below it (what it can't tell, the form still asks). */
function applyQuick(text) {
  const p = parseQuick(text, {
    accounts: state.boot.accounts, rules: (state.settings && state.settings.rules) || state.boot.rules || [], today: state.boot.today,
    salaryCategory: state.boot.categories.income.find((c) => /^gaji$/i.test(c)) || '',
  });
  state.quickText = text;
  const usual = !Number.isFinite(p.amount) && p.description && (state.boot.usual || []).find((u) => u.description.toLowerCase() === p.description.toLowerCase());
  if (usual) { p.amount = usual.amount; p.stream = p.stream || usual.stream; p.category = p.category || usual.category; }
  state.addPrefill = {
    amount: Number.isFinite(p.amount) ? String(p.amount) : '', category: p.category, stream: p.stream, date: p.date,
    description: p.description ? p.description[0].toUpperCase() + p.description.slice(1) : '', details: p.tags.map((t) => `#${t}`).join(' '),
  };
  const sum = $('#quickSum');
  if (state.addKind !== p.direction && (state.addKind === 'out' || state.addKind === 'in')) {
    state.addKind = p.direction;
    viewAdd();
    const q = $('#quickIn');
    if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    return;
  }
  const form = $('form[data-form=add]');
  if (!form) return;
  const set = (n, v) => { const el = form.querySelector(`[name=${n}]`); if (el && v !== undefined) el.value = v; };
  const f = state.addPrefill;
  set('amount', f.amount); set('description', f.description); set('details', f.details); set('date', f.date);
  if (f.stream) set('stream', f.stream);
  if (f.category) set('category', f.category);
  if (sum) sum.textContent = text.trim() ? T.quickSummary(Number.isFinite(p.amount) ? rp(p.amount) : '?', p.direction === 'in' ? T.kindIn : T.kindOut, p.stream || T.chooseAccount, p.category || T.chooseCategory) : '';
}

/** Money friends owe you, with "paid back". */
function owedCard(owed) {
  if (!owed || (!owed.open.length && !owed.paid.length)) return '';
  const rows = owed.open.map((o) => `<div class="rowi"><span class="what"><b>${esc(o.who)}</b><span class="meta">${esc([o.payment, dateLabel(o.date, { weekday: false })].filter(Boolean).join(' · '))}</span></span>
    <span class="amt">${rp(o.amount)}</span><button class="btn secondary small" data-action="owedpaid" data-id="${esc(o.id)}" aria-label="${esc(T.owedPaidFor(o.who))}">${esc(T.owedPaid)}</button></div>`).join('');
  return `<section class="card"><h2>${esc(T.owedTitle)}</h2><p class="lead">${esc(owed.open.length ? T.owedHint(rp(owed.total)) : T.owedNone)}</p>
    ${rows ? `<div class="rows owed">${rows}</div>` : ''}</section>`;
}

/** Net worth: accounts, things owned, collectibles, debts. */
function wealthCard(w) {
  if (!w) return '';
  const line = (label, v, cls = '') => `<div class="rowi"><span class="what"><b>${esc(label)}</b></span><span class="amt ${cls}">${v}</span></div>`;
  const gains = w.items.filter((a) => a.gain != null).reduce((t, a) => t + a.gain, 0);
  return `<section class="card"><h2>${esc(T.wealthTitle)}</h2>${bigRp(w.total, 'lg')}<p class="lead">${esc(T.wealthHint)}</p><div class="rows">
    ${line(T.wealthAccounts, rp(w.accounts))}${Object.entries(w.byKind || {}).filter(([k]) => k !== 'collectible' && k !== 'debt' && k !== 'paylater').map(([k, v]) => line(T[`kind_${k}`] || k, rp(v))).join('')}
    ${w.collectibles ? line(T.wealthCollect(gains ? `${gains > 0 ? '+' : '−'}${rp(Math.abs(gains))}` : ''), rp(w.collectibles)) : ''}
    ${['debt', 'paylater'].filter((k) => (w.byKind || {})[k]).map((k) => line(T[`kind_${k}`], `−${rp(w.byKind[k])}`, 'bad')).join('')}</div>
    <button class="link" data-action="go" data-tab="settings" data-section="assets">${esc(T.wealthEdit)}</button></section>`;
}

/** When the money goes: weekdays and time of day, with the most expensive of each in words. */
function patternCard(p) {
  if (!p) return '';
  const days = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  const daysLong = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'long' }));
  const top = Math.max(1, ...p.weekdays);
  if (!p.weekdays.some((v) => v > 0)) return '';
  const best = p.weekdays.indexOf(Math.max(...p.weekdays));
  const parts = [['morning', T.partMorning], ['noon', T.partNoon], ['afternoon', T.partAfternoon], ['evening', T.partEvening], ['night', T.partNight]];
  const pTop = Math.max(1, ...parts.map(([k]) => p.parts[k]));
  const pBest = parts.reduce((a, b) => (p.parts[b[0]] > p.parts[a[0]] ? b : a));
  const bar = (label, v, max, on) => `<div class="pat-row ${on ? 'on' : ''}"><span>${esc(label)}</span><span class="hbar"><i class="out" style="width:${Math.round((v / max) * 100)}%"></i></span><span class="amt">${rp(v)}</span></div>`;
  return `<section class="card"><h2>${esc(T.patternTitle)}</h2><p class="lead">${esc(T.patternHint(daysLong[best], pBest[1].toLowerCase()))}</p>
    <div class="pat">${p.weekdays.map((v, i) => bar(days[i], v, top, i === best)).join('')}</div>
    <h3 class="sub-title">${esc(T.patternTime)}</h3>
    <div class="pat">${parts.map(([k, l]) => bar(l, p.parts[k], pTop, k === pBest[0])).join('')}</div></section>`;
}

/** Totals per #tag; a tag opens its transactions. */
function tagsCard(tags) {
  if (!tags || !tags.length) return '';
  return `<section class="card"><h2>${esc(T.tagsTitle)}</h2><p class="lead">${esc(T.tagsHint)}</p><div class="rows">${tags.map((t) => `
    <button class="lrow" data-action="drill" data-q="#${esc(t.tag)}"><span class="cat-ic acct" aria-hidden="true">#</span><span class="what"><b>#${esc(t.tag)}</b><span class="meta">${esc(T.tagCount(t.count))}${t.in ? ` · <span class="in">+${rp(t.in)}</span>` : ''}</span></span><span class="amt">${rp(t.out)}</span></button>`).join('')}</div><div class="actions" style="justify-content:flex-start"><button class="btn secondary small" data-action="tagbudget">${esc(T.eventAdd)}</button></div></section>`;
}

// Where to stop a subscription (only well-known pages).
const STOP_LINKS = [
  [/spotify/i, 'https://www.spotify.com/account/subscription/'], [/netflix/i, 'https://www.netflix.com/cancelplan'],
  [/youtube/i, 'https://www.youtube.com/paid_memberships'], [/google ?play|google \*/i, 'https://play.google.com/store/account/subscriptions'],
  [/apple/i, 'https://apps.apple.com/account/subscriptions'], [/claude|anthropic/i, 'https://claude.ai/settings/billing'],
  [/canva/i, 'https://www.canva.com/settings/billing-and-teams'], [/microsoft|xbox|office/i, 'https://account.microsoft.com/services'],
];
function openSubs() {
  const d = state.dashByMonth[state.month] || {};
  const items = (d.recurring && d.recurring.items) || [];
  const marks = d.recurringMarks || {};
  const perMonth = (i) => (i.cycle === 'year' ? i.amount / 12 : i.amount);
  const monthly = items.reduce((t, i) => t + perMonth(i), 0);
  const stopping = items.filter((i) => marks[i.key] === 'stop').reduce((t, i) => t + perMonth(i), 0);
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.subsTitle)}</h2>
    <p class="lead">${esc(T.subsTotals(rp(monthly), rp(monthly * 12)))}${stopping ? ` <b class="in">${esc(T.subsSave(rp(stopping), rp(stopping * 12)))}</b>` : ''}</p>
    <div class="rows">${sorted.map((i) => {
      const link = (STOP_LINKS.find(([re]) => re.test(i.name)) || [])[1];
      const m = marks[i.key] || '';
      return `<div class="sub-row"><div class="sub-top">${icon(i.category)}<span class="what"><b>${esc(i.name)}</b><span class="meta">${esc(T.recurringNext(dateLabel(i.nextDate, { weekday: false }), Math.max(0, i.daysLeft)))} · ${esc(T.perYear(rp(perMonth(i) * 12)))}</span></span><span class="amt">${rp(i.amount)}${i.cycle === 'year' ? `<small>/${esc(T.yearShort)}</small>` : ''}</span></div>
        <div class="sub-acts">
          <button type="button" class="chip-btn ${m === 'keep' ? 'on' : ''}" aria-pressed="${m === 'keep'}" data-action="submark" data-name="${esc(i.name)}" data-mark="${m === 'keep' ? '' : 'keep'}">${esc(T.subKeep)}</button>
          <button type="button" class="chip-btn ${m === 'stop' ? 'on stop' : ''}" aria-pressed="${m === 'stop'}" data-action="submark" data-name="${esc(i.name)}" data-mark="${m === 'stop' ? '' : 'stop'}">${esc(T.subStop)}</button>
          ${link ? `<a class="btn plain small" target="_blank" rel="noopener" href="${esc(link)}">${esc(T.subHowStop)} ↗</a>` : ''}
        </div></div>`;
    }).join('') || `<p class="hint">${esc(T.nothingYet)}</p>`}</div>
    <p class="hint">${esc(T.yearlyScanHint)}</p>
    <div class="actions"><button class="btn secondary left" type="button" data-action="scanyearly">${esc(T.yearlyScan)}</button><button class="btn primary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  $('#modal').classList.add('open');
}

/** Planned recurring transactions (rent, cash bills): one card per plan. */
function plansForm(s) {
  const c = state.boot.categories;
  const rows = (s.plans || []).map((p, i) => `<fieldset class="acct-row plan-row" data-i="${i}"><legend>${esc(p.name || T.newPlan)}</legend>
    <div class="fields2">
      ${field(T.planName, `<input data-p="name" value="${esc(p.name)}" placeholder="${esc(T.planNamePh)}">`)}
      ${field(T.amountRp, `<input data-p="amount" class="calc-input" inputmode="decimal" value="${esc(p.amount)}"><em class="calc-out"></em>`)}
      ${field(T.kind, `<select data-p="direction"><option value="out" ${p.direction !== 'in' ? 'selected' : ''}>${esc(T.kindOut)}</option><option value="in" ${p.direction === 'in' ? 'selected' : ''}>${esc(T.kindIn)}</option></select>`)}
      ${field(T.account, `<select data-p="stream">${accountOptions(p.stream)}</select>`)}
      ${field(T.category, `<select data-p="category"><option value="">${esc(T.planReview)}</option>${(p.direction === 'in' ? c.income : c.expense).map((x) => `<option ${x === p.category ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`)}
      ${field(T.planDay, `<input data-p="day" type="number" min="1" max="31" inputmode="numeric" value="${esc(p.day || '')}">`, { help: T.planDayHelp })}
    </div>
    <label class="check"><input type="checkbox" data-p="auto" ${p.auto === true || p.auto === 'TRUE' ? 'checked' : ''}> ${esc(T.planAuto)}</label>
    <div class="actions"><button class="btn danger small" type="button" data-action="delplan" data-i="${i}">${esc(T.planDelete)}</button></div></fieldset>`).join('');
  return `<form class="card" data-form="plans" novalidate><h2>${esc(T.plansTitle)}</h2><p class="lead">${esc(T.plansHint)}</p>${rows || `<p class="hint">${esc(T.noPlans)}</p>`}
    <div class="actions"><button class="btn secondary left" type="button" data-action="addplan">＋ ${esc(T.addPlan)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.savePlans)}</button></div></form>`;
}
const readPlans = (form) => $$('.plan-row', form).map((row, i) => ({
  ...((state.settings.plans || [])[i] || {}),
  ...Object.fromEntries($$('[data-p]', row).map((el) => [el.dataset.p, el.type === 'checkbox' ? el.checked : el.value])),
}));

/** Assets, debts and collectibles beyond the accounts. */
function assetsForm(s) {
  const kinds = s.assetKinds || ['property', 'vehicle', 'gold', 'stock', 'crypto', 'collectible', 'other', 'debt'];
  const rows = (s.assets || []).map((a, i) => {
    const price = Number(a.price);
    const value = (Number(a.qty) || 1) * (price > 0 ? price : Number(a.unit_value) || 0);
    return `<fieldset class="acct-row asset-row" data-i="${i}"><legend>${esc(a.name || T.newAsset)}${a.name ? ` · ${rp(value)}` : ''}</legend>
    <div class="fields2">
      ${field(T.assetName, `<input data-a2="name" value="${esc(a.name)}" placeholder="${esc(T.assetNamePh)}">`)}
      ${field(T.assetKind, `<select data-a2="kind">${kinds.map((k) => `<option value="${k}" ${k === a.kind ? 'selected' : ''}>${esc(T[`kind_${k}`])}</option>`).join('')}</select>`)}
      ${field(T.assetQty, `<input data-a2="qty" inputmode="decimal" value="${esc(a.qty === '' || a.qty == null ? 1 : a.qty)}">`, { help: T.assetQtyHelp })}
      ${field(T.assetValue, `<input data-a2="unit_value" class="calc-input" inputmode="decimal" value="${esc(a.unit_value || '')}"><em class="calc-out"></em>`, { help: price > 0 ? T.assetMarket(rp(price), Number(a.price_at) ? new Date(Number(a.price_at)).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') : a.ticker || a.kind === 'gold' ? T.assetPriceSoon : T.assetValueHelp })}
      ${field(T.assetTicker, `<input data-a2="ticker" value="${esc(a.ticker || '')}" placeholder="IDX:BBCA" autocapitalize="characters" spellcheck="false">`, { help: T.assetTickerHelp })}
      ${field(T.assetPaid, `<input data-a2="paid" class="calc-input" inputmode="decimal" value="${esc(a.paid || '')}"><em class="calc-out"></em>`, { help: T.optional })}
    </div>
    <div class="actions"><button class="btn danger small" type="button" data-action="delasset" data-i="${i}">${esc(T.assetDelete)}</button></div></fieldset>`;
  }).join('');
  return `<form class="card" data-form="assets" novalidate><h2>${esc(T.assetsTitle)}</h2><p class="lead">${esc(T.assetsHint)}</p>${rows || `<p class="hint">${esc(T.noAssets)}</p>`}
    <div class="actions"><button class="btn secondary left" type="button" data-action="addasset">＋ ${esc(T.addAsset)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveAssets)}</button></div></form>`;
}
const readAssets = (form) => $$('.asset-row', form).map((row, i) => ({
  ...((state.settings.assets || [])[i] || {}),
  ...Object.fromEntries($$('[data-a2]', row).map((el) => [el.dataset.a2, el.value])),
}));


// ---------------------------------------------------------------- Round 16 pieces
/** "Yang biasa": one tap fills Add with something you log often. */
function usualChips() {
  const list = (state.boot && state.boot.usual) || [];
  if (!list.length) return '';
  return `<div class="usual" role="group" aria-label="${esc(T.usualTitle)}"><span class="usual-label">${esc(T.usualTitle)}</span>${list.map((u, i) => `
    <button type="button" class="chip-btn" data-action="usual" data-i="${i}">${esc(u.description)} · ${rp(u.amount)}${u.stream ? ` · ${esc(u.stream)}` : ''}</button>`).join('')}</div>`;
}
function useUsual(i) {
  const u = state.boot.usual[i];
  if (!u) return null;
  state.addKind = u.direction === 'in' ? 'in' : 'out';
  state.addPrefill = { amount: String(u.amount), category: u.category, stream: u.stream, description: u.description, date: state.boot.today, details: '' };
  state.quickText = '';
  viewAdd();
  const save = $('form[data-form=add] button[type=submit]');
  if (save) save.focus();
  return null;
}

/** Bills due in the next week (planned transactions and subscriptions). */
function openBills() {
  const d = state.dashByMonth[state.month] || {};
  const bills = d.bills || [];
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.billsTitle)}</h2><p class="lead">${esc(T.billsTotal(rp(bills.reduce((t, b) => t + b.amount, 0))))}</p>
    <div class="rows">${bills.map((b) => `<div class="rowi"><span class="what"><b>${esc(b.name)}</b><span class="meta">${esc(b.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(b.date, { weekday: false }), b.daysLeft))} · ${esc(b.kind === 'plan' ? T.billPlan : b.kind === 'card' ? T.billCard : T.billSub)}</span></span><span class="amt">${rp(b.amount)}</span></div>`).join('') || `<p class="hint">${esc(T.nothingYet)}</p>`}</div>
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  $('#modal').classList.add('open');
}

/** Trips and events: #tags with a budget, spent against it. */
function eventsCard(events) {
  const list = events || [];
  const rows = list.map((e) => {
    const pct = e.budget ? Math.min(100, Math.round((e.out / e.budget) * 100)) : 0;
    const over = e.budget && e.out > e.budget;
    const days = e.first && e.last ? Math.round((Date.parse(e.last) - Date.parse(e.first)) / 86400000) + 1 : 0;
    return `<div class="event"><div class="row-top"><button class="link" data-action="drill" data-q="#${esc(e.tag)}"><b>#${esc(e.tag)}</b></button><span class="amt ${over ? 'bad' : ''}">${rp(e.out)}</span></div>
      <span class="bar"><i class="${over ? 'over' : ''}" style="width:${pct}%"></i></span>
      <div class="meta">${esc(over ? T.eventOver(rp(e.out - e.budget), rp(e.budget)) : T.eventLeft(rp(e.budget), rp(e.budget - e.out)))}${days > 1 ? ` · ${esc(T.eventPerDay(rp(e.out / days), days))}` : ''}
        <button class="link small" data-action="tagbudget" data-tag="${esc(e.tag)}" data-budget="${esc(e.budget)}">${esc(T.eventEdit)}</button></div></div>`;
  }).join('');
  return `<section class="card"><h2 class="row-title">${esc(T.eventsTitle)}<button class="link" data-action="tagbudget">${esc(T.eventAdd)}</button></h2>
    <p class="lead">${esc(list.length ? T.eventsHint : T.eventsEmpty)}</p>${rows}</section>`;
}
function openTagBudget(tag, budget) {
  $('#modal').innerHTML = `<div class="sheet"><form data-form="tagbudget" novalidate><h2>${esc(T.eventBudgetTitle)}</h2><p class="lead">${esc(T.eventBudgetHint)}</p>
    ${field(T.eventTag, `<input name="tag" autocomplete="off" placeholder="#bali" value="${esc(tag ? `#${tag}` : '')}">`)}
    ${field(T.eventBudget, `<input name="amount" class="calc-input" inputmode="decimal" autocomplete="off" value="${esc(budget || '')}"><em class="calc-out"></em>`, { help: T.eventBudgetHelp })}
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.cancel)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.save)}</button></div></form></div>`;
  $('#modal').classList.add('open');
  $('#modal [name=tag]').focus();
}

/** Review: today's box, to log what no email reports and close the day. */
function dayCard(day) {
  if (!day) return '';
  return `<section class="card day-card"><div class="row-top"><h2>${esc(T.dayTitle)}</h2>${day.streak ? `<span class="streak" title="${esc(T.streakHint)}">🔥 ${esc(T.streak(day.streak))}</span>` : ''}</div>
    ${day.yesterday ? `<div class="yesterday"><p>${esc(T.dayYesterdayOpen)}</p><button class="btn secondary small" data-action="closeday" data-date="${esc(day.yesterday)}">${esc(T.dayCloseYesterday)}</button></div>` : ''}
    ${day.closed ? `<p class="lead">✓ ${esc(T.dayClosed)}</p><div class="actions" style="justify-content:flex-start"><button class="btn plain small" data-action="reopenday">${esc(T.dayReopen)}</button></div>`
    : `<p class="lead">${esc(day.byHand ? T.dayLogged(day.byHand) : T.dayAsk)}</p>
      ${field(T.quickLabel, `<input id="quickDay" autocomplete="off" enterkeyhint="done" placeholder="${esc(T.quickPlaceholder)}">`, { help: T.dayQuickHelp })}
      <div class="actions"><button class="btn secondary" data-action="closeday">${esc(T.dayClose)}</button></div>`}
  </section>`;
}
/** A sentence typed in Review: saved straight away when complete, otherwise finished on Add. */
function quickFromReview(text) {
  const p = parseQuick(text, { accounts: state.boot.accounts, rules: state.boot.rules || [], today: state.boot.today, salaryCategory: state.boot.categories.income.find((c) => /^gaji$/i.test(c)) || '' });
  const usual = !(p.amount > 0) && (state.boot.usual || []).find((u) => u.description.toLowerCase() === p.description.toLowerCase());
  if (usual) { p.amount = usual.amount; p.stream = p.stream || usual.stream; p.category = p.category || usual.category; }
  const desc = p.description ? p.description[0].toUpperCase() + p.description.slice(1) : '';
  if (p.amount > 0 && p.stream && p.category) {
    const label = `${desc || p.category} ${rp(p.amount)}`;
    toast(T.addedNamed(label));
    state.allStale = true;
    state.dashByMonth = {};
    if (state.review && state.review.day) state.review.day.byHand += 1;
    return save('add', { kind: p.direction, amount: p.amount, category: p.category, stream: p.stream, date: p.date, description: desc, details: p.tags.map((t) => `#${t}`).join(' ') })
      .then(() => { if (state.tab === 'review') keepInputs(viewReview); })
      .catch((e) => toast(`${T.notSaved}: ${label} — ${e.message}`, { kind: 'bad' }));
  }
  state.addKind = p.direction;
  state.quickText = text;
  state.addPrefill = { amount: p.amount > 0 ? String(p.amount) : '', category: p.category, stream: p.stream, date: p.date, description: desc, details: p.tags.map((t) => `#${t}`).join(' ') };
  return show('add');
}

/** A category on its own: twelve months, its budget, where the money went, the biggest payments. */
function categoryDetail(category) {
  const c = state.boot.categories;
  const dir = c.income.includes(category) ? 'in' : 'out';
  const now = state.boot.today.slice(0, 7);
  const start = String(state.boot.start || '').slice(0, 7);
  const months = [...Array(12)].map((_, i) => monthAdd(now, i - 11)).filter((m) => !start || m >= start);
  const mine = state.all.filter((r) => r.status === 'approved' && r.category === category && r.direction === dir && months.some((m) => String(r.date).startsWith(m)));
  const total = (m) => mine.filter((r) => String(r.date).startsWith(m)).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const data = months.map((m) => ({ m, v: total(m) }));
  const top = Math.max(1, ...data.map((d) => d.v));
  const avg = data.reduce((s, d) => s + d.v, 0) / Math.max(1, data.length);
  const places = new Map();
  for (const r of mine) {
    const k = String(r.description || r.details || '').trim().toLowerCase();
    if (!k) continue;
    const p = places.get(k) || { name: r.description || r.details, n: 0, v: 0 };
    p.n += 1; p.v += Number(r.amount) || 0;
    places.set(k, p);
  }
  const topPlaces = [...places.values()].sort((a, b) => b.v - a.v).slice(0, 5);
  const biggest = [...mine].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 3);
  const dash = state.dashByMonth[currentMonth()];
  const budget = dash && (dash.budgets || []).find((b) => b.category === category);
  return `<section class="card trend-card cat-detail"><div class="cat-head">${icon(category)}<div><h2>${esc(category)}</h2><p class="lead">${esc(T.categoryTrendHint(rp(avg)))}</p></div></div>
    ${budget ? `<p class="budget-note ${budget.ratio > 1 ? 'over' : ''}">${esc(budget.ratio > 1 ? T.overBudget(rp(budget.spent - budget.budget), rp(budget.budget)) : T.ofBudget(rp(budget.budget), rp(budget.budget - budget.spent)))}</p>` : ''}
    <div class="chart cat-chart">${data.map((d) => `<button class="m ${state.filters.month === d.m ? 'on' : ''}" data-action="trendmonth" data-month="${d.m}" aria-label="${esc(`${monthLabel(d.m)}: ${rp(d.v)}`)}"><span class="bars"><i class="${dir}" style="height:${Math.round((d.v / top) * 100)}%"></i></span><span>${esc(monthShort(d.m))}</span></button>`).join('')}</div>
    ${topPlaces.length ? `<h3 class="sub-title">${esc(T.topPlaces)}</h3><div class="rows">${topPlaces.map((p) => `<button class="rowi" data-action="drill" data-q="${esc(p.name)}"><span class="what"><b>${esc(p.name)}</b><span class="meta">${p.n}×</span></span><span class="amt">${rp(p.v)}</span></button>`).join('')}</div>` : ''}
    ${biggest.length ? `<h3 class="sub-title">${esc(T.biggestTitle)}</h3><div class="rows">${biggest.map((x) => `<button class="rowi" data-action="edit" data-id="${esc(x.id)}"><span class="what"><b>${esc(x.description || '—')}</b><span class="meta">${esc(dateLabel(x.date))}</span></span><span class="amt">${rp(x.amount)}</span></button>`).join('')}</div>` : ''}
  </section>`;
}

// ---------------------------------------------------------------- Round 17 pieces
/** "Pertama kali": the first payment to a place (from an email or a statement). */
const firstBadge = (x) => (x.first ? ` <span class="badge new" title="${esc(T.firstHint)}">✦ ${esc(T.firstTime)}</span>` : '');

/** Three plain checks: emergency fund in months, what was kept this month, debts against what you own. */
function healthCard(h) {
  if (!h) return '';
  const n1 = (v) => Number(v).toLocaleString(locale(), { maximumFractionDigits: 1 });
  const rows = [
    [T.healthFund, h.months == null ? T.healthFundNone : T.healthFundMonths(n1(h.months)), h.months == null ? T.healthFundNoneHint : T.healthFundHint(rp(h.fund), rp(h.monthly)), h.monthsLevel],
    [T.healthSaving, h.saving == null ? '—' : `${Math.round(h.saving * 100)}%`, h.saving == null ? T.healthNoIncome : T.healthSavingHint, h.savingLevel],
    [T.healthDebt, `${Math.round(h.debt * 100)}%`, h.debts ? T.healthDebtHint(rp(h.debts)) : T.healthNoDebt, h.debtLevel],
  ];
  return `<section class="card health"><h2 class="row-title">${esc(T.healthTitle)}<button class="link" data-action="interest">${esc(T.interestOpen)}</button></h2><p class="lead">${esc(T.healthHint)}</p>
    <div class="rows">${rows.map(([label, value, hint, lvl]) => `<div class="rowi"><span class="lvl ${lvl || 'none'}" aria-hidden="true"></span><span class="what"><b>${esc(label)}</b><span class="meta">${esc(hint)}</span></span>
      <span class="amt">${esc(value)}${lvl ? `<small class="lvl-word ${lvl}">${esc(T[`health_${lvl}`])}</small>` : ''}</span></div>`).join('')}</div></section>`;
}

/** Deposito or SBN: what an amount earns after tax (rates typed by the owner, kept on this device). */
function readInterest() { try { return JSON.parse(localStorage.getItem('cf.interest') || '{}') || {}; } catch (e) { return {}; } }
function openInterest() {
  const h = (state.dashByMonth[state.month] || {}).health || {};
  const saved = readInterest();
  const months = Number(saved.months) || 12;
  $('#modal').innerHTML = `<div class="sheet"><form data-form="interest" novalidate><h2>${esc(T.interestTitle)}</h2><p class="lead">${esc(T.interestHint)}</p>
    <div class="fields2">
      ${field(T.interestAmount, `<input name="amount" class="calc-input" inputmode="decimal" autocomplete="off" value="${esc(h.fund > 0 ? Math.round(h.fund) : '')}"><em class="calc-out"></em>`)}
      ${field(T.interestMonths, `<select name="months">${[1, 3, 6, 12].map((m) => `<option value="${m}" ${m === months ? 'selected' : ''}>${esc(T.nMonths(m))}</option>`).join('')}</select>`)}
      ${field(T.interestDeposit, `<input name="dep" inputmode="decimal" autocomplete="off" placeholder="${esc(T.interestDepositHelp)}" value="${esc(saved.dep || '')}">`)}
      ${field(T.interestSbn, `<input name="sbn" inputmode="decimal" autocomplete="off" placeholder="${esc(T.interestSbnHelp)}" value="${esc(saved.sbn || '')}">`)}
    </div><div id="interestOut" role="status"></div><p class="hint">${esc(T.interestTax)}</p>
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></form></div>`;
  $('#modal').classList.add('open');
  updateInterest($('#modal form'));
}
function updateInterest(form) {
  const rate = (n) => Number(String(form.querySelector(`[name=${n}]`).value).replace(',', '.')) || 0;
  const v = { amount: amountValue(form.querySelector('[name=amount]').value || '0'), months: Number(form.querySelector('[name=months]').value), depositRate: rate('dep'), sbnRate: rate('sbn') };
  try { localStorage.setItem('cf.interest', JSON.stringify({ dep: form.querySelector('[name=dep]').value, sbn: form.querySelector('[name=sbn]').value, months: v.months })); } catch (e) { /* kept for this visit only */ }
  const r = interestCompare(v);
  const line = (label, x) => (x ? `<div class="rowi"><span class="what"><b>${esc(label)}</b><span class="meta">${esc(T.interestLine(rp(x.gross), rp(x.tax), rp(x.perMonth)))}</span></span><span class="amt in">+${rp(x.net)}</span></div>` : '');
  const both = r.deposit && r.sbn && Math.abs(r.deposit.net - r.sbn.net) >= 1;
  const better = both ? `<p class="lead"><b>${esc(T.interestBetter(r.sbn.net > r.deposit.net ? T.interestSbnName : T.interestDepositName, rp(Math.abs(r.sbn.net - r.deposit.net))))}</b></p>` : '';
  $('#interestOut').innerHTML = r.deposit || r.sbn ? `<div class="rows">${line(T.interestDepositName, r.deposit)}${line(T.interestSbnName, r.sbn)}</div>${better}` : `<p class="hint">${esc(T.interestFill)}</p>`;
}

/** Credit cards and paylater on the overview: the last bill, and what is building up since. */
function cardsCard(cards) {
  if (!cards || !cards.length) return '';
  const rows = cards.map((c) => {
    const status = c.left > 0 ? (c.daysLeft < 0 ? T.cardOverdue(rp(c.left), dateLabel(c.dueDate, { weekday: false })) : T.cardBill(rp(c.left), dateLabel(c.dueDate, { weekday: false }), c.daysLeft)) : T.cardPaid;
    return `<button class="lrow" data-action="drill" data-stream="${esc(c.stream)}">${acctIcon(c.stream, 'Spending')}<span class="what"><b>${esc(c.stream)}</b><span class="meta">${esc(status)} · ${esc(T.cardCurrent(rp(c.current)))}</span></span>
      <span class="amt ${c.left > 0 && c.daysLeft < 0 ? 'bad' : ''}">${rp(c.left)}</span></button>`;
  }).join('');
  return `<section class="card"><h2 class="row-title">${esc(T.cardsTitle)}<button class="link" data-action="go" data-tab="settings" data-section="cards">${esc(T.eventEdit)}</button></h2><div class="rows">${rows}</div></section>`;
}
function cardsForm(s) {
  const rows = (s.cards || []).map((c, i) => `<fieldset class="acct-row card-row" data-i="${i}"><legend>${esc(c.stream || T.newCard)}</legend>
    <div class="fields2">
      ${field(T.account, `<select data-c="stream">${accountOptions(c.stream)}</select>`)}
      ${field(T.cardStatement, `<input data-c="statement" type="number" min="1" max="31" inputmode="numeric" value="${esc(c.statement || '')}">`, { help: T.cardDayHelp })}
      ${field(T.cardDue, `<input data-c="due" type="number" min="1" max="31" inputmode="numeric" value="${esc(c.due || '')}">`, { help: T.cardDayHelp })}
    </div>
    <div class="actions"><button class="btn danger small" type="button" data-action="delcard" data-i="${i}">${esc(T.cardDelete)}</button></div></fieldset>`).join('');
  return `<form class="card" data-form="cards" novalidate><h2>${esc(T.cardsTitle)}</h2><p class="lead">${esc(T.cardsHint)}</p>${rows || `<p class="hint">${esc(T.noCards)}</p>`}
    <div class="actions"><button class="btn secondary left" type="button" data-action="addcard">＋ ${esc(T.addCard)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveCards)}</button></div></form>`;
}
const readCards = (form) => $$('.card-row', form).map((row) => Object.fromEntries($$('[data-c]', row).map((el) => [el.dataset.c, el.value])));

/** A CSV file the browser saves (Excel reads the BOM as UTF-8). */
function downloadCsv(name, head, rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([`\uFEFF${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** The SPT list: assets and debts with their SPT codes, to copy into the yearly tax return. */
const sptCard = (year) => `<section class="card"><h2>${esc(T.sptTitle)}</h2><p class="lead">${esc(T.sptHint(year))}</p>
  <div class="actions" style="justify-content:flex-start"><button class="btn secondary" data-action="spt" data-year="${esc(year)}">${esc(T.sptOpen)}</button></div></section>`;
async function openSpt(year) {
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.sptTitle)}</h2><p class="hint">${esc(T.loading)}</p></div>`;
  $('#modal').classList.add('open');
  try {
    const s = await call('spt', { year });
    state.spt = s;
    const row = (x, debt) => `<div class="rowi"><span class="what"><b>${esc(x.code)} · ${esc(x.name)}</b><span class="meta">${esc(x.label)}${debt ? '' : ` · ${esc(x.cost != null ? T.sptCost(rp(x.cost)) : T.sptNoCost)}`}</span></span><span class="amt ${debt ? 'bad' : ''}">${rp(x.value)}</span></div>`;
    $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.sptTitle)} ${esc(s.year)}</h2>
      <p class="lead">${esc(T.sptTotal(rp(s.totalHarta), rp(s.totalUtang)))}</p>
      ${s.asOf < `${s.year}-12-31` ? `<p class="hint">${esc(T.sptRunning)}</p>` : ''}
      <h3 class="sub-title">${esc(T.sptHarta)}</h3><div class="rows">${s.harta.map((x) => row(x, false)).join('') || `<p class="hint">${esc(T.nothingYet)}</p>`}</div>
      ${s.utang.length ? `<h3 class="sub-title">${esc(T.sptUtang)}</h3><div class="rows">${s.utang.map((x) => row(x, true)).join('')}</div>` : ''}
      <p class="hint">${esc(T.sptNote)}</p>
      <div class="actions"><button class="btn secondary left" type="button" data-action="sptcsv">${esc(T.sptDownload)}</button><button class="btn primary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  } catch (e) {
    $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.sptTitle)}</h2><p class="hint bad">${esc(e.message)}</p><div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  }
}
function sptCsv() {
  const s = state.spt;
  if (!s) return;
  const rows = [...s.harta.map((x) => [T.sptHarta, x.code, x.label, x.name, x.cost ?? '', x.value]), ...s.utang.map((x) => [T.sptUtang, x.code, x.label, x.name, '', x.value])];
  downloadCsv(`spt-${s.year}.csv`, T.sptColumns, rows);
}

function recurringCard(r) {
  if (!r || !r.items || !r.items.length) return '';
  const when = (i) => (i.daysLeft < 0 ? T.recurringLate(dateLabel(i.nextDate, { weekday: false }), -i.daysLeft)
    : i.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(i.nextDate, { weekday: false }), i.daysLeft));
  const rows = r.items.map((i) => `<div class="rec-row">
    <button class="rowi" data-action="drill" data-q="${esc(i.name)}"><span class="what"><b>${esc(i.name)}</b>
      <span class="meta">${esc(when(i))}${i.stream ? ` · ${esc(i.stream)}` : ''}${['category', 'yearly-guess'].includes(i.basis) ? ` · <span class="badge neutral">${esc(T.recurringGuess)}</span>` : ''}${i.change === 'up' ? ` <span class="badge warn">↑ ${esc(T.subUp(rp(i.was)))}</span>` : ''}${i.change === 'new' ? ` <span class="badge new">${esc(T.subNew)}</span>` : ''}${i.daysLeft < 0 ? ` <span class="badge warn">${esc(T.recurringLateBadge)}</span>` : ''}</span></span>
      <span class="amt">${rp(i.amount)}${i.cycle === 'year' ? `<small>/${esc(T.yearShort)}</small>` : ''}</span></button>
    <button class="btn plain small rec-hide" data-action="hiderec" data-name="${esc(i.name)}" aria-label="${esc(T.notSubscriptionFor(i.name))}">${esc(T.notSubscription)}</button></div>`).join('');
  return `<section class="card"><h2 class="row-title">${esc(T.recurringTitle)}<button class="link" data-action="subs">${esc(T.subsManage)}</button></h2><p class="lead">${esc(T.recurringHint(rp(r.monthlyTotal)))}</p><div class="rows">${rows}</div></section>`;
}

function goalsCard(goals) {
  if (!goals || !goals.length) return '';
  const rows = goals.map((g) => `<div class="goal">
    <div class="row-top"><b>${esc(g.name)}</b><span class="amt">${rp(g.saved)}</span></div>
    <span class="bar" role="img" aria-label="${esc(T.goalPercent(g.percent))}"><i class="${g.done ? 'done' : ''}" style="width:${g.percent}%"></i></span>
    <div class="meta">${esc(g.done ? T.goalDone(rp(g.target)) : T.goalLeft(g.percent, rp(g.target), rp(g.left)))}</div>
    ${!g.done && g.perMonth ? `<div class="meta">${esc(T.goalPerMonth(rp(g.perMonth), dateLabel(g.targetDate, { weekday: false })))}</div>` : ''}
    ${!g.done && g.targetDate && !g.monthsLeft ? `<div class="meta"><span class="badge warn">${esc(T.goalPast)}</span></div>` : ''}
  </div>`).join('');
  return `<section class="card"><h2>${esc(T.goalsTitle)}</h2><p class="lead">${esc(T.goalsHint)}</p><div class="goals">${rows}</div></section>`;
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
      <div class="tools">${whoSeg()}<button class="btn secondary small" data-action="selectmode" aria-pressed="${!!state.selecting}">${esc(state.selecting ? T.selectDone : T.selectMany)}</button>
        <button class="btn secondary small" data-action="exportcsv">${esc(T.exportCsv)}</button>
        <button class="btn primary small" data-action="go" data-tab="add">＋ ${esc(T.addTransaction)}</button></div></header>
    <div class="pchips" role="group" aria-label="${esc(T.period)}">${[['period', T.presetPeriod], ['30', T.presetThirty], ['90', T.presetNinety], ['year', T.presetYear], ['all', T.presetAll]]
      .map(([v, l]) => `<button type="button" class="${presetOf(f) === v ? 'on' : ''}" aria-pressed="${presetOf(f) === v}" data-action="preset" data-p="${v}">${esc(l)}</button>`).join('')}</div>
    <div class="pchips" role="group" aria-label="${esc(T.kind)}">${[['all', T.allKinds], ['out', T.kindOut], ['in', T.kindIn], ['transfer', T.kindTransfer], ['adjust', T.kindAdjust]]
      .map(([v, l]) => `<button type="button" class="${kindOf(f) === v ? 'on' : ''}" aria-pressed="${kindOf(f) === v}" data-action="kindchip" data-k="${v}">${esc(l)}</button>`).join('')}</div>
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

/** Which period chip the filters match ('' = none). */
function presetOf(f) {
  const cur = state.dashByMonth[currentMonth()];
  const r = cur && cur.summary && cur.summary.from ? cur.summary : null;
  if (r ? f.from === r.from && f.to === r.to && !f.month : f.month === currentMonth() && !f.from) return 'period';
  if (!f.month && !f.from && !f.to) return 'all';
  if (f.month || f.to) return '';
  const ago = (n) => { const t = new Date(`${state.boot.today}T00:00:00`); t.setDate(t.getDate() - n + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  if (f.from === ago(30)) return '30';
  if (f.from === ago(90)) return '90';
  return f.from === `${state.boot.today.slice(0, 4)}-01-01` ? 'year' : '';
}
function setPreset(v) {
  const f = state.filters;
  const cur = state.dashByMonth[currentMonth()];
  const r = cur && cur.summary && cur.summary.from ? cur.summary : null;
  const ago = (n) => { const t = new Date(`${state.boot.today}T00:00:00`); t.setDate(t.getDate() - n + 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  Object.assign(f, { month: '', from: '', to: '' });
  if (v === 'period') Object.assign(f, r ? { from: r.from, to: r.to } : { month: currentMonth() });
  else if (v === '30' || v === '90') f.from = ago(Number(v));
  else if (v === 'year') f.from = `${state.boot.today.slice(0, 4)}-01-01`;
}
const fixedCats = () => state.boot.categories.fixed; // [Penyesuaian, transfer]
function kindOf(f) {
  if (f.category === fixedCats()[1]) return 'transfer';
  if (f.category === fixedCats()[0]) return 'adjust';
  if (f.category) return '';
  return f.direction || 'all';
}
function setKind(v) {
  const f = state.filters;
  if (fixedCats().includes(f.category)) f.category = '';
  f.direction = v === 'out' || v === 'in' ? v : '';
  if (v === 'transfer') f.category = fixedCats()[1];
  if (v === 'adjust') f.category = fixedCats()[0];
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
    f.q && ['q', `“${f.q}”`], f.month && ['month', monthLabel(f.month)], (f.from || f.to) && ['period', f.to ? (f.from === f.to ? dateLabel(f.from) : rangeLabel(f.from, f.to)) : T.since(dateLabel(f.from, { weekday: false }))], f.stream && ['stream', f.stream], f.category && ['category', f.category],
    f.direction && ['direction', f.direction === 'in' ? T.kindIn : T.kindOut], f.status && ['status', T[`status${f.status[0].toUpperCase()}${f.status.slice(1)}`]],
  ].filter(Boolean);
  const fc = $('#filterCount');
  if (fc) fc.textContent = chips.length ? ` (${T.activeN(chips.length)})` : '';
  $('#txChips').innerHTML = chips.length ? `${chips.map(([k, label]) => `<button class="chip" data-action="unfilter" data-key="${k}" aria-label="${esc(T.removeFilter(label))}">${esc(label)} <span class="x" aria-hidden="true">✕</span></button>`).join('')}
    <button class="btn plain small" data-action="resetfilters">${esc(T.resetFilters)}</button>` : '';
  // One heading per day with that day's total (of everything filtered, not only the rows shown).
  const dayTotal = new Map();
  for (const r of counted) {
    const k = String(r.date).slice(0, 10);
    const t = dayTotal.get(k) || { out: 0, in: 0 };
    t[r.direction === 'in' ? 'in' : 'out'] += Number(r.amount) || 0;
    dayTotal.set(k, t);
  }
  const yesterday = (() => { const t = new Date(`${state.boot.today}T00:00:00`); t.setDate(t.getDate() - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
  let lastDay = '';
  const dayHead = (x) => {
    const k = String(x.date).slice(0, 10);
    if (k === lastDay) return '';
    lastDay = k;
    const t = dayTotal.get(k) || { out: 0, in: 0 };
    const label = k === state.boot.today ? T.today : k === yesterday ? T.yesterday : dateLabel(k);
    return `<div class="day-head" role="row"><span>${esc(label)}</span><span class="amt">${t.out ? `−${rp(t.out)}` : ''}${t.in ? ` <span class="in">+${rp(t.in)}</span>` : ''}</span></div>`;
  };
  const items = rows.map((x) => `${dayHead(x)}
    <button class="trow${state.selecting ? ' picking' : ''}${state.picked.has(String(x.id)) ? ' picked' : ''}" data-action="${state.selecting ? 'pick' : 'edit'}" data-id="${esc(x.id)}" ${state.selecting ? `aria-pressed="${state.picked.has(String(x.id))}"` : ''}>
      <span class="c-date">${state.selecting ? `<span class="pick-box" aria-hidden="true">${state.picked.has(String(x.id)) ? '✓' : ''}</span>` : ''}${esc(timeLabel(x.time) || '—')}</span>
      <span class="c-desc">${icon(x.category)}<span>${esc(x.description || '—')}${x.details ? `<small>${esc(x.details)}</small>` : ''}</span></span>
      <span class="c-mobile-meta">${esc([timeLabel(x.time), x.stream || T.noAccount].filter(Boolean).join(' · '))}</span>
      <span class="c-cat">${tag(x.category)}${statusBadge(x.status)}${firstBadge(x)}</span>
      <span class="c-acct">${esc(x.stream || '—')}</span>
      <span class="c-amt amt ${esc(x.direction)}">${signed(x)}</span>
    </button>`).join('');
  box.innerHTML = `${f.category ? categoryDetail(f.category) : ''}
    <div class="summary-bar"><span><b>${esc(T.countTransactions(all.total))}</b></span>
      <span>${esc(T.kindIn)} <b class="amt in">+${rp(sum('in'))}</b> · ${esc(T.kindOut)} <b class="amt">${rp(sum('out'))}</b></span></div>
    ${rows.length ? `<div class="table" role="table"><div class="thead" role="row"><span>${esc(T.time)}</span><span>${esc(T.description)}</span><span>${esc(T.category)}</span><span>${esc(T.account)}</span><span class="r">${esc(T.amount)}</span></div>${items}</div>`
    : `<div class="card empty"><b>${esc(T.noTransactions)}</b>${esc(chips.length ? T.noTransactionsFiltered : '')}</div>`}
    ${all.total > rows.length ? `<div class="more"><span>${esc(T.showing(rows.length, all.total))}</span><button class="btn secondary" data-action="more">${esc(T.showMore)}</button></div>` : ''}
    ${state.selecting ? `<div class="pick-bar" role="region" aria-label="${esc(T.selectMany)}"><b>${esc(T.pickedN(state.picked.size))}</b>
      <select id="pickCat" aria-label="${esc(T.category)}">${categoryOptions('', 'out')}</select>
      <button class="btn primary small" data-action="pickapply" ${state.picked.size ? '' : 'disabled'}>${esc(T.pickApply)}</button>
      <button class="btn secondary small" data-action="pickignore" ${state.picked.size ? '' : 'disabled'}>${esc(T.ignore)}</button>
      <button class="btn plain small" data-action="selectmode">${esc(T.cancel)}</button></div>` : ''}`;
}

function drill(el) {
  // By payday the month is a date range (28 Sep - 27 Oct), so the list gets the same range.
  const d = state.dashByMonth[state.month];
  const all = el.dataset.stream || el.dataset.q;
  const range = !all && d && d.summary && d.summary.from ? d.summary : null;
  state.filters = { q: el.dataset.q || '', month: all || range ? '' : state.month, from: range ? range.from : '', to: range ? range.to : '', stream: el.dataset.stream || '', category: el.dataset.category || '', status: '', direction: el.dataset.direction || '' };
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
        ${field(T.amountRp, `<input name="amount" class="amount-input" inputmode="decimal" autocomplete="off" value="${esc(x.amount)}"><em class="calc-out"></em>`)}
        ${field(T.kind, `<select name="direction"><option value="out" ${x.direction === 'out' ? 'selected' : ''}>${esc(T.kindOut)}</option><option value="in" ${x.direction === 'in' ? 'selected' : ''}>${esc(T.kindIn)}</option></select>`)}
        ${field(T.category, `<select name="category">${categoryOptions(x.category, x.direction)}</select>`)}
        ${field(T.account, `<select name="stream">${accountOptions(x.stream)}</select>`)}
        ${field(T.date, `<input name="date" type="date" value="${esc(x.date)}">`)}
        ${field(T.status, `<select name="status">${statuses}</select>`, { help: T.statusHelp })}
      </div>
      ${field(T.notes, `<input name="details" value="${esc(x.details)}">`, { help: T.notesTagHelp })}
      <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.cancel)}</button><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div>
    </form>
    ${parentId ? `<div class="split-box"><p>${esc(T.isSplitPart)}</p><button class="btn secondary" type="button" data-action="edit" data-id="${esc(parentId)}">${esc(T.openSplitParent)}</button></div>`
    : `<div class="split-box" id="splitBox">${splitSummary(x)}</div>`}
    ${x.direction === 'out' ? `<div class="split-box" id="tagihBox"><h3>${esc(T.tagihTitle)}</h3><p class="hint">${esc(T.tagihHint)}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="tagihopen" data-id="${esc(x.id)}">${esc(T.tagihOpen)}</button></div></div>` : ''}
    <div class="danger-zone"><button class="btn danger" type="button" data-action="delete" data-id="${esc(x.id)}">${esc(T.deleteTransaction)}</button>
      ${x.gmail_id ? `<p class="hint">${esc(T.deleteEmailHint)}</p>` : ''}</div>
  </div>`;
  $('#modal').classList.add('open');
  const first = $('#modal input[name=description]');
  if (first && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) first.focus();
}
function tagihForm(x) {
  return `<form data-form="tagih" data-id="${esc(x.id)}" novalidate><h3>${esc(T.tagihTitle)}</h3>
    ${field(T.tagihWho, '<input name="who" autocomplete="off" placeholder="Andi, Budi, Citra">', { help: T.tagihWhoHelp })}
    <label class="check"><input type="checkbox" name="me" checked> ${esc(T.tagihWithMe)}</label>
    ${field(T.tagihEach, '<input name="each" class="calc-input" inputmode="decimal" autocomplete="off"><em class="calc-out"></em>', { help: T.tagihEachHelp(rp(x.amount)) })}
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.tagihSave)}</button></div></form>`;
}
/** Each person's share: the payment split between the names (and you, when "including me"). */
function updateTagih(form) {
  const x = state.rowsById.get(String(form.dataset.id));
  const names = form.querySelector('[name=who]').value.split(',').map((n) => n.trim()).filter(Boolean);
  const n = names.length + (form.querySelector('[name=me]').checked ? 1 : 0);
  const each = form.querySelector('[name=each]');
  if (!each.dataset.touched) each.value = names.length && n ? String(Math.round((Number(x.amount) || 0) / n)) : '';
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
  // The duplicate check needs the transactions: fetched in the background if missing or out of date.
  if (!state.all || state.allStale) call('list', { limit: 1000000 }).then((r) => setAll(r.rows)).catch(() => {});
  const k = state.addKind;
  const kinds = [['out', T.kindOut], ['in', T.kindIn], ['transfer', T.kindTransfer], ['adjust', T.kindAdjust]];
  const last = state.addLast || {};
  const pre = state.addPrefill || {};
  setView(`<div class="narrow">
    <header class="page-head"><div><h1>${esc(T.addTitle)}</h1><p class="sub">${esc(T.addSub)}</p></div></header>
    ${k === 'out' || k === 'in' ? `<div class="card quick">${field(T.quickLabel, `<input id="quickIn" data-quick autocomplete="off" enterkeyhint="done" placeholder="${esc(T.quickPlaceholder)}" value="${esc(state.quickText || '')}">`, { help: T.quickHelp })}<p class="quick-sum" id="quickSum" role="status"></p>${usualChips()}</div>` : ''}
    <form class="card" data-form="add" novalidate>
      <div class="field"><span id="kindLabel">${esc(T.kind)}</span><div class="seg wrap" role="group" aria-labelledby="kindLabel">${kinds.map(([v, l]) => `<button type="button" class="${v === k ? 'on' : ''}" aria-pressed="${v === k}" data-action="kind" data-kind="${v}">${esc(l)}</button>`).join('')}</div></div>
      ${field(T.amountRp, `<input class="amount-input" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(pre.amount || '')}"><em class="calc-out"></em>`, { help: k === 'adjust' ? T.adjustHint : T.amountHelpCalc })}
      <div class="calc-keys" role="group" aria-label="${esc(T.calcKeys)}">${CALC_KEYS.map(([l, v]) => `<button type="button" data-action="calckey" data-k="${v}" aria-label="${esc(l)}">${l}</button>`).join('')}</div>
      <div class="fields2" style="margin-top:16px">
        ${k === 'out' || k === 'in' ? field(T.category, `<select name="category">${categoryOptions(pre.category || '', k)}</select>`) : ''}
        ${field(k === 'transfer' ? T.fromAccount : T.account, `<select name="stream">${accountOptions(pre.stream || last.stream || (k === 'out' ? 'Cash' : ''))}</select>`)}
        ${k === 'transfer' ? field(T.toAccount, `<select name="toStream">${accountOptions('')}</select>`) : ''}
        ${field(T.date, `<input name="date" type="date" value="${esc(pre.date || last.date || state.boot.today)}">`)}
      </div>
      ${field(T.description, `<input name="description" autocomplete="off" value="${esc(pre.description || '')}">`, { help: T.descriptionHelp })}
      ${field(T.notes, `<input name="details" autocomplete="off" value="${esc(pre.details || '')}">`, { help: T.notesTagHelp })}
      <div id="addDup"></div>
      <div class="actions"><span class="state" id="addState" role="status"></span><button class="btn primary" type="submit">${esc(T.saveTransaction)}</button></div>
    </form></div>`);
}

/** Rows that look like the same money: same amount, same direction, within a day, not ignored. */
function possibleDuplicates({ kind, amount, date, stream, toStream }) {
  if (!state.all || kind === 'adjust' || !(amount > 0) || !date) return [];
  const day = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000;
  const dir = kind === 'in' ? 'in' : 'out';
  return state.all.filter((r) => r.status !== 'ignored' && r.direction === dir && Math.abs(Number(r.amount) - amount) < 0.5
    && Math.abs(day(r.date) - day(date)) <= 1 && (kind !== 'transfer' || r.stream === stream || r.stream === toStream)).slice(0, 3);
}

function submitAdd(form) {
  const d = Object.fromEntries(new FormData(form).entries());
  const k = state.addKind;
  const amount = amountValue(d.amount);
  const el = (n) => form.querySelector(`[name=${n}]`);
  let ok = fieldMessage(el('amount'), !d.amount || !Number.isFinite(amount) || !amount || (k !== 'adjust' && amount < 0) ? T.errAmount : '');
  if (el('category')) ok = fieldMessage(el('category'), d.category ? '' : T.errNoCategory) && ok;
  ok = fieldMessage(el('stream'), d.stream ? '' : T.errNoAccount) && ok;
  if (el('toStream')) ok = fieldMessage(el('toStream'), !d.toStream ? T.errNoAccount : d.toStream === d.stream ? T.errSameAccount : '') && ok;
  if (!ok) { const bad = form.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }
  // Already recorded (e.g. by the bank's email)? Ask before saving the same money twice.
  const dups = state.addForce ? [] : possibleDuplicates({ kind: k, amount, date: d.date, stream: d.stream, toStream: d.toStream });
  state.addForce = false;
  if (dups.length) {
    $('#addDup').innerHTML = `<div class="dup-warning" role="alert"><b>⚠ ${esc(T.dupTitle)}</b><p>${esc(T.dupHint)}</p>
      <div class="rows">${dups.map((x) => `<div class="rowi"><span class="what"><b>${esc(x.description || '—')}</b><span class="meta">${esc(when(x))} · ${esc(x.stream)} · ${tag(x.category)}</span></span><span class="amt ${esc(x.direction)}">${signed(x)}</span></div>`).join('')}</div>
      <div class="actions"><button class="btn secondary" type="button" data-action="dupcancel">${esc(T.dupCancel)}</button><button class="btn primary" type="button" data-action="dupsave">${esc(T.dupSave)}</button></div></div>`;
    $('#addDup .btn.primary').focus();
    return;
  }
  $('#addDup').innerHTML = '';
  const label = `${d.description || d.category || T[`kind${k[0].toUpperCase()}${k.slice(1)}`]} ${rp(amount)}`;
  state.addLast = { stream: d.stream, date: d.date };
  state.addPrefill = null; state.quickText = '';
  if ($('#quickIn')) { $('#quickIn').value = ''; $('#quickSum').textContent = ''; }
  ['amount', 'description', 'details'].forEach((n) => { el(n).value = ''; });
  showCalc(el('amount'));
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
/** Kita / Aku / Dia: the household, or one person (only when two people share the app). */
function whoSeg() {
  const m = state.boot.members || [];
  if (m.length < 2) return '';
  const me = state.boot.me;
  const other = m.find((x) => x !== me) || '';
  const btn = (v, label) => `<button type="button" class="${(state.who || '') === v ? 'on' : ''}" aria-pressed="${(state.who || '') === v}" data-action="who" data-who="${esc(v)}">${esc(label)}</button>`;
  return `<div class="seg who" role="group" aria-label="${esc(T.whoLabel)}">${btn('', T.whoAll)}${btn(me, T.whoMe)}${btn(other, other)}</div>`;
}
const otherOwner = (x) => (x.owner && (state.boot.members || []).length > 1 && x.owner !== state.boot.me ? ` · ${esc(x.owner)}` : '');

/** Settings → Pasangan: the owner names the partner; the partner connects their own Gmail. */
function householdSection(s) {
  const h = s.household || {};
  const partner = h.partner || {};
  if (!h.isOwner) {
    return `<section class="card"><h2>${esc(T.hhTitle)}</h2><p class="lead">${esc(T.hhYou(h.me, h.ownerName))}</p>
      ${h.myGmailConnected ? `<p class="hint ok-text">✓ ${esc(T.hhConnected)}</p>` : `<p>${esc(T.hhConnectHint)}</p><div class="actions" style="justify-content:flex-start"><button class="btn primary" type="button" data-action="connectme">${esc(T.hhConnect)}</button></div>`}
      <p class="hint">${esc(T.hhAccountsHint)}</p></section>`;
  }
  const conn = partner.email && (s.connections || []).find((c) => String(c.gmail).toLowerCase() === partner.email);
  return `<form class="card" data-form="household" novalidate><h2>${esc(T.hhTitle)}</h2><p class="lead">${esc(T.hhHint)}</p>
    <div class="fields2">
      ${field(T.hhName, `<input name="partner_name" autocomplete="off" value="${esc(partner.name)}">`)}
      ${field(T.hhEmail, `<input name="partner_email" type="email" inputmode="email" autocomplete="off" spellcheck="false" value="${esc(partner.email)}">`, { help: T.hhEmailHelp })}
      ${field(T.hhBankNames, `<input name="partner_bank_names" autocomplete="off" value="${esc(partner.bankNames)}">`, { help: T.hhBankNamesHelp, wide: true })}
    </div>
    ${partner.email ? `<div class="rows"><div class="rowi"><span class="what"><b>${esc(partner.name || partner.email)}</b><span class="meta">${esc(conn ? T.hhPartnerConnected(conn.last_sync ? new Date(conn.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—') : T.hhPartnerNotYet)}</span></span></div></div>
      <details class="howto" ${conn ? '' : 'open'}><summary>${esc(T.hhStepsTitle)}</summary><ol>${T.hhSteps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`;
}

/** Phone notifications: the phones that joined, which things notify, a test. */
const NOTIF_EVENTS = ['new', 'big', 'bills', 'payday', 'close'];
function notifSection(s) {
  const p = s.push;
  if (!p) return `<section class="card"><h2>${esc(T.notifTitle)}</h2><p class="lead">${esc(T.notifNotSetUp)}</p></section>`;
  const devs = p.devices.map((d) => `<div class="rowi"><span class="what"><b>${esc(d.label || T.notifDevice)}</b><span class="meta">${esc(T.notifSince(d.at ? dateLabel(d.at.slice(0, 10), { weekday: false }) : '—'))}</span></span></div>`).join('');
  return `<section class="card"><h2>${esc(T.notifTitle)}</h2><p class="lead">${esc(T.notifHint)}</p>
      ${devs ? `<div class="rows">${devs}</div>` : `<p class="hint">${esc(T.notifNone)}</p>`}
      <div class="actions" style="justify-content:flex-start"><a class="btn primary" target="_top" href="${esc(p.link)}">${esc(T.notifAdd)}</a>${devs ? `<button class="btn secondary" type="button" data-action="pushtest">${esc(T.notifTest)}</button>` : ''}</div>
      <p class="hint">${esc(T.notifIphone)}</p></section>
    <form class="card" data-form="notif" novalidate><h2>${esc(T.notifWhat)}</h2>
      ${NOTIF_EVENTS.map((k) => `<label class="check"><input type="checkbox" name="push_${k}" ${p.events.includes(k) ? 'checked' : ''}> ${esc(T[`notif_${k}`])}</label>`).join('')}
      <div class="actions">${devs ? `<button class="btn danger left" type="button" data-action="pushforget">${esc(T.notifForget)}</button>` : ''}<span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`;
}

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
        ${(state.boot.members || []).length > 1 ? field(T.accountOwner, `<select data-a="owner">${state.boot.members.map((n) => `<option ${n === (a.owner || state.boot.members[0]) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`, { help: T.accountOwnerHelp }) : ''}
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
    const tip = (s.budgetSuggestions || []).find((x) => x.category === c);
    return field(c, `<input data-b="${esc(c)}" type="number" inputmode="decimal" step="any" min="0" value="${esc(b ? b.monthly_budget : '')}" placeholder="0">`, { help: tip ? T.budgetSuggest(rp(tip.amount), tip.months) : '' });
  }).join('');
  const conns = (s.connections || []).map((c) => {
    const st = String(c.last_status || '');
    const failed = /^ERROR/.test(st);
    const note = !c.last_sync ? T.neverSynced : failed ? `${T.syncProblem}: ${st.replace(/^ERROR:s*/, '').split(' | ')[0]}` : T.syncHealthy;
    const at = c.last_sync ? new Date(c.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="rowi"><span class="what"><b>${esc(c.gmail)}</b><span class="meta">${at ? `${esc(T.lastSync)} ${esc(at)} · ` : ''}${failed ? `<span class="badge bad">⚠ ${esc(note)}</span>` : `<span class="badge ok">✓ ${esc(note)}</span>`}</span></span></div>`;
  }).join('');
  // One section at a time (Apple Settings style): the list of sections, then the open one. On a
  // phone the list and the section are two screens; on a PC the list stays on the left.
  const sections = {
    monthend: balanceForm(s),
    import: importForm(s),
    plans: plansForm(s),
    assets: assetsForm(s),
    cards: cardsForm(s),
    notif: notifSection(s),
    household: householdSection(s),
    sync: `
      <section class="card"><h2>${esc(T.settingsSync)}</h2><p class="lead">${esc(T.settingsSyncHint)}</p><div class="rows">${conns}</div>
        <div class="actions"><button class="btn primary" type="button" data-action="sync">↻ ${esc(T.syncNow)}</button></div></section>`,
    accounts: `
      <form class="card" data-form="accounts" novalidate><h2>${esc(T.accountsTitle)}</h2><p class="lead">${esc(T.accountsTitleHint)}</p>${acc}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addacct">＋ ${esc(T.addAccount)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveAccounts)}</button></div></form>`,
    budgets: `
      <form class="card" data-form="budgets" novalidate><h2>${esc(T.budgetsTitle)}</h2><p class="lead">${esc(T.budgetsHint)}</p><div class="budget-grid">${budgets}</div>
        <div class="actions">${(s.budgetSuggestions || []).length ? `<button class="btn secondary left" type="button" data-action="fillbudgets">${esc(T.fillBudgets)}</button>` : ''}<span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveBudgets)}</button></div></form>`,
    categories: `
      <form class="card" data-form="categories" novalidate><h2>${esc(T.categoriesTitle)}</h2><p class="lead">${esc(T.categoriesHint)}</p>
        <div class="fields2">
          ${field(T.incomeCats, `<textarea name="income" rows="7">${esc(s.categories.income.join('\n'))}</textarea>`, { help: T.onePerLine })}
          ${field(T.expenseCats, `<textarea name="expense" rows="14">${esc(s.categories.expense.join('\n'))}</textarea>`, { help: T.onePerLine })}
        </div>${saveRow(T.saveCategories)}</form>`,
    rules: `
      <form class="card" data-form="rules" novalidate><h2>${esc(T.rulesTitle)}</h2><p class="lead">${esc(T.rulesHint)}</p>${rules || `<p class="hint">${esc(T.noRules)}</p>`}
        <div class="actions"><button class="btn secondary left" type="button" data-action="addrule">＋ ${esc(T.addRule)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveRules)}</button></div></form>`,
    emails: `
      <form class="card" data-form="weekly" novalidate><h2>${esc(T.emailsTitle)}</h2><p class="lead">${esc(T.emailsHint)}</p>
        <label class="check"><input type="checkbox" name="weekly_email" ${cfg.weekly_email !== 'off' ? 'checked' : ''}> ${esc(T.weeklyOn)}</label>
        <label class="check"><input type="checkbox" name="monthly_email" ${cfg.monthly_email !== 'off' ? 'checked' : ''}> ${esc(T.monthlyOn)}</label>
        <label class="check"><input type="checkbox" name="payday_email" ${cfg.payday_email !== 'off' ? 'checked' : ''}> ${esc(T.paydayOn)}</label>
        <label class="check"><input type="checkbox" name="bill_email" ${cfg.bill_email !== 'off' ? 'checked' : ''}> ${esc(T.billEmailOn)}</label>
        <label class="check"><input type="checkbox" name="close_email" ${cfg.close_email === 'on' ? 'checked' : ''}> ${esc(T.closeEmailOn)}</label>
        <label class="check"><input type="checkbox" name="calendar_sync" ${cfg.calendar_sync === 'on' ? 'checked' : ''}> ${esc(T.calendarOn)}</label>
        ${cfg.calendar_status ? `<p class="hint">${esc(T.calendarStatus(cfg.calendar_status))}</p>` : ''}
        <p class="hint">${esc(T.noteEmailHint)}</p>
        <p class="hint">${esc(T.alertsAlways)}</p>
        <div class="actions"><button class="btn secondary left" type="button" data-action="sendsummary">${esc(T.weeklySendNow)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div></form>`,
    prefs: `
      <form class="card" data-form="config" novalidate><h2>${esc(T.preferences)}</h2>
        <div class="fields2" style="margin-top:12px">
          ${field(T.language, `<select name="language"><option value="" ${!cfg.language ? 'selected' : ''}>${esc(T.languageAuto)}</option><option value="id" ${cfg.language === 'id' ? 'selected' : ''}>Bahasa Indonesia</option><option value="en" ${cfg.language === 'en' ? 'selected' : ''}>English</option></select>`)}
          ${field(T.payday, `<input name="payday_day" type="number" min="1" max="31" value="${esc(cfg.payday_day)}">`, { help: T.paydayHelp })}
          ${field(T.summaryPeriod, `<select name="summary_period"><option value="month" ${cfg.summary_period !== 'payday' ? 'selected' : ''}>${esc(T.periodMonth)}</option><option value="payday" ${cfg.summary_period === 'payday' ? 'selected' : ''}>${esc(T.periodPayday(Number(cfg.payday_day) || 28))}</option></select>`, { help: T.summaryPeriodHelp, wide: true })}
          ${field(T.bigAmount, `<input name="big_amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(cfg.big_amount)}">`, { help: T.bigAmountHelp })}
          ${field(T.salarySettings, `<select name="salary_stream">${accountOptions(cfg.salary_stream, T.chooseAccount)}</select>`, { help: T.salarySettingsHelp })}
          ${field(T.salaryAmountSetting, `<input name="salary_amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(cfg.salary_amount)}">`, { help: T.salaryAmountSettingHelp })}
          ${field(T.ownerNames, `<input name="owner_bank_names" value="${esc(cfg.owner_bank_names)}">`, { help: T.ownerNamesHelp, wide: true })}
          ${field(T.themeLabel, `<select name="theme">${[['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark]].map(([v, l]) => `<option value="${v}" ${readTheme() === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`, { help: T.themeHelp })}
        </div>${saveRow(T.saveChanges)}</form>`,
    more: `
      <section class="card"><h2>${esc(T.more)}</h2>
        <div class="rows"><div class="rowi"><span class="what"><b>${esc(T.selftest)}</b><span class="meta">${esc(s.selftest || '—')}</span></span></div>
          ${s.push ? `<a class="rowi" target="_top" href="${esc(s.push.site)}/pasang"><span class="what"><b>${esc(T.installTitle)}</b><span class="meta">${esc(T.installHint)}</span></span><span class="chev">↗</span></a>` : ''}
          ${(s.archives || []).map((a) => `<a class="rowi" target="_blank" rel="noopener" href="${esc(a.url)}"><span class="what"><b>${esc(T.archiveOf(a.year))}</b><span class="meta">${esc(T.archiveHint)}</span></span><span class="chev">↗</span></a>`).join('')}</div>
        <div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="${esc(state.boot.sheetUrl || '#')}">${esc(T.openSheet)} ↗</a></div></section>`,
    goals: goalsForm(s),
  };
  const conn = (s.connections || [])[0];
  const syncNote = !conn || !conn.last_sync ? T.neverSynced : /^ERROR/.test(String(conn.last_status || '')) ? `⚠ ${T.syncProblem}` : T.syncHealthy;
  const emailsOn = ['weekly_email', 'monthly_email', 'payday_email', 'bill_email'].filter((k) => cfg[k] !== 'off').length + (cfg.close_email === 'on' ? 1 : 0);
  const lang = cfg.language === 'en' ? 'English' : cfg.language === 'id' ? 'Bahasa Indonesia' : T.languageAuto;
  const groups = [
    [T.setGroupRoutine, [['monthend', T.monthEnd, T.monthEndShort], ['import', T.importTitle, (s.imports || []).length ? T.importLast(new Date(s.imports[0].at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })) : T.importNever], ['sync', T.settingsSync, syncNote]]],
    [T.setGroupMoney, [['accounts', T.accountsTitle, T.nAccounts(s.accounts.length)], ['budgets', T.budgetsTitle, T.nBudgets(s.budgets.length)], ['goals', T.goalsTitle, T.nGoals((s.goals || []).length)], ['assets', T.assetsTitle, T.nAssets((s.assets || []).length)], ['cards', T.cardsTitle, T.nCards((s.cards || []).length)]]],
    [T.setGroupAuto, [['categories', T.categoriesTitle, T.nCategories(s.categories.income.length, s.categories.expense.length)], ['rules', T.rulesTitle, T.nRules(s.rules.length)], ['plans', T.plansTitle, T.nPlans((s.plans || []).length)], ['emails', T.emailsTitle, T.nEmailsOn(emailsOn, 5)], ['notif', T.notifTitle, s.push ? T.nDevices(s.push.devices.length) : T.notifOff]]],
    [T.setGroupApp, [['household', T.hhTitle, (s.household && s.household.partner && s.household.partner.name) || T.hhNone], ['prefs', T.preferences, T.prefSummary(lang, Number(cfg.payday_day) || 28)], ['more', T.more, T.moreSummary]]],
  ];
  if (state.settingsSection && !sections[state.settingsSection]) state.settingsSection = null;
  const open = state.settingsSection || 'monthend';
  const index = groups.map(([g, rows]) => `<h2 class="set-group">${esc(g)}</h2><div class="card rows set-list">${rows.map(([k, label, sum]) => `
    <button class="rowi set-row ${k === open ? 'on' : ''}" data-action="setsection" data-section="${k}" ${k === open ? 'aria-current="true"' : ''}>
      <span class="what"><b>${esc(label)}</b><span class="meta">${esc(sum)}</span></span><span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>`).join('');
  setView(`<div class="settings ${state.settingsSection ? 'show-detail' : ''}">
    <header class="page-head set-head"><div><h1>${esc(T.tabSettings)}</h1><p class="sub">${esc(T.settingsSub)}</p></div></header>
    <nav class="set-index" aria-label="${esc(T.tabSettings)}">${index}</nav>
    <div class="set-detail"><button class="btn plain set-back" type="button" data-action="setsection" data-section="">‹ ${esc(T.tabSettings)}</button>
${sections[open]}
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

// ---------------------------------------------------------------- Theme
// Light, dark, or the device's own setting; kept in this browser (each device can differ).
const THEME_KEY = 'cashflow.theme.v1';
function readTheme() {
  try { return window.localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
}
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme(mode) {
  const m = mode === 'light' || mode === 'dark' ? mode : 'auto';
  if (m === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', m);
  try { window.localStorage.setItem(THEME_KEY, m); } catch (e) { /* storage unavailable */ }
  const dark = isDark();
  const btn = $('#themeBtn');
  if (btn) { btn.setAttribute('aria-label', dark ? T.themeToLight : T.themeToDark); btn.title = dark ? T.themeToLight : T.themeToDark; }
  const meta = $('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', dark ? '#000000' : '#f5f5f7');
}
function toggleTheme() {
  applyTheme(isDark() ? 'light' : 'dark');
  toast(isDark() ? T.themeNowDark : T.themeNowLight);
}

// ---------------------------------------------------------------- Notifications
// Things that need the owner: built from the data already on screen. Which ones were already
// seen is kept in this browser; the bell's number counts the new ones.
const SEEN_KEY = 'cashflow.seen.v1';
function readSeen() {
  try { return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
}
function notifications() {
  const out = [];
  if (!state.boot) return out;
  const r = state.review;
  if (r && r.pending.length) {
    out.push({ id: `pending:${r.pending.length}:${r.pending[0].id}`, kind: 'warn', title: T.notifPending(r.pending.length), text: T.notifPendingSub, go: 'review', goLabel: T.reviewNow });
  }
  for (const x of (r && r.salary) || []) {
    out.push({ id: `salary:${x.month}`, kind: 'warn', title: T.notifSalary(dateLabel(x.date, { weekday: false })), text: T.salaryNoticeSub, go: 'review', goLabel: T.salaryRecord });
  }
  for (const e of (r && r.errors) || []) {
    out.push({ id: `unread:${e.gmail_id}`, kind: 'warn', title: T.notifUnread, text: `${e.subject || e.from} · ${e.reason}`, go: 'review', goLabel: T.reviewNow });
  }
  const c = (state.boot.connections || [])[0];
  if (c && /^ERROR/.test(String(c.last_status || ''))) {
    out.push({ id: `sync:${c.last_sync}`, kind: 'bad', title: T.syncProblem, text: String(c.last_status).replace(/^ERROR:\s*/, '').split(' | ')[0], go: 'settings', section: 'sync', goLabel: T.notifOpenSettings });
  }
  const month = currentMonth();
  const d = state.dashByMonth[month];
  for (const b of (d && d.budgets) || []) {
    if (b.ratio >= 1) out.push({ id: `budget:${month}:${b.category}:over`, kind: 'bad', title: T.notifBudgetOver(b.category), text: T.notifBudgetSub(rp(b.spent), rp(b.budget)), category: b.category, goLabel: T.seeList });
    else if (b.ratio >= 0.8) out.push({ id: `budget:${month}:${b.category}:near`, kind: 'warn', title: T.notifBudgetNear(b.category, Math.round(b.ratio * 100)), text: T.notifBudgetSub(rp(b.spent), rp(b.budget)), category: b.category, goLabel: T.seeList });
  }
  for (const b of (d && d.big) || []) {
    out.push({ id: `big:${b.id}`, kind: 'info', title: T.notifBig(b.description, rp(b.amount)), text: `${dateLabel(b.date, { weekday: false })}${b.category ? ` · ${b.category}` : ''}`, q: b.description, goLabel: T.seeList });
  }
  for (const i of (d && d.recurring && d.recurring.items) || []) {
    if (i.daysLeft > 3 || i.daysLeft < -7) continue;
    const whenText = i.daysLeft < 0 ? T.recurringLate(dateLabel(i.nextDate, { weekday: false }), -i.daysLeft) : i.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(i.nextDate, { weekday: false }), i.daysLeft);
    out.push({ id: `bill:${i.name}:${i.nextDate}`, kind: 'info', title: T.notifBill(i.name, rp(i.amount)), text: whenText, q: i.name, goLabel: T.seeList });
  }
  return out;
}
function updateBell() {
  const btn = $('#bellBtn');
  if (!btn) return;
  const seen = readSeen();
  const fresh = notifications().filter((n) => !seen.has(n.id)).length;
  const count = $('#bellCount');
  count.hidden = !fresh;
  count.textContent = String(fresh);
  btn.setAttribute('aria-label', fresh ? T.notifNew(fresh) : T.notifications);
  btn.title = btn.getAttribute('aria-label');
}
function openNotifications() {
  const list = notifications();
  const seen = readSeen();
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.notifications)}</h2>${list.length ? `<p class="lead">${esc(T.notifHint)}</p><div class="notif-list">${list.map((n) => `
    <button type="button" class="notif ${esc(n.kind)} ${seen.has(n.id) ? '' : 'new'}" data-action="notifgo" data-tab="${esc(n.go || '')}" data-section="${esc(n.section || '')}" data-category="${esc(n.category || '')}" data-q="${esc(n.q || '')}">
      <span class="dot" aria-hidden="true"></span><span><b>${esc(n.title)}</b><span class="meta">${esc(n.text)}</span></span>
      <span class="go">${esc(n.goLabel)} ›</span></button>`).join('')}</div>`
    : `<div class="empty"><div class="big" aria-hidden="true">✓</div><b>${esc(T.notifEmpty)}</b>${esc(T.notifEmptySub)}</div>`}
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  $('#modal').classList.add('open');
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(list.map((n) => n.id))); } catch (e) { /* storage unavailable */ }
  updateBell();
}
function goNotification(el) {
  closeModal();
  if (el.dataset.category || el.dataset.q) return drill(el);
  if (el.dataset.tab === 'settings') state.settingsSection = el.dataset.section || null;
  return show(el.dataset.tab || 'dashboard');
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
const FRESH_MS = 10 * 60000;
const TIMING_KEY = 'cashflow.lastLoad.v1';
function readCache() {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}
const POLL_MS = 60000;
/** Cheap check (no spreadsheet on Google's side): refresh only when the sync changed something. */
async function pollChanges() {
  if (document.hidden || queue.length || refreshing || !state.boot) return;
  try {
    const s = await call('stamp');
    const c = (state.boot.connections || [])[0];
    if (c && s.checked && (!c.last_sync || s.checked > Date.parse(c.last_sync))) {
      c.last_sync = new Date(s.checked).toISOString();
      updateNav();
    }
    if (s.stamp && Number(s.stamp) > Date.parse(state.dataAt || 0)) scheduleRefresh(0);
  } catch (e) { /* next minute */ }
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
  if (!a || a === 'go') {
    if (el.dataset.tab === 'settings') state.settingsSection = el.dataset.section || null;
    return show(el.dataset.tab);
  }
  if (a === 'setsection') {
    state.settingsSection = el.dataset.section || null;
    viewSettings(state.settings);
    if (typeof window.scrollTo === 'function') try { window.scrollTo(0, 0); } catch (err) { /* not available */ }
    return null;
  }
  if (a === 'notifgo') return goNotification(el);
  if (a === 'reload') return show(state.tab);
  if (a === 'reloadpage') { window.location.reload(); return null; }
  if (a === 'setmonth') { state.month = el.dataset.month; return show('dashboard'); }
  if (a === 'drill') return drill(el);
  if (a === 'kind') { state.addKind = el.dataset.kind; return viewAdd(); }
  if (a === 'more') { state.limit += 50; return showResults(); }
  if (a === 'trendmonth') { state.filters.month = state.filters.month === el.dataset.month ? '' : el.dataset.month; state.filters.from = ''; state.filters.to = ''; state.limit = 50; return viewTransactions(); }
  if (a === 'togglefilters') {
    state.filtersOpen = !state.filtersOpen;
    el.closest('.filters').classList.toggle('open', state.filtersOpen);
    el.setAttribute('aria-expanded', String(state.filtersOpen));
    return null;
  }
  if (a === 'unfilter') {
    if (el.dataset.key === 'period') { state.filters.from = ''; state.filters.to = ''; } else state.filters[el.dataset.key] = '';
    state.limit = 50;
    return viewTransactions();
  }
  if (a === 'resetfilters') { state.filters = { q: '', month: '', from: '', to: '', stream: '', category: '', status: '', direction: '' }; state.limit = 50; return viewTransactions(); }
  if (a === 'preset') { setPreset(el.dataset.p); state.limit = 50; return viewTransactions(); }
  if (a === 'kindchip') { setKind(el.dataset.k); state.limit = 50; return viewTransactions(); }
  if (a === 'dashview') { state.dashView = el.dataset.view; return viewDashboard(); }
  if (a === 'usual') return useUsual(Number(el.dataset.i));
  if (a === 'bills') return openBills();
  if (a === 'tagbudget') return openTagBudget(el.dataset.tag || '', el.dataset.budget || '');
  if (a === 'closeday' || a === 'reopenday') {
    const r = state.review;
    const date = el.dataset.date || state.boot.today;
    if (r && r.day && date !== state.boot.today) { delete r.day.yesterday; r.day.streak += 1; keepInputs(viewReview); } else if (r && r.day) { r.day.closed = a === 'closeday'; if (r.day.closed) r.day.streak += 1; else r.day.streak = Math.max(0, r.day.streak - 1); keepInputs(viewReview); }
    if (a === 'closeday') toast(date === state.boot.today ? T.dayClosedToast : T.dayYesterdayClosed);
    return save(a === 'closeday' ? 'closeDay' : 'reopenDay', { date })
      .then((res) => { if (state.review) { state.review.day = { ...state.review.day, ...res }; if (state.tab === 'review') keepInputs(viewReview); } })
      .catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'calckey') { const i = el.closest('form').querySelector('[name=amount]'); i.value += el.dataset.k; i.focus(); showCalc(i); return null; }
  if (a === 'tagihopen') { const x = state.rowsById.get(String(el.dataset.id)); $('#tagihBox').innerHTML = tagihForm(x); $('#tagihBox [name=who]').focus(); return null; }
  if (a === 'owedpaid') {
    const id = el.dataset.id;
    const d = state.dashByMonth[state.month];
    const before = d && d.owed ? JSON.parse(JSON.stringify(d.owed)) : null;
    if (d && d.owed) { const o = d.owed.open.find((x) => x.id === id); d.owed.open = d.owed.open.filter((x) => x.id !== id); if (o) d.owed.total -= o.amount; viewDashboard(); }
    toast(T.owedMarked, { undo: () => { save('owedSet', { id, status: 'open' }).catch(() => {}); if (d && before) { d.owed = before; viewDashboard(); } } });
    return save('owedSet', { id, status: 'paid' }).catch((err) => { if (d && before) { d.owed = before; viewDashboard(); } toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'subs') return openSubs();
  if (a === 'submark') {
    const d = state.dashByMonth[state.month];
    const it = d && d.recurring.items.find((i) => i.name === el.dataset.name);
    if (d && it) { d.recurringMarks = { ...(d.recurringMarks || {}) }; if (el.dataset.mark) d.recurringMarks[it.key] = el.dataset.mark; else delete d.recurringMarks[it.key]; }
    openSubs();
    return save('markRecurring', { name: el.dataset.name, mark: el.dataset.mark }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'addplan' || a === 'delplan') {
    state.settings.plans = readPlans(el.closest('form'));
    if (a === 'addplan') state.settings.plans.push({ name: '', amount: '', direction: 'out', stream: '', category: '', day: '', auto: false });
    else state.settings.plans.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addplan') { const n = $$('.plan-row [data-p=name]'); if (n.length) n[n.length - 1].focus(); }
    return null;
  }
  if (a === 'addcard' || a === 'delcard') {
    state.settings.cards = readCards(el.closest('form'));
    if (a === 'addcard') state.settings.cards.push({ stream: '', statement: '', due: '' });
    else state.settings.cards.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    return null;
  }
  if (a === 'interest') return openInterest();
  if (a === 'who') { state.who = el.dataset.who; state.filters.owner = state.who; state.dashByMonth = {}; return show(state.tab); }
  if (a === 'connectme') {
    el.disabled = true;
    el.textContent = T.hhConnecting;
    return call('connectMe').then(async () => { toast(T.hhConnectedToast); state.allStale = true; viewSettings(await call('settings')); })
      .catch((err) => { el.disabled = false; el.textContent = T.hhConnect; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'pushtest') {
    el.disabled = true;
    return call('pushTest').then((r) => toast(T.notifSent(r.sent))).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' })).finally(() => { el.disabled = false; });
  }
  if (a === 'pushforget') return call('pushForget').then(async () => { toast(T.notifForgotten); viewSettings(await call('settings')); }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  if (a === 'spt') return openSpt(Number(el.dataset.year));
  if (a === 'sptcsv') return sptCsv();
  if (a === 'scanyearly') {
    el.disabled = true;
    el.textContent = T.yearlyScanning;
    return call('scanYearly').then((r) => { toast(T.yearlyFound(r.found)); state.dashByMonth = {}; closeModal(); if (state.tab === 'dashboard') viewDashboard(); })
      .catch((err) => { el.disabled = false; el.textContent = T.yearlyScan; toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }); });
  }
  if (a === 'addasset' || a === 'delasset') {
    state.settings.assets = readAssets(el.closest('form'));
    if (a === 'addasset') state.settings.assets.push({ name: '', kind: 'other', qty: 1, unit_value: '', ticker: '', paid: '' });
    else state.settings.assets.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addasset') { const n = $$('.asset-row [data-a2=name]'); if (n.length) n[n.length - 1].focus(); }
    return null;
  }
  if (a === 'reportmode') { state.reportYearly = el.dataset.mode === 'year'; return viewDashboard(); }
  if (a === 'yearmonth') { state.month = el.dataset.month; state.reportYearly = false; return show('dashboard'); }
  if (a === 'exportcsv') {
    if (!state.all) { call('list', { limit: 1000000 }).then((r) => { setAll(r.rows); exportCsv(); }).catch((err) => toast(`${T.error}: ${err.message}`, { kind: 'bad' })); return null; }
    return exportCsv();
  }
  if (a === 'selectmode') { state.selecting = !state.selecting; state.picked = new Set(); return viewTransactions(); }
  if (a === 'pick') {
    const id = String(el.dataset.id);
    if (state.picked.has(id)) state.picked.delete(id); else state.picked.add(id);
    return showResults();
  }
  if (a === 'pickapply') { const cat = $('#pickCat').value; if (!cat) { $('#pickCat').focus(); return null; } return applyPicked(cat, ''); }
  if (a === 'pickignore') return applyPicked('', 'ignored');
  if (a === 'undoimport') {
    if (!window.confirm(T.importUndoConfirm)) return null;
    return call('undoImport', { batch: el.dataset.batch }).then(async () => {
      toast(T.importUndone);
      state.allStale = true; state.dashByMonth = {};
      viewSettings(await call('settings'));
      scheduleRefresh(0);
    }).catch((err) => toast(`${T.notSaved}: ${err.message}`, { kind: 'bad' }));
  }
  if (a === 'hide') {
    hideAmounts = !hideAmounts;
    try { window.localStorage.setItem(HIDE_KEY, hideAmounts ? '1' : '0'); } catch (err) { /* this visit only */ }
    toast(hideAmounts ? T.amountsHidden : T.amountsShown);
    return show(state.tab);
  }
  if (a === 'drillday') {
    state.filters = { q: '', month: '', from: el.dataset.date, to: el.dataset.date, stream: '', category: '', status: '', direction: '' };
    state.limit = 50;
    return show('transactions');
  }
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
  if (a === 'addgoal' || a === 'delgoal') {
    const form = el.closest('form');
    state.settings.goals = readGoals(form);
    if (a === 'addgoal') state.settings.goals.push({ stream: '', name: '', target: '', target_date: '' });
    else state.settings.goals.splice(Number(el.dataset.i), 1);
    viewSettings(state.settings);
    if (a === 'addgoal') { const sel = $$('.goal-row [data-g=stream]'); if (sel.length) sel[sel.length - 1].focus(); }
    return null;
  }
  if (a === 'dupcancel') { $('#addDup').innerHTML = ''; return null; }
  if (a === 'dupsave') { state.addForce = true; return submitAdd(el.closest('form')); }
  if (a === 'close') return closeModal();
  if (a === 'sync') return syncNow(el);
  if (a === 'theme') return toggleTheme();
  if (a === 'notifications') return openNotifications();
  if (a === 'notifgo') return goNotification(el);
  if (a === 'approve') return approve(card);
  if (a === 'salarysave') return saveSalary(card);
  if (a === 'salaryskip') return skipSalary(card);
  if (a === 'hiderec') return hideRecurring(el.dataset.name);
  if (a === 'fillbudgets') return fillBudgets(el.closest('form'));
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

/**
 * Balance check of every account on one form: the app's balance and the last check next to each,
 * the difference as you type, and what to record it as (Penyesuaian, or a real income/expense
 * category, e.g. money that came into BCA, which never emails about money coming in).
 */
function balanceForm(s) {
  const bal = new Map((s.balances || []).map((b) => [b.stream, b.balance]));
  const checks = s.lastChecks || {};
  const rows = s.accounts.map((a) => {
    const last = checks[a.stream];
    return `<fieldset class="acct-row bal-row" data-stream="${esc(a.stream)}" data-app="${esc(bal.get(a.stream) || 0)}"><legend>${esc(a.stream)}</legend>
      <p class="bal-meta">${esc(T.inApp)} <b>${rp(bal.get(a.stream) || 0)}</b> · ${esc(last ? T.lastChecked(dateLabel(last, { weekday: false })) : T.neverChecked)}</p>
      ${field(T.actualBalance, '<input data-k="actual" type="number" inputmode="decimal" step="any" autocomplete="off">', { help: T.leaveEmpty })}
      <p class="bal-diff" role="status"></p>
      <div class="bal-how" hidden>${field(T.diffAs, '<select data-k="category"></select>', { help: T.diffAsHelp })}</div>
      ${last ? '' : `<label class="check"><input type="checkbox" data-k="as_opening" ${(Number(a.opening_balance) || 0) ? '' : 'checked'}> ${esc(T.asOpening)}</label>`}
    </fieldset>`;
  }).join('');
  return `<form class="card" data-form="monthend" novalidate><h2>${esc(T.monthEnd)}</h2><p class="lead">${esc(T.monthEndHintAll)}</p>
    ${field(T.date, `<input name="date" type="date" value="${esc(state.boot.today)}">`)}
    <div class="bal-list">${rows}</div>
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.checkBalances)}</button></div></form>`;
}

/** One account's row: the difference in words, and the choice of what to record it as. */
function updateBalRow(row) {
  const input = $('[data-k=actual]', row);
  const out = $('.bal-diff', row);
  const how = $('.bal-how', row);
  const opening = $('[data-k=as_opening]', row);
  if (input.value === '' || !Number.isFinite(Number(input.value))) { out.textContent = ''; out.className = 'bal-diff'; how.hidden = true; return; }
  const diff = Math.round((Number(input.value) - Number(row.dataset.app)) * 100) / 100;
  out.className = `bal-diff ${diff === 0 ? 'same' : diff > 0 ? 'more' : 'less'}`;
  out.textContent = diff === 0 ? T.diffSame : diff > 0 ? T.diffMore(rp(diff)) : T.diffLess(rp(-diff));
  how.hidden = diff === 0 || !!(opening && opening.checked);
  if (how.hidden) return;
  const sel = $('[data-k=category]', how);
  const want = diff > 0 ? 'in' : 'out';
  if (sel.dataset.dir !== want) {
    const list = want === 'in' ? state.boot.categories.income : state.boot.categories.expense;
    sel.innerHTML = `<option value="Penyesuaian">${esc(T.adjustmentOption)}</option><optgroup label="${esc(want === 'in' ? T.income : T.expense)}">${list.map((c) => `<option>${esc(c)}</option>`).join('')}</optgroup>`;
    sel.dataset.dir = want;
  }
}

function goalsForm(s) {
  const goals = s.goals || [];
  const rows = goals.map((g, i) => `<fieldset class="acct-row goal-row" data-i="${i}"><legend>${esc(g.name || g.stream || T.newGoal)}</legend>
    <div class="fields2">
      ${field(T.account, `<select data-g="stream">${accountOptions(g.stream)}</select>`)}
      ${field(T.goalName, `<input data-g="name" value="${esc(g.name)}">`, { help: T.goalNameHelp })}
      ${field(T.goalTarget, `<input data-g="target" type="number" inputmode="decimal" step="any" min="0" value="${esc(g.target)}">`)}
      ${field(T.goalDate, `<input data-g="target_date" type="date" value="${esc(String(g.target_date || '').slice(0, 10))}">`, { help: T.optional })}
    </div>
    <div class="actions"><button class="btn danger small" type="button" data-action="delgoal" data-i="${i}">${esc(T.deleteGoal)}</button></div></fieldset>`).join('');
  return `<form class="card" data-form="goals" novalidate><h2>${esc(T.goalsTitle)}</h2><p class="lead">${esc(T.goalsSettingsHint)}</p>${rows || `<p class="hint">${esc(T.noGoals)}</p>`}
    <div class="actions"><button class="btn secondary left" type="button" data-action="addgoal">＋ ${esc(T.addGoal)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveGoals)}</button></div></form>`;
}
const readGoals = (form) => $$('.goal-row', form).map((row) => Object.fromEntries($$('[data-g]', row).map((i) => [i.dataset.g, i.value])));

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
    const amount = amountValue(d.amount);
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
    applyTheme(d.theme);
    return saveForm(form, 'saveConfig', d, async () => { applyLanguage(d.language); state.month = ''; state.dashByMonth = {}; await refresh(); if (state.tab === 'settings') viewSettings(); });
  }
  if (kind === 'tagbudget') {
    const tag = form.querySelector('[name=tag]').value.replace(/^#/, '').trim();
    const amount = amountValue(form.querySelector('[name=amount]').value || '0');
    let ok = fieldMessage(form.querySelector('[name=tag]'), /^[\p{L}\p{N}_-]+$/u.test(tag) ? '' : T.errTag);
    ok = fieldMessage(form.querySelector('[name=amount]'), amount >= 0 ? '' : T.errAmount) && ok;
    if (!ok) return null;
    return saveForm(form, 'setTagBudget', { tag, amount: amount || 0 }, () => { closeModal(); state.dashByMonth = {}; if (state.tab === 'dashboard') viewDashboard(); });
  }
  if (kind === 'tagih') {
    const names = form.querySelector('[name=who]').value.split(',').map((n) => n.trim()).filter(Boolean);
    const each = amountValue(form.querySelector('[name=each]').value);
    let ok = fieldMessage(form.querySelector('[name=who]'), names.length ? '' : T.errTagihWho);
    ok = fieldMessage(form.querySelector('[name=each]'), each > 0 ? '' : T.errAmount) && ok;
    if (!ok) return null;
    return saveForm(form, 'tagih', { txId: form.dataset.id, people: names.map((who) => ({ who, amount: each })) }, () => {
      state.dashByMonth = {};
      form.querySelector('.state').textContent = `✓ ${T.tagihDone(names.length, rp(each * names.length))}`;
      form.querySelector('button[type=submit]').disabled = true;
    });
  }
  if (kind === 'plans') {
    const plans = readPlans(form).map((x) => ({ ...x, amount: amountValue(x.amount), day: Number(x.day) }));
    return saveForm(form, 'savePlans', { plans }, async () => { viewSettings(await call('settings')); });
  }
  if (kind === 'household') {
    const v = (n) => form.querySelector(`[name=${n}]`).value.trim();
    const email = v('partner_email').toLowerCase();
    let ok = fieldMessage(form.querySelector('[name=partner_email]'), !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : T.hhErrEmail);
    ok = fieldMessage(form.querySelector('[name=partner_name]'), !email || v('partner_name') ? '' : T.hhErrName) && ok;
    if (!ok) return null;
    return saveForm(form, 'saveConfig', { partner_name: v('partner_name'), partner_email: email, partner_bank_names: v('partner_bank_names') }, async () => { await refresh(); viewSettings(await call('settings')); });
  }
  if (kind === 'notif') {
    const events = NOTIF_EVENTS.filter((k) => form.querySelector(`[name=push_${k}]`).checked);
    return saveForm(form, 'saveConfig', { push_events: events });
  }
  if (kind === 'cards') {
    const cards = readCards(form).map((c) => ({ stream: c.stream, statement: Number(c.statement), due: Number(c.due) }));
    return saveForm(form, 'saveCards', { cards }, async () => { state.dashByMonth = {}; viewSettings(await call('settings')); });
  }
  if (kind === 'assets') {
    const assets = readAssets(form).map((x) => ({ ...x, unit_value: amountValue(x.unit_value) || 0, paid: amountValue(x.paid) || '', qty: x.qty === '' ? 1 : Number(x.qty) }));
    return saveForm(form, 'saveAssets', { assets }, async () => { state.dashByMonth = {}; viewSettings(await call('settings')); });
  }
  if (kind === 'import') {
    const rows = importChosen(form);
    if (!rows.length || !state.importRows) return null;
    const imp = state.importRows;
    return saveForm(form, 'importStatement', { stream: imp.stream, rows, file: imp.file }, async (r) => {
      state.importRows = null;
      state.allStale = true; state.dashByMonth = {};
      const fresh = await call('settings');
      if (state.tab === 'settings' && state.settingsSection === 'import') {
        viewSettings(fresh);
        const st = $('form[data-form=import] .state');
        if (st) { st.className = 'state ok'; st.textContent = `✓ ${T.importSaved(r.added, r.pending)}${r.openingChange ? ` ${T.importOpening(imp.stream, rp(r.openingChange))}` : ''}`; }
      }
      scheduleRefresh(0);
    });
  }
  if (kind === 'monthend') {
    const items = $$('.bal-row', form).filter((row) => $('[data-k=actual]', row).value !== '').map((row) => {
      const how = $('.bal-how', row);
      const opening = $('[data-k=as_opening]', row);
      return { stream: row.dataset.stream, actual: Number($('[data-k=actual]', row).value), asOpening: !!(opening && opening.checked), category: how.hidden ? '' : $('[data-k=category]', how).value };
    });
    const st = form.querySelector('.state');
    if (!items.length) { st.className = 'state bad'; st.textContent = T.errNoBalances; const first = $('[data-k=actual]', form); if (first) first.focus(); return null; }
    return saveForm(form, 'balanceCheckAll', { date: d.date, items }, async (r) => {
      const lines = r.results.map((x) => (x.opening != null ? T.balOpening(x.stream, rp(x.opening))
        : x.adjusted ? T.balAdjusted(x.stream, `${x.adjusted > 0 ? '+' : '−'}${rp(Math.abs(x.adjusted))}`, x.category) : T.balMatched(x.stream)));
      state.allStale = true;
      state.dashByMonth = {};
      // Fresh balances and "last checked" dates on the form, with the result kept underneath.
      const fresh = await call('settings');
      if (state.tab === 'settings' && (state.settingsSection || 'monthend') === 'monthend') {
        viewSettings(fresh);
        const st2 = $('form[data-form=monthend] .state');
        if (st2) { st2.className = 'state ok'; st2.textContent = `✓ ${lines.join(' · ')}`; }
      }
      scheduleRefresh(0);
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
  if (kind === 'goals') {
    const goals = readGoals(form).map((g) => ({ ...g, target: Number(g.target) || 0 }));
    let ok = true;
    $$('.goal-row', form).forEach((row, i) => {
      ok = fieldMessage($('[data-g=stream]', row), goals[i].stream ? '' : T.errNoAccount) && ok;
      ok = fieldMessage($('[data-g=target]', row), goals[i].target > 0 ? '' : T.errAmount) && ok;
    });
    if (!ok) return null;
    return saveForm(form, 'saveGoals', { goals }, () => { state.settings.goals = goals; state.dashByMonth = {}; });
  }
  if (kind === 'weekly') {
    const v = (n) => (form.querySelector(`[name=${n}]`).checked ? 'on' : 'off');
    return saveForm(form, 'saveConfig', { weekly_email: v('weekly_email'), monthly_email: v('monthly_email'), payday_email: v('payday_email'), bill_email: v('bill_email'), close_email: v('close_email'), calendar_sync: v('calendar_sync') }, (r) => {
      if (r && r.calendar) form.querySelector('.state').textContent = r.calendar.error ? `⚠ ${T.calendarFailed}` : `✓ ${T.calendarDone(r.calendar.events)}`;
    });
  }
  return null;
}

function onChange(e) {
  if (e.target.dataset.k === 'as_opening') { updateBalRow(e.target.closest('.bal-row')); return null; }
  if (e.target.name === 'me' && e.target.closest('form[data-form=tagih]')) { updateTagih(e.target.closest('form')); return null; }
  if (e.target.dataset.p === 'direction') { const f = e.target.closest('form'); state.settings.plans = readPlans(f); viewSettings(state.settings); return null; }
  const impForm = e.target.closest('form[data-form=import]');
  if (impForm && (e.target.name === 'statement' || e.target.name === 'stream')) { readStatement(impForm); return null; }
  if (impForm && e.target.dataset.imp) {
    const n = importChosen(impForm).length;
    const btn = impForm.querySelector('button[type=submit]');
    btn.textContent = T.importSave(n); btn.disabled = !n;
    return null;
  }
  if (e.target.name === 'theme' && e.target.closest('form[data-form=config]')) { applyTheme(e.target.value); return null; }
  const f = e.target.closest('[data-filter]');
  if (f) {
    state.filters[f.dataset.filter] = f.value;
    if (f.dataset.filter === 'month') { state.filters.from = ''; state.filters.to = ''; }
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
  applyTheme(readTheme());
}

export async function start() {
  applyTheme(readTheme());
  document.addEventListener('click', onClick);
  document.addEventListener('error', (e) => { // load errors don't bubble, so this listens while capturing
    const box = e.target?.parentElement;
    if (e.target?.tagName === 'IMG' && box?.classList.contains('logo')) { box.classList.remove('logo'); box.textContent = box.dataset.fallback; }
  }, true);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal();
    if (e.key === 'Enter' && e.target.id === 'quickIn') { e.preventDefault(); const f = $('form[data-form=add]'); if (f) submitAdd(f); return; }
    if (e.key === 'Enter' && e.target.id === 'quickDay' && e.target.value.trim()) { e.preventDefault(); const t = e.target.value; e.target.value = ''; quickFromReview(t); return; }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === 'n' || e.key === 'N') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !$('#modal').classList.contains('open') && state.boot) show('add');
  });
  let searchTimer;
  document.addEventListener('input', (e) => {
    if (e.target.closest('form[data-form=split]')) updateSplitLeft();
    if (e.target.closest('form[data-form=interest]')) updateInterest(e.target.closest('form'));
    if (e.target.id === 'quickIn') applyQuick(e.target.value);
    if (e.target.matches && e.target.matches('.amount-input, .calc-input')) showCalc(e.target);
    const tg = e.target.closest('form[data-form=tagih]');
    if (tg) { if (e.target.name === 'each') e.target.dataset.touched = '1'; else updateTagih(tg); }
    if (e.target.dataset.k === 'actual' && e.target.closest('.bal-row')) updateBalRow(e.target.closest('.bal-row'));
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
  // A short link (/tambah, /cek ...) asks for a screen; otherwise Review when something waits.
  const asked = window.__TAB__ || '';
  const firstTab = (data) => asked || (data.review.pending.length || (data.review.salary || []).length ? 'review' : 'dashboard');
  if (window.__PUSH__) {
    state.settingsSection = 'notif';
    setTimeout(() => toast(window.__PUSH__ === 'ok' ? T.notifAdded : T.notifBad, { kind: window.__PUSH__ === 'ok' ? 'ok' : 'bad' }), 600);
  }
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
  // While the page is open, fresh numbers every 10 minutes, and every minute a quick question to
  // Google ("did the sync add anything?") so a new bank transaction shows up within a minute or two.
  setInterval(() => { if (!document.hidden) scheduleRefresh(0); }, FRESH_MS);
  setInterval(pollChanges, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollChanges(); });
  // The sync refreshes the data built into the page every 10 minutes, and every change refreshes
  // it too: when it is that fresh, opening the app needs no extra request to Google.
  const age = instant ? Date.now() - Date.parse(instant.at) : Infinity;
  if (age > -5 * 60000 && age < FRESH_MS) { status(); return; }
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
