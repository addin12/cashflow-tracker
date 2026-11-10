// The Review screen: waiting transactions, salary, and what approving or ignoring does.

import { pendingMatching, ruleFromApproval } from '../core/app.js';
import { svgIcon } from './icons.js';
import { parseQuick } from '../core/quick.js';
import { viewDashboard } from './dashboard.js';
import { patchRow } from './data.js';
import { dateLabel, esc, rp, signed, when } from './format.js';
import { updateBell } from './notifications.js';
import { accountOptions, categoryOptions, field, fieldMessage, gmailLink, keepInputs, mineRow, otherOwner, setView, skeleton, streamLabel, syncLine, toast, updateNav } from './render.js';
import { show } from './router.js';
import { save } from './server.js';
import { $, $$, T, state } from './state.js';
import { firstBadge, tag } from './visuals.js';

export function viewReview() {
  const r = state.review;
  if (!r) return skeleton(T.reviewTitle, 'review');
  const n = r.pending.filter(mineRow).length + (r.salary || []).length;
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
  const card = (x, followers = []) => `
    <article class="card txcard" data-id="${esc(x.id)}">
      <div class="top"><div class="name">${esc(x.description || x.details || T.noName)}</div><div class="amt ${esc(x.direction)}">${signed(x)}</div></div>
      <div class="meta">${esc(when(x))} · ${esc(x.stream ? streamLabel(x.stream) : T.noAccount)}${x.details && x.description ? ` · ${esc(x.details)}` : ''}${otherOwner(x)}${firstBadge(x)}</div>
      ${x.source === 'summary' ? `<p class="hint">${esc(T.summaryHint)}</p>` : ''}
      ${x.stream ? '' : field(T.account, `<select data-field="stream">${accountOptions('')}</select>`)}
      ${field(T.category, `<select data-field="category">${categoryOptions(x.category, x.direction)}</select>`)}
      ${x.description && x.source !== 'summary' ? `<label class="check"><input type="checkbox" data-field="always" checked> ${esc(T.alwaysFor(x.description))}${followers.length ? esc(T.alsoSimilar(followers.length)) : ''}</label>` : ''}
      ${followers.length ? `<details class="similar"><summary>${esc(T.similarList(followers.length))}</summary><div class="rows">${followers.map((f) => `<div class="rowi sub"><span class="what"><span class="meta">${esc(when(f))}${f.stream ? ` · ${esc(f.stream)}` : ''}</span></span><span class="amt ${esc(f.direction)}">${signed(f)}</span></div>`).join('')}</div></details>` : ''}
      ${x.source === 'summary' ? `<div class="actions fill"><button class="btn secondary" data-action="splitsummary" data-id="${esc(x.id)}">${esc(T.summarySplit)}</button></div>` : ''}
      <div class="actions fill"><button class="btn secondary" data-action="ignore">${esc(T.ignore)}</button><button class="btn primary" data-action="approve">${esc(T.saveToReports)}</button></div>
    </article>`;
  const mine = r.pending.filter(mineRow);
  const theirs = r.pending.filter((x) => !mineRow(x));
  const theirName = (theirs[0] && theirs[0].owner) || '';
  // Waiting rows of the same place and direction (with an account) show as one card: approving it with "always" files the rest.
  const fold = (list) => {
    const lead = new Map();
    const out = [];
    for (const x of list) {
      const key = x.description && x.stream && x.source !== 'summary' ? `${x.direction}|${String(x.description).trim().toLowerCase()}` : '';
      if (key && lead.has(key)) lead.get(key).followers.push(x);
      else { const g = { x, followers: [] }; if (key) lead.set(key, g); out.push(g); }
    }
    return out.map((g) => card(g.x, g.followers)).join('');
  };
  const cards = fold(mine);
  const theirCards = theirs.length ? `<h2 class="section-title">${esc(T.waitingFor(theirName, theirs.length))}<small>${esc(T.waitingForHint)}</small></h2>${fold(theirs)}` : '';
  const empty = `<div class="card empty"><div class="big" aria-hidden="true">✓</div><b>${esc(T.reviewEmpty)}</b>${esc(T.reviewEmptySub)}
    <div class="actions" style="justify-content:center"><button class="btn secondary" data-action="go" data-tab="dashboard">${esc(T.seeSummary)}</button></div></div>`;
  const errors = r.errors.map((x) => `
    <div class="rowi"><div class="what"><b>${esc(x.subject || x.from)}</b><div class="meta">${esc(x.reason)}</div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px">${gmailLink(x, 'btn secondary small')}
      <button class="btn plain small" data-action="go" data-tab="add">${esc(T.enterManually)}</button>
      <button class="btn plain small" data-action="dismissmail" data-id="${esc(x.gmail_id)}">${esc(T.dismissMail)}</button></div></div></div>`).join('');
  const rulesCard = r.ruleable ? `<div class="card rowi"><span class="what"><b>${esc(T.rulesWaiting(r.ruleable))}</b></span><button class="btn secondary small" data-action="applyrules">${esc(T.rulesApply)}</button></div>` : '';
  const recent = r.recentAuto.slice(0, 30).map((x) => `
    <button class="rowi" data-action="edit" data-id="${esc(x.id)}"><span class="what"><b>${esc(x.description)}</b><span class="meta">${tag(x.category)} · ${esc(x.stream)} · ${esc(dateLabel(x.date))}</span></span><span class="amt ${esc(x.direction)}">${signed(x)}</span></button>`).join('');
  setView(`
    <header class="page-head"><div><h1>${esc(T.reviewTitle)}</h1><p class="sub">${esc(n ? T.reviewSub(n) : T.reviewSubNone)} · ${syncLine()}</p></div>
      <div class="tools"><button class="btn secondary small" data-action="sync">↻ ${esc(T.syncNow)}</button></div></header>
    <div class="split">
      <section class="stack" aria-label="${esc(T.reviewTitle)}">${rulesCard}${dayCard(r.day, !!(mine.length || (r.salary || []).length))}${salary}${cards || (salary || theirCards ? '' : empty)}${theirCards}</section>
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

export function approve(card) {
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

export function ignore(card) {
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

export function saveSalary(card) {
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

export function skipSalary(card) {
  const month = card.dataset.month;
  const x = takeSalary(month);
  toast(T.salarySkipped, { undo: () => { putSalaryBack(x); save('unskipSalary', { month }).catch(() => {}); } });
  return save('skipSalary', { month }).catch((e) => { putSalaryBack(x); toast(`${T.notSaved}: ${e.message}`, { kind: 'bad' }); });
}

/** "Not a subscription": gone from the card at once, kept out on the server. */
export function hideRecurring(name) {
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
export function fillBudgets(form) {
  const tips = new Map((((state.settings.budgetSuggestionsBy || {})[state.budgetScope || '']) || state.settings.budgetSuggestions || []).map((b) => [b.category, b.amount]));
  let n = 0;
  $$('[data-b]', form).forEach((i) => {
    if (!(Number(i.value) > 0) && tips.has(i.dataset.b)) { i.value = String(tips.get(i.dataset.b)); n += 1; }
  });
  const st = $('.state', form);
  st.className = 'state'; st.textContent = T.budgetsFilled(n);
  return null;
}

/** Review: today's box, to log what no email reports and close the day. */
function dayCard(day, compact = false) {
  if (!day) return '';
  const streak = day.streak ? `<span class="streak" title="${esc(T.streakHint)}">${svgIcon('flame')} ${esc(T.streak(day.streak))}</span>` : '';
  const yesterday = day.yesterday ? `<div class="yesterday"><p>${esc(T.dayYesterdayOpen)}</p><button class="btn secondary small" data-action="closeday" data-date="${esc(day.yesterday)}">${esc(T.dayCloseYesterday)}</button></div>` : '';
  // Closed: one quiet row.
  if (day.closed) return `<section class="card day-card closed"><div class="row-top"><span class="what"><b>✓ ${esc(T.dayClosed)}</b></span>${streak}<button class="btn plain small" data-action="reopenday">${esc(T.dayReopen)}</button></div>${yesterday}</section>`;
  const body = `<p class="lead">${esc(day.byHand ? T.dayLogged(day.byHand) : T.dayAsk)}</p>
      ${field(T.quickLabel, `<input id="quickDay" autocomplete="off" enterkeyhint="done" placeholder="${esc(T.quickPlaceholder)}">`, { help: T.dayQuickHelp })}
      <div class="actions"><button class="btn secondary" data-action="closeday">${esc(T.dayClose)}</button></div>`;
  // While cards wait for a category, this box is folded, so they are the first thing you see.
  if (compact) return `<details class="card day-card compact" ${state.dayOpen ? 'open' : ''}><summary><span class="what"><b>${esc(T.dayTitle)}</b><span class="meta">${esc(day.byHand ? T.dayLoggedShort(day.byHand) : T.dayAskShort)}</span></span>${streak}</summary>${yesterday}${body}</details>`;
  return `<section class="card day-card"><div class="row-top"><h2>${esc(T.dayTitle)}</h2>${streak}</div>${yesterday}${body}</section>`;
}

/** A sentence typed in Review: saved straight away when complete, otherwise finished on Add. */
export function quickFromReview(text) {
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
      .catch((e) => toast(`${T.notSaved}: ${label} (${e.message})`, { kind: 'bad' }));
  }
  state.addKind = p.direction;
  state.quickText = text;
  state.addPrefill = { amount: p.amount > 0 ? String(p.amount) : '', category: p.category, stream: p.stream, date: p.date, description: desc, details: p.tags.map((t) => `#${t}`).join(' ') };
  return show('add');
}
