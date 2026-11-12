// The bell: what needs you, and which notices you have seen.

import { closeModal, openModal } from './modal.js';
import { currentMonth, dateLabel, esc, rp } from './format.js';
import { mineRow } from './render.js';
import { show } from './router.js';
import { $, T, state } from './state.js';
import { drill } from './transactions.js';

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
  const ownPending = r ? r.pending.filter(mineRow) : [];
  if (ownPending.length) {
    out.push({ id: `pending:${ownPending.length}:${ownPending[0].id}`, kind: 'warn', title: T.notifPending(ownPending.length), text: T.notifPendingSub, go: 'review', goLabel: T.reviewNow });
  }
  for (const x of (r && r.salary) || []) {
    out.push({ id: `salary:${x.month}`, kind: 'warn', title: T.notifSalary(dateLabel(x.date, { weekday: false })), text: T.salaryNoticeSub, go: 'review', goLabel: T.salaryRecord });
  }
  for (const e of (r && r.errors) || []) {
    out.push({ id: `unread:${e.gmail_id}`, kind: 'warn', title: T.notifUnread, text: `${e.subject || e.from} · ${T.unreadShort}`, go: 'review', goLabel: T.reviewNow });
  }
  const c = (state.boot.connections || [])[0];
  if (c && /^ERROR/.test(String(c.last_status || ''))) {
    out.push({ id: `sync:${c.last_sync}`, kind: 'bad', title: T.syncProblem, text: String(c.last_status).replace(/^ERROR:\s*/, '').split(' | ')[0], go: 'settings', section: 'sync', goLabel: T.notifOpenSettings });
  }
  for (const name of state.boot.notConnected || []) {
    const mine = name === state.boot.me;
    out.push({ id: `gmail:${name}`, kind: 'warn', title: mine ? T.notifGmailMine : T.notifGmailOther(name), text: mine ? T.notifGmailMineSub : T.notifGmailOtherSub, go: 'settings', section: 'household', goLabel: T.notifOpenSettings });
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
  for (const c of (d && d.claims) || []) {
    if (c.daysLeft > 7) continue;
    out.push({ id: `claim:${c.id}:${c.due}`, kind: c.daysLeft <= 3 ? 'bad' : 'warn', title: T.notifClaim(c.description, rp(c.amount)), text: T.claimDue(dateLabel(c.due, { weekday: false }), c.daysLeft), q: c.description, goLabel: T.seeList });
  }
  for (const w of (d && d.warranties) || []) {
    if (w.daysLeft > 30) continue;
    out.push({ id: `warranty:${w.name}:${w.date}`, kind: 'info', title: T.notifWarranty(w.name), text: T.warrantyLine(dateLabel(w.date, { weekday: false }), w.daysLeft), go: 'settings', section: 'assets', goLabel: T.notifOpenSettings });
  }
  for (const i of (d && d.recurring && d.recurring.items) || []) {
    if (i.daysLeft > 3 || i.daysLeft < -7) continue;
    const whenText = i.daysLeft < 0 ? T.recurringLate(dateLabel(i.nextDate, { weekday: false }), -i.daysLeft) : i.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(i.nextDate, { weekday: false }), i.daysLeft);
    out.push({ id: `bill:${i.name}:${i.nextDate}`, kind: 'info', title: T.notifBill(i.name, rp(i.amount)), text: whenText, q: i.name, goLabel: T.seeList });
  }
  return out;
}

export function updateBell() {
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

export function openNotifications() {
  const list = notifications();
  const seen = readSeen();
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.notifications)}</h2>${list.length ? `<p class="lead">${esc(T.notifHint)}</p><div class="notif-list">${list.map((n) => `
    <button type="button" class="notif ${esc(n.kind)} ${seen.has(n.id) ? '' : 'new'}" data-action="notifgo" data-tab="${esc(n.go || '')}" data-section="${esc(n.section || '')}" data-category="${esc(n.category || '')}" data-q="${esc(n.q || '')}">
      <span class="dot" aria-hidden="true"></span><span><b>${esc(n.title)}</b><span class="meta">${esc(n.text)}</span></span>
      <span class="go">${esc(n.goLabel)} ›</span></button>`).join('')}</div>`
    : `<div class="empty"><div class="big" aria-hidden="true">✓</div><b>${esc(T.notifEmpty)}</b>${esc(T.notifEmptySub)}</div>`}
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  openModal();
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(list.map((n) => n.id))); } catch (e) { /* storage unavailable */ }
  updateBell();
}

export function goNotification(el) {
  closeModal();
  if (el.dataset.category || el.dataset.q) return drill(el);
  if (el.dataset.tab === 'settings') state.settingsSection = el.dataset.section || null;
  return show(el.dataset.tab || 'dashboard');
}
