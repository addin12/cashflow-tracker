// What every screen is built from: the view container, form fields, the nav badge, the Us / Me / name switch.

import { svgIcon } from './icons.js';
import { toCsv } from '../core/csv.js';
import { viewDashboard } from './dashboard.js';
import { esc, locale } from './format.js';
import { updateBell } from './notifications.js';
import { viewReview } from './review.js';
import { $, $$, T, state } from './state.js';
import { showResults } from './transactions.js';

export function setView(html) {
  $('#view').innerHTML = html;
  // The yearly chart scrolls sideways on a phone (a 44px tap target per month): start on the month that is open.
  const chart = $('.year-chart');
  const on = chart && (chart.querySelector('.m.on') || chart.querySelector('.m:not(:disabled):last-of-type'));
  if (on) chart.scrollLeft = on.offsetLeft - (chart.clientWidth - on.offsetWidth) / 2;
}

export const skeleton = (title) => setView(`<header class="page-head"><div><h1>${esc(title)}</h1></div></header>${'<div class="skeleton"></div>'.repeat(4)}`);

export function failed(e) {
  setView(`<div class="card empty error"><b>${esc(T.error)}</b>${esc(e.message)}<div class="actions" style="justify-content:center"><button class="btn primary" data-action="reload">${esc(T.retry)}</button></div></div>`);
}

/** Re-render the current screen from local data, keeping half-filled review cards as they are. */
export function repaint() {
  if (state.tab === 'review') keepInputs(viewReview);
  else if (state.tab === 'dashboard' && state.dashByMonth[state.month]) viewDashboard();
  else if (state.tab === 'transactions' && state.all) showResults();
}

const cardById = (id) => $$('.txcard[data-id]').find((c) => c.dataset.id === id);

export function keepInputs(render) {
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

export function categoryOptions(selected, direction) {
  const c = state.boot.categories;
  const groups = direction === 'in'
    ? [[T.income, c.income], [T.expense, c.expense], [T.otherGroup, c.fixed]]
    : [[T.expense, c.expense], [T.income, c.income], [T.otherGroup, c.fixed]];
  return `<option value="">${esc(T.chooseCategory)}</option>${groups.map(([label, list]) => `<optgroup label="${esc(label)}">${
    list.map((x) => `<option ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}`;
}

export const accountOptions = (selected, empty = T.chooseAccount) => `${empty ? `<option value="">${esc(empty)}</option>` : ''}${
  state.boot.accounts.map((a) => `<option ${a.stream === selected ? 'selected' : ''}>${esc(a.stream)}</option>`).join('')}`;

/** Shows (or clears) the message under a field. Returns true when there is no problem. */
export function fieldMessage(input, msg) {
  const field = input.closest('.field');
  const el = field && $('.msg', field);
  if (el) el.textContent = msg || '';
  if (field) field.classList.toggle('invalid', !!msg);
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  return !msg;
}

export const field = (label, control, { help = '', wide = false } = {}) => `<label class="field${wide ? ' wide' : ''}"><span>${esc(label)}</span>${control}${help ? `<small>${esc(help)}</small>` : ''}<em class="msg" role="alert"></em></label>`;

export function syncLine() {
  const c = (state.boot.connections || [])[0];
  if (!c || !c.last_sync) return esc(T.neverSynced);
  const at = new Date(c.last_sync).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const bad = /^ERROR/.test(String(c.last_status || '')); // a failed sync writes "ERROR: …"
  return `${esc(T.lastSync)} ${esc(at)}${bad ? ` <span class="badge bad">${svgIcon('alert')} ${esc(T.syncProblem)}</span>` : ''}`;
}

export function updateNav() {
  const n = state.review ? state.review.pending.filter(mineRow).length + (state.review.salary || []).length : 0;
  const count = $('#reviewCount');
  if (count) { count.hidden = !n; count.textContent = String(n); count.setAttribute('aria-label', T.pendingNote(n)); }
  const owner = $('#brandOwner');
  if (owner && state.boot) owner.textContent = state.boot.owner || '';
  const foot = $('#navSync');
  if (foot && state.boot) foot.innerHTML = syncLine();
  updateBell();
}

/** A CSV file the browser saves (Excel reads the BOM as UTF-8). */
export function downloadCsv(name, head, rows) {
  const blob = new Blob([toCsv(head, rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Kita / Aku / Dia: the household, or one person (only when two people share the app). */
export function whoSeg() {
  const m = state.boot.members || [];
  if (m.length < 2) return '';
  const me = state.boot.me;
  const other = m.find((x) => x !== me) || '';
  const btn = (v, label) => `<button type="button" class="${(state.who || '') === v ? 'on' : ''}" aria-pressed="${(state.who || '') === v}" data-action="who" data-who="${esc(v)}">${esc(label)}</button>`;
  return `<div class="seg who" role="group" aria-label="${esc(T.whoLabel)}">${btn('', T.whoAll)}${btn(me, T.whoMe)}${btn(other, other)}</div>`;
}

/** A row of yours (or of nobody in particular): the Review badge and bell count only these; the other person's wait below. */
export const mineRow = (x) => !x.owner || (state.boot.members || []).length < 2 || x.owner === state.boot.me;

/** A link to the email in Gmail, only for mail in one of your own accounts (another person's mail is not in your inbox). */
export const gmailLink = (x, cls) => {
  const mailbox = String(x.gmail || '').toLowerCase();
  const mine = (state.boot.myEmails || []).includes(mailbox);
  if (!x.gmail_id || (mailbox && !mine)) return '';
  const user = mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : '/u/0/';
  return `<a class="${cls}" target="_blank" rel="noopener" href="https://mail.google.com/mail${user}#all/${esc(x.gmail_id)}">${esc(T.openGmail)} ↗</a>`;
};

export const ownPendingCount = (d) => (state.review ? state.review.pending.filter(mineRow).length : d.pendingCount);

export const otherOwner = (x) => (x.owner && (state.boot.members || []).length > 1 && x.owner !== state.boot.me ? ` · ${esc(x.owner)}` : '');

export function toast(msg, { kind = 'ok', undo } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button type="button" data-toast="undo">${esc(T.undo)}</button>` : ''}`;
  el.className = `toast show ${kind}`;
  toast.undo = undo || null;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; toast.undo = null; }, undo ? 6000 : kind === 'bad' ? 7000 : 3000);
}
