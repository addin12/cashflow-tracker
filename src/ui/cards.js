// The cards and pop-ups of the Summary: what needs attention, payday, claims, subscriptions, health, interest, the tax list.

import { interestCompare } from '../core/wealth.js';
import { svgIcon } from './icons.js';
import { isShared } from '../core/shared.js';
import { amountValue } from './add.js';
import { bigRp, monthName } from './dashboard.js';
import { dateLabel, esc, locale, rp } from './format.js';
import { downloadCsv, field, toast } from './render.js';
import { openModal } from './modal.js';
import { call } from './server.js';
import { $, T, state } from './state.js';
import { acctIcon, icon } from './visuals.js';

/** Money friends owe you, with "paid back". */
export function owedCard(owed) {
  if (!owed || (!owed.open.length && !owed.paid.length)) return '';
  const rows = owed.open.map((o) => `<div class="rowi"><span class="what"><b>${esc(o.who)}</b><span class="meta">${esc([o.payment, dateLabel(o.date, { weekday: false })].filter(Boolean).join(' · '))}</span></span>
    <span class="amt">${rp(o.amount)}</span><button class="btn secondary small" data-action="owedpaid" data-id="${esc(o.id)}" aria-label="${esc(T.owedPaidFor(o.who))}">${esc(T.owedPaid)}</button></div>`).join('');
  return `<section class="card"><h2>${esc(T.owedTitle)}</h2><p class="lead">${esc(owed.open.length ? T.owedHint(rp(owed.total)) : T.owedNone)}</p>
    ${rows ? `<div class="rows owed">${rows}</div>` : ''}</section>`;
}

/** Net worth: accounts, things owned, collectibles, debts. */
export function wealthCard(w) {
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
export function patternCard(p) {
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
export function tagsCard(tags) {
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

export function openSubs() {
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
  openModal();
}

/** Bills due in the next week (planned transactions and subscriptions). */
export function openBills() {
  const d = state.dashByMonth[state.month] || {};
  const bills = d.bills || [];
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.billsTitle)}</h2><p class="lead">${esc(T.billsTotal(rp(bills.reduce((t, b) => t + b.amount, 0))))}</p>
    <div class="rows">${bills.map((b) => `<div class="rowi"><span class="what"><b>${esc(b.name)}</b><span class="meta">${esc(b.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(b.date, { weekday: false }), b.daysLeft))} · ${esc(b.kind === 'plan' ? T.billPlan : b.kind === 'card' ? T.billCard : T.billSub)}</span></span><span class="amt">${rp(b.amount)}</span></div>`).join('') || `<p class="hint">${esc(T.nothingYet)}</p>`}</div>
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.close)}</button></div></div>`;
  openModal();
}

/** Trips and events: #tags with a budget, spent against it. */
export function eventsCard(events) {
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

export function openTagBudget(tag, budget) {
  $('#modal').innerHTML = `<div class="sheet"><form data-form="tagbudget" novalidate><h2>${esc(T.eventBudgetTitle)}</h2><p class="lead">${esc(T.eventBudgetHint)}</p>
    ${field(T.eventTag, `<input name="tag" autocomplete="off" placeholder="#bali" value="${esc(tag ? `#${tag}` : '')}">`)}
    ${field(T.eventBudget, `<input name="amount" class="calc-input" inputmode="decimal" autocomplete="off" value="${esc(budget || '')}"><em class="calc-out"></em>`, { help: T.eventBudgetHelp })}
    <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.cancel)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.save)}</button></div></form></div>`;
  openModal();
  $('#modal [name=tag]').focus();
}

/** Three plain checks: emergency fund in months, what was kept this month, debts against what you own. */
export function healthCard(h) {
  if (!h) return '';
  const n1 = (v) => Number(v).toLocaleString(locale(), { maximumFractionDigits: 1 });
  const rows = [
    [T.healthFund, h.months == null ? T.healthFundNone : T.healthFundMonths(n1(h.months)), h.months == null ? T.healthFundNoneHint : T.healthFundHint(rp(h.fund), rp(h.monthly)), h.monthsLevel],
    [T.healthSaving, h.saving == null ? T.none : `${Math.round(h.saving * 100)}%`, h.saving == null ? T.healthNoIncome : T.healthSavingHint, h.savingLevel],
    [T.healthDebt, `${Math.round(h.debt * 100)}%`, h.debts ? T.healthDebtHint(rp(h.debts)) : T.healthNoDebt, h.debtLevel],
  ];
  return `<section class="card health"><h2 class="row-title">${esc(T.healthTitle)}<button class="link" data-action="interest">${esc(T.interestOpen)}</button></h2><p class="lead">${esc(T.healthHint)} ${esc(T.healthRule)}</p>
    <div class="rows">${rows.map(([label, value, hint, lvl]) => `<div class="rowi"><span class="lvl ${lvl || 'none'}" aria-hidden="true"></span><span class="what"><b>${esc(label)}</b><span class="meta">${esc(hint)}</span></span>
      <span class="amt">${esc(value)}${lvl ? `<small class="lvl-word ${lvl}">${esc(T[`health_${lvl}`])}</small>` : ''}</span></div>`).join('')}</div></section>`;
}

/** Deposito or SBN: what an amount earns after tax (rates typed by the owner, kept on this device). */
function readInterest() { try { return JSON.parse(localStorage.getItem('cf.interest') || '{}') || {}; } catch (e) { return {}; } }

export function openInterest() {
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
  openModal();
  updateInterest($('#modal form'));
}

export function updateInterest(form) {
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
export function cardsCard(cards) {
  if (!cards || !cards.length) return '';
  const rows = cards.map((c) => {
    const status = c.left > 0 ? (c.daysLeft < 0 ? T.cardOverdue(rp(c.left), dateLabel(c.dueDate, { weekday: false })) : T.cardBill(rp(c.left), dateLabel(c.dueDate, { weekday: false }), c.daysLeft)) : T.cardPaid;
    return `<button class="lrow" data-action="drill" data-stream="${esc(c.stream)}">${acctIcon(c.stream, 'Spending')}<span class="what"><b>${esc(c.stream)}</b><span class="meta">${esc(status)} · ${esc(T.cardCurrent(rp(c.current)))}</span></span>
      <span class="amt ${c.left > 0 && c.daysLeft < 0 ? 'bad' : ''}">${rp(c.left)}</span></button>`;
  }).join('');
  return `<section class="card"><h2 class="row-title">${esc(T.cardsTitle)}<button class="link" data-action="go" data-tab="settings" data-section="cards">${esc(T.eventEdit)}</button></h2><div class="rows">${rows}</div></section>`;
}

/** The SPT list: assets and debts with their SPT codes, to copy into the yearly tax return. */
export const sptCard = (year) => `<section class="card"><h2>${esc(T.sptTitle)}</h2><p class="lead">${esc(T.sptHint(year))}</p>
  <div class="actions" style="justify-content:flex-start"><button class="btn secondary" data-action="spt" data-year="${esc(year)}">${esc(T.sptOpen)}</button></div></section>`;

export async function openSpt(year) {
  $('#modal').innerHTML = `<div class="sheet"><h2>${esc(T.sptTitle)}</h2><p class="hint">${esc(T.loading)}</p></div>`;
  openModal();
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

export function sptCsv() {
  const s = state.spt;
  if (!s) return;
  const rows = [...s.harta.map((x) => [T.sptHarta, x.code, x.label, x.name, x.cost ?? '', x.value]), ...s.utang.map((x) => [T.sptUtang, x.code, x.label, x.name, '', x.value])];
  downloadCsv(`spt-${s.year}.csv`, T.sptColumns, rows);
}

/** Overview, under the greeting: what has a deadline or needs a decision, nearest first. Nothing to show: no card. */
export function attentionCard(d) {
  const rows = [];
  for (const c of (d.claims || []).filter((x) => x.daysLeft <= 7)) rows.push({ icon: 'pill', bad: c.daysLeft <= 3, title: T.attnClaim(c.description || T.noName, rp(c.amount)), meta: T.claimDue(dateLabel(c.due, { weekday: false }), c.daysLeft), act: `data-action="edit" data-id="${esc(c.id)}"` });
  for (const w of (d.warranties || []).filter((x) => x.daysLeft <= 30)) rows.push({ icon: 'shield', bad: w.daysLeft <= 7, title: T.attnWarranty(w.name), meta: T.warrantyLine(dateLabel(w.date, { weekday: false }), w.daysLeft), act: 'data-action="go" data-tab="settings" data-section="assets"' });
  for (const i of ((d.recurring && d.recurring.items) || []).filter((x) => x.change === 'up' || x.change === 'late')) {
    rows.push({ icon: 'swap', bad: false, title: i.change === 'up' ? T.attnSubUp(i.name, rp(i.was), rp(i.amount)) : T.attnSubLate(i.name), meta: T.attnSubMeta, act: 'data-action="subs"' });
  }
  for (const name of state.boot.notConnected || []) {
    const mine = name === state.boot.me;
    rows.push({ icon: 'mail', bad: false, title: mine ? T.notifGmailMine : T.notifGmailOther(name), meta: mine ? T.notifGmailMineSub : T.notifGmailOtherSub, act: 'data-action="go" data-tab="settings" data-section="household"' });
  }
  const su = state.boot.setup;
  if (su && (state.boot.members || []).length > 1) {
    if (!su.accounts) rows.push({ icon: 'bank', bad: false, title: T.stepAccounts, meta: T.stepAccountsMeta, act: 'data-action="go" data-tab="settings" data-section="accounts"' });
    if (su.bankName === false) rows.push({ icon: 'idcard', bad: false, title: T.stepBankName, meta: T.stepBankNameMeta, act: 'data-action="go" data-tab="settings" data-section="household"' });
    if (!su.payday) rows.push({ icon: 'briefcase', bad: false, title: T.stepPayday, meta: T.stepPaydayMeta, act: 'data-action="go" data-tab="settings" data-section="prefs"' });
  }
  for (const n of (state.boot.newAccounts || []).slice(0, 2)) rows.push({ icon: 'bank', bad: false, title: T.attnNewAccount(n.institution, n.hint, n.count), meta: T.attnNewAccountMeta, act: `data-action="newaccount" data-inst="${esc(n.institution)}" data-hint="${esc(n.hint)}"` });
  for (const a of ((su && su.unchecked) || []).slice(0, 2)) rows.push({ icon: 'scale', bad: false, title: T.stepBalance(a), meta: T.stepBalanceMeta, act: 'data-action="go" data-tab="settings" data-section="monthend"' });
  const rv = state.review || {};
  for (const e of (rv.errors || []).slice(0, 2)) rows.push({ icon: 'mail', bad: false, title: T.attnUnread(e.subject || e.from), meta: T.attnUnreadMeta, act: 'data-action="go" data-tab="review"' });
  if (rv.ruleable) rows.push({ icon: 'tag', bad: false, title: T.attnRules(rv.ruleable), meta: T.attnRulesMeta, act: 'data-action="go" data-tab="review"' });
  if (!rows.length) return '';
  return `<section class="card attn"><h2>${esc(T.attnTitle)}</h2><div class="rows">${rows.slice(0, 6).map((r) => `<button class="lrow" ${r.act}><span class="cat-ic ${r.bad ? 'c3' : 'c6'}" aria-hidden="true">${svgIcon(r.icon)}</span><span class="what"><b>${esc(r.title)}</b><span class="meta">${esc(r.meta)}</span></span></button>`).join('')}</div></section>`;
}

/** Overview, on payday and the two days after: what the salary has to cover until the next one. */
export function paydayCard(p) {
  if (!p) return '';
  const line = (label, v, cls = '') => `<div class="rowi"><span class="what"><b>${esc(label)}</b></span><span class="amt ${cls}">${v}</span></div>`;
  const sub = (label, v) => `<div class="rowi sub"><span class="what"><span class="meta">${esc(label)}</span></span><span class="amt">${rp(v)}</span></div>`;
  return `<section class="card payday-card"><h2>${esc(T.pdTitle)}</h2><p class="lead">${esc(p.salary ? T.pdHint(rp(p.salary), p.days) : T.pdHintNoSalary(p.days))}</p>
    <div class="rows">${p.salary ? line(T.pdSalary, `+${rp(p.salary)}`, 'in') : ''}
      ${line(T.pdBills(p.bills.length), `−${rp(p.billsTotal)}`)}${p.bills.slice(0, 4).map((b) => sub(`${b.name} · ${dateLabel(b.date, { weekday: false })}`, b.amount)).join('')}
      ${line(T.pdSave(p.goals.length), `−${rp(p.saveTotal)}`)}${p.goals.map((g) => sub(g.name, g.amount)).join('')}
      ${p.free !== null ? line(T.pdFree, rp(p.free), p.free < 0 ? 'bad' : '') : ''}</div>
    ${p.perDay ? `<p class="hint">${esc(T.pdPerDay(rp(p.perDay), p.days))}</p>` : ''}
    ${p.free === null ? `<button class="link" data-action="go" data-tab="settings" data-section="prefs">${esc(T.pdSetSalary)}</button>` : ''}</section>`;
}

/** The tag button on a payment's notes: shared by the two of you (#bersama). Only with two people. */
export const sharedToggle = (details) => ((state.boot.members || []).length > 1
  ? `<div class="actions" style="justify-content:flex-start"><button type="button" class="chip-btn ${isShared({ details }) ? 'on' : ''}" aria-pressed="${isShared({ details })}" data-action="toggleshared">${esc(T.sharedToggle)}</button></div>` : '');

/** Overview: what the two of you share (#bersama), who paid and who owes whom, with "Tandai lunas". */
export function sharedCard(sh) {
  if (!sh) return '';
  const [a, b] = sh.people;
  const history = sh.settlements.length ? `<h3 class="sub-title">${esc(T.sharedHistory)}</h3><div class="rows">${sh.settlements.slice(0, 3).map((s, i) => `<div class="rowi"><span class="what"><b>${esc(T.sharedLine(dateLabel(s.date, { weekday: false }), s.from, s.to, rp(s.amount)))}</b></span>${i === 0 ? `<button class="btn plain small" data-action="unsettle" data-id="${esc(s.id)}">${esc(T.sharedUndo)}</button>` : ''}</div>`).join('')}</div>` : '';
  if (!sh.count) return `<section class="card shared"><h2>${esc(T.sharedTitle)}</h2><p class="lead">${esc(T.sharedHint)}</p>${history}</section>`;
  const row = (p) => `<div class="rowi"><span class="what"><b>${esc(p.name)}</b><span class="meta">${esc(T.sharedPart(p.pct, rp(p.share)))}</span></span><span class="amt">${esc(T.sharedPaid(rp(p.paid)))}</span></div>`;
  return `<section class="card shared"><h2>${esc(T.sharedTitle)}</h2><p class="lead">${esc(T.sharedTotal(rp(sh.total), rp(sh.monthTotal)))}</p>
    <div class="rows">${row(a)}${row(b)}</div>
    ${sh.owes ? `<p class="lead"><b>${esc(T.sharedOwes(sh.owes.from, sh.owes.to, rp(sh.owes.amount)))}</b></p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" data-action="settle" data-amount="${esc(sh.owes.amount)}">${esc(T.sharedSettle)}</button></div>` : `<p class="lead">✓ ${esc(T.sharedEven)}</p>`}
    ${history}</section>`;
}

/** Overview: claims still to make, nearest deadline first. */
export function claimsCard(list) {
  if (!list || !list.length) return '';
  const rows = list.map((c) => `<button class="lrow" data-action="edit" data-id="${esc(c.id)}"><span class="what"><b>${esc(c.description || T.noName)}</b><span class="meta">${esc(T.claimDue(dateLabel(c.due, { weekday: false }), c.daysLeft))}${c.daysLeft <= 3 ? ` <span class="badge ${c.daysLeft < 0 ? 'bad' : 'warn'}">${esc(c.daysLeft < 0 ? T.claimLate : T.claimSoon)}</span>` : ''}</span></span><span class="amt">${rp(c.amount)}</span></button>`).join('');
  return `<section class="card"><h2>${esc(T.claimsTitle)}</h2><p class="lead">${esc(T.claimsHint(rp(list.reduce((t, c) => t + c.amount, 0))))}</p><div class="rows">${rows}</div></section>`;
}

/** Overview: warranties ending soon. */
export function warrantiesCard(list) {
  if (!list || !list.length) return '';
  return `<section class="card"><h2>${esc(T.warrantiesTitle)}</h2><div class="rows">${list.map((w) => `<div class="rowi"><span class="what"><b>${esc(w.name)}</b><span class="meta">${esc(T.warrantyLine(dateLabel(w.date, { weekday: false }), w.daysLeft))}</span></span></div>`).join('')}</div>
    <button class="link" data-action="go" data-tab="settings" data-section="assets">${esc(T.wealthEdit)}</button></section>`;
}

/** The year in a few lines (from the yearly report's own numbers), with a button to copy it. */
export function recapCard(y) {
  const nowMonth = state.boot.today.slice(0, 7);
  const months = y.months.filter((m) => m.expense || m.income);
  if (!months.length) return '';
  const totalOut = months.reduce((t, m) => t + m.expense, 0);
  const totalIn = months.reduce((t, m) => t + m.income, 0);
  const kept = totalIn > 0 ? Math.round(((totalIn - totalOut) / totalIn) * 100) : null;
  const whole = months.filter((m) => m.expense > 0 && m.month < nowMonth); // a month still running isn't compared
  const cheap = whole.length > 1 ? whole.reduce((a, b) => (b.expense < a.expense ? b : a)) : null;
  const dear = whole.length > 1 ? whole.reduce((a, b) => (b.expense > a.expense ? b : a)) : null;
  const byCat = new Map();
  for (const m of y.months) for (const [c, v] of Object.entries(m.byCategory)) byCat.set(c, (byCat.get(c) || 0) + v);
  const top = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const place = (y.places || [])[0];
  const big = (y.biggest || [])[0];
  const lines = [
    [T.income, `+${rp(totalIn)}`], [T.recapSpent, rp(totalOut)], kept == null ? null : [T.recapKept, `${kept}%`],
    cheap ? [T.recapCheapest, `${monthName(cheap.month)} · ${rp(cheap.expense)}`] : null, dear ? [T.recapPriciest, `${monthName(dear.month)} · ${rp(dear.expense)}`] : null,
    ...top.map(([c, v], i) => [i ? '' : T.recapTopCats, `${c} · ${rp(v)}`]),
    place ? [T.recapPlace, `${place.name} · ${place.count}×`] : null, big ? [T.recapBiggest, `${big.description} · ${rp(big.amount)}`] : null,
  ].filter(Boolean);
  state.recapText = [T.recapTitle(y.year), ...lines.map(([k, v]) => (k ? `${k}: ${v}` : `  ${v}`))].join('\n');
  return `<section class="card recap"><h2 class="row-title">${esc(T.recapTitle(y.year))}<button class="link" data-action="copyrecap">${esc(T.recapCopy)}</button></h2>
    <div class="rows">${lines.map(([k, v]) => `<div class="rowi"><span class="what">${k ? `<b>${esc(k)}</b>` : ''}</span><span class="amt">${esc(v)}</span></div>`).join('')}</div></section>`;
}

export function copyRecap() {
  const text = state.recapText || '';
  const done = () => toast(T.recapCopied);
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
  return legacyCopy(text, done);
}

function legacyCopy(text, done) {
  const t = document.createElement('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast(T.recapCopyFail, { kind: 'bad' }); }
  t.remove();
}

export function recurringCard(r) {
  if (!r || !r.items || !r.items.length) return '';
  const when = (i) => (i.daysLeft < 0 ? T.recurringLate(dateLabel(i.nextDate, { weekday: false }), -i.daysLeft)
    : i.daysLeft === 0 ? T.recurringToday : T.recurringNext(dateLabel(i.nextDate, { weekday: false }), i.daysLeft));
  const rows = r.items.map((i) => `<div class="rec-row">
    <button class="rowi" data-action="drill" data-q="${esc(i.name)}"><span class="what"><b>${esc(i.name)}</b>
      <span class="meta">${esc(when(i))}${i.stream ? ` · ${esc(i.stream)}` : ''}${['category', 'yearly-guess'].includes(i.basis) ? ` · <span class="badge neutral">${esc(T.recurringGuess)}</span>` : ''}${i.change === 'up' ? ` <span class="badge warn">↑ ${esc(T.subUp(rp(i.was)))}</span>` : ''}${i.change === 'new' ? ` <span class="badge new">${esc(T.subNew)}</span>` : ''}${i.change === 'moved' ? ` <span class="badge neutral">${esc(T.subMoved(i.from))}</span>` : ''}${i.daysLeft < 0 ? ` <span class="badge warn">${esc(T.recurringLateBadge)}</span>` : ''}</span></span>
      <span class="amt">${rp(i.amount)}${i.cycle === 'year' ? `<small>/${esc(T.yearShort)}</small>` : ''}</span></button>
    <button class="btn plain small rec-hide" data-action="hiderec" data-name="${esc(i.name)}" aria-label="${esc(T.notSubscriptionFor(i.name))}">${esc(T.notSubscription)}</button></div>`).join('');
  return `<section class="card"><h2 class="row-title">${esc(T.recurringTitle)}<button class="link" data-action="subs">${esc(T.subsManage)}</button></h2><p class="lead">${esc(T.recurringHint(rp(r.monthlyTotal)))}</p><div class="rows">${rows}</div></section>`;
}

export function goalsCard(goals) {
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
