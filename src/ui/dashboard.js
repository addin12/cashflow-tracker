// The Summary screen: overview, report and yearly views.

import { svgIcon } from './icons.js';
import { askCard } from './ask.js';
import { attentionCard, cardsCard, claimsCard, eventsCard, goalsCard, healthCard, owedCard, patternCard, paydayCard, recapCard, recurringCard, sharedCard, sptCard, tagsCard, warrantiesCard, wealthCard } from './cards.js';
import { remember } from './data.js';
import { currentMonth, dateLabel, esc, fmt, locale, monthAdd, monthAria, monthDate, monthLabel, monthShort, rangeLabel, rp, signed, timeLabel } from './format.js';
import { ownPendingCount, setView, skeleton, streamLabel, whoSeg } from './render.js';
import { call } from './server.js';
import { countUp } from './motion.js';
import { $, T, state } from './state.js';
import { maybeTour } from './tour.js';
import { EYE, EYE_OFF, acctIcon, firstBadge, icon } from './visuals.js';

// Two views of one month: the overview (today, where the money went, the latest rows) and the
// report (money out, a calendar of daily spending, the running total against last month, a donut).
export async function viewDashboard() {
  let d = state.dashByMonth[state.month];
  if (!d) {
    skeleton(T.tabDashboard, 'overview');
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
    skeleton(T.tabDashboard, 'overview');
    state.yearly = { forDash: d, data: await call('yearly', { year: yr, owner: state.who || '' }) };
    if (state.tab !== 'dashboard' || state.dashView !== 'report') return;
  }
  const viewBtn = (v, label) => `<button type="button" class="${(v === 'report') === report ? 'on' : ''}" aria-pressed="${(v === 'report') === report}" data-action="dashview" data-view="${v}">${esc(label)}</button>`;
  const hour = new Date().getHours();
  const greet = (hour < 11 ? T.greetMorning : hour < 15 ? T.greetNoon : hour < 18 ? T.greetAfternoon : T.greetEvening).replace(/\.$/, '');
  const todayLong = new Date(`${state.boot.today}T00:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const modeSeg = report ? `<div class="seg mode-seg">${[['month', T.reportMonthly], ['year', T.reportYearly]].map(([v, l]) => `<button type="button" class="${(v === 'year') === !!state.reportYearly ? 'on' : ''}" aria-pressed="${(v === 'year') === !!state.reportYearly}" data-action="reportmode" data-mode="${v}">${esc(l)}</button>`).join('')}</div>` : '';
  setView(`
    <header class="page-head ov-head"><h1>${esc(T.tabDashboard)}</h1><div class="seg ov-view">${viewBtn('overview', T.viewOverview)}${viewBtn('report', T.viewReport)}</div></header>
    <p class="sub ov-sub">${esc(greet)} · ${esc(todayLong)}</p>
    <div class="ov-bar">
      <div class="monthbar">
        <button class="btn secondary small month-prev" data-action="setmonth" data-month="${prev}" aria-label="${esc(monthAria(prev))}">${esc(monthShort(prev))}</button>
        <div class="monthname"><b>${esc(monthLabel(d.month))}</b>${s.from ? `<small>${esc(rangeLabel(s.from, s.to))}</small>` : ''}</div>
        <button class="btn secondary small month-next" data-action="setmonth" data-month="${next}" aria-label="${esc(monthAria(next))}" ${next > current ? 'disabled' : ''}>${esc(monthShort(next))}</button>
      </div>
      <div class="ov-pickers">${whoSeg()}${modeSeg}</div>
    </div>
    ${report ? `${state.reportYearly ? yearlyHtml(state.yearly.data) : reportHtml(d)}` : overviewHtml(d)}`);
  afterRender(d);
}

/** The first time a month's screen opens: numbers count up and the charts draw in (not on every quiet refresh), and a first-time visitor gets the tour. */
function afterRender(d) {
  const key = `${state.tab}|${d.month}|${state.who || ''}|${state.dashView}|${state.reportYearly ? 'y' : 'm'}`;
  const first = state.animKey !== key;
  state.animKey = key;
  const view = $('#view');
  if (!view) return;
  if (first) { view.dataset.anim = '1'; countUp(view); maybeTour(); } else delete view.dataset.anim;
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

export const monthName = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'long' });

export const bigRp = (n, cls = '') => `<span class="big-num ${cls}"${state.hide ? '' : ` data-v="${Math.round(Number(n) || 0)}"`}><span class="cur">Rp</span>${state.hide ? '•••' : fmt.format(Math.round(Number(n) || 0))}</span>`;

/** One transaction as a list line: icon, name, when · category · account, amount. */
const lineRow = (x) => `<button class="lrow" data-action="edit" data-id="${esc(x.id)}">${icon(x.category)}
  <span class="what"><b>${esc(x.description || x.details || T.noName)}</b><span class="meta">${esc([`${dateLabel(x.date, { weekday: false })}${x.time ? `, ${timeLabel(x.time)}` : ''}`, x.category || T.noCategory, x.stream].filter(Boolean).join(' · '))}${firstBadge(x)}</span></span>
  <span class="amt ${esc(x.direction)}">${signed(x)}</span></button>`;

/**
 * A secondary card folded into one line (title, and its first sentence as a hint) that opens on a tap: less to scroll past, nothing removed.
 * Cards that start with a heading (and optionally a ".lead" sentence) fold; anything else is returned as it is. A button in the heading moves into the body.
 */
export function fold(html, { open = false } = {}) {
  if (!html) return '';
  const m = /^<section class="card([^"]*)">\s*<h2([^>]*)>([\s\S]*?)<\/h2>/.exec(html);
  if (!m) return html;
  const btn = (/<button[\s\S]*?<\/button>/.exec(m[3]) || [''])[0];
  const title = m[3].replace(btn, '');
  let rest = html.slice(m[0].length).replace(/<\/section>\s*$/, '');
  const lead = /^\s*<p class="lead">([\s\S]*?)<\/p>/.exec(rest);
  if (lead) rest = rest.slice(lead[0].length);
  return `<details class="card fold${m[1]}"${open ? ' open' : ''}><summary><span class="fold-text"><h2 class="ft">${title}</h2>${lead ? `<small>${lead[1]}</small>` : ''}</span><span class="fold-chev" aria-hidden="true"></span></summary>${btn ? `<div class="fold-act">${btn}</div>` : ''}${rest}</details>`;
}

/** Sections in reading order; on a wide screen they run down two or three balanced columns, so no column is left empty. */
const sec = (o, html) => (html ? `<div class="ov-sec" style="--o:${o}">${html}</div>` : '');
const flow = (parts) => `<div class="flow">${parts.filter(Boolean).join('')}</div>`;

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
  // What needs a person goes in ONE list (the attention card): waiting rows, the missing salary, this week's bills, the year recap.
  const lead = [];
  // Your own waiting transactions, the same number as the Review badge (the other person's are not yours to chase).
  if (ownPendingCount(d)) lead.push({ icon: 'alert', bad: false, title: T.pendingNote(ownPendingCount(d)), meta: T.attnReviewMeta, act: 'data-action="go" data-tab="review"' });
  if ((d.salaryMissing || []).length) lead.push({ icon: 'briefcase', bad: false, title: T.salaryNotice(dateLabel(d.salaryMissing[0].date, { weekday: false })), meta: T.salaryNoticeSub, act: 'data-action="go" data-tab="review"' });
  if (bills.length) lead.push({ icon: 'calendar', bad: false, title: T.billsThisWeek(bills.length), meta: T.attnBillsMeta, act: 'data-action="bills"' });
  if (state.boot.today.slice(5, 7) === '12' && Number(state.boot.today.slice(8)) >= 15) lead.push({ icon: 'trend', bad: false, title: T.recapChip(state.boot.today.slice(0, 4)), meta: '', act: 'data-action="recap"' });

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
  });
  const CATS_SHOWN = 5;
  const catsHtml = catRows.length
    ? `${catRows.slice(0, CATS_SHOWN).join('')}${catRows.length > CATS_SHOWN ? `<details class="more-rows"><summary>${esc(T.allCats(catRows.length))}</summary>${catRows.slice(CATS_SHOWN).join('')}</details>` : ''}`
    : `<p class="hint">${esc(T.nothingYet)}</p>`;

  // The month against the budgets, inside the status card: how far in, how much is left, what the pace says.
  const totalBudget = d.budgets.reduce((a, b) => a + b.budget, 0);
  const inBudgets = d.budgets.reduce((a, b) => a + b.spent, 0);
  const daysLeft = Math.max(1, days.length - idx + 1);
  const notes = [
    d.under && (d.under.under != null || d.under.noSpend) ? T.underLine(d.under.under, d.under.elapsed, rp(d.under.allowance), d.under.noSpend) : '',
    totalBudget && s.expense - inBudgets > 0 ? T.outsideBudgets(rp(s.expense - inBudgets)) : '',
    totalBudget && isNow && idx > 2 ? T.onPace(rp((s.expense / idx) * days.length)) : '',
  ].filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('');
  const usedPct = totalBudget ? Math.round((inBudgets / totalBudget) * 100) : 0;
  const ringState = inBudgets > totalBudget ? 'over' : isNow && inBudgets / totalBudget > elapsed + 0.05 ? 'ahead' : '';
  const ring = totalBudget ? `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="${esc(T.budgetUse(usedPct))}"><circle class="ring-bg" cx="32" cy="32" r="26"/><circle class="ring-fg ${ringState}" cx="32" cy="32" r="26" pathLength="100" stroke-dasharray="${Math.min(100, usedPct)} 100" transform="rotate(-90 32 32)"/>${isNow ? `<line class="ring-tick" x1="32" y1="1" x2="32" y2="8" transform="rotate(${Math.round(elapsed * 360)} 32 32)"/>` : ''}<text x="32" y="37" text-anchor="middle" class="ring-t">${usedPct}%</text></svg>` : '';
  // One sentence that matters: a budget that is over, one running ahead of the month, or where most of it went.
  const insight = (() => {
    const over = d.budgets.filter((b) => b.ratio > 1).sort((x, y) => (y.spent - y.budget) - (x.spent - x.budget))[0];
    if (over) return T.insightOver(over.category, rp(over.spent - over.budget));
    const fast = isNow ? d.budgets.filter((b) => b.ratio > 0.5 && b.ratio > elapsed + 0.15).sort((x, y) => y.ratio - x.ratio)[0] : null;
    if (fast) return T.insightAhead(fast.category, Math.round(fast.ratio * 100), Math.round(elapsed * 100));
    const first = spent[0];
    return first && s.expense > 0 && first.amount / s.expense >= 0.3 ? T.insightTop(first.category, Math.round((first.amount / s.expense) * 100)) : '';
  })();
  const foot = totalBudget ? `<div class="budget-foot">
      <p><b>${esc(inBudgets > totalBudget ? T.budgetOverLine(rp(inBudgets - totalBudget)) : isNow ? T.budgetLeftLine(rp(totalBudget - inBudgets), rp((totalBudget - inBudgets) / daysLeft), daysLeft) : T.budgetLeftEnd(rp(totalBudget - inBudgets)))}</b></p>
    </div>` : `<p class="hint"><button class="link" data-action="go" data-tab="settings" data-section="budgets">${esc(T.noBudgetsSet)}</button></p>`;

  // Key figures as tiles, two by two (a tap goes to the rows behind the number).
  const tile = (label, value, { cls = '', meta = '', attrs = '' } = {}) => {
    const tag = attrs ? 'button' : 'div';
    return `<${tag} class="tile" ${attrs}><span class="tl">${esc(label)}</span><b class="amt ${cls}">${value}</b>${meta ? `<span class="tm">${esc(meta)}</span>` : ''}</${tag}>`;
  };
  const tiles = [
    tile(T.income, `+${rp(s.income)}`, { cls: 'in', attrs: 'data-action="drill" data-direction="in"' }),
    tile(T.netThisMonth, `${s.balance < 0 ? '' : '+'}${rp(s.balance)}`, { cls: s.balance < 0 ? 'bad' : '', attrs: 'data-action="drill"' }),
    isNow ? tile(T.perDay, rp(d.perDay.perDay), { meta: T.daysToPaydayShort(d.perDay.daysLeft, dateLabel(d.perDay.nextPayday, { weekday: false })) }) : '',
    isNow ? tile(T.todayShort, rp(todayTotal), { meta: T.paymentsToday(today.length), attrs: `data-action="drillday" data-date="${esc(state.boot.today)}"` }) : '',
  ].join('');
  const status = `<section class="card monthcard">
      <p class="k">${esc(T.monthSpending(monthName(d.month), isNow ? idx : 0))}</p>
      <div class="mc-head"><div class="mc-top"><button class="hero-num" data-action="drill" data-direction="out">${bigRp(s.expense, 'lg')}</button>
        ${prevSame > 0 ? `<p class="cmp ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '↑' : '↓'} ${esc(diff > 0 ? T.moreThan(rp(diff), prevName) : T.lessThan(rp(-diff), prevName))}</p>` : ''}</div>${ring}</div>
      ${insight ? `<p class="insight">${esc(insight)}</p>` : ''}
      ${foot}
      <div class="tiles">${tiles}</div>
      ${notes ? `<div class="notes">${notes}</div>` : ''}
      ${isNow && d.perDay.spending < 0 ? `<p><button class="link" data-action="go" data-tab="settings" data-section="accounts">${svgIcon('alert')} ${esc(T.negativeSpending)}</button></p>` : ''}
    </section>`;

  const incomeRows = s.byCategory.filter((c) => c.kind === 'income').sort((a, b) => b.amount - a.amount).map((c) => `
    <button class="lrow" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}<span class="what"><b>${esc(c.category)}</b></span><span class="amt in">+${rp(c.amount)}</span></button>`).join('');
  // Accounts as tiles, two across: a group's total, then its accounts.
  const acctTile = (b) => `<button class="acct" data-action="drill" data-stream="${esc(b.stream)}">${acctIcon(b.stream, b.type)}<span class="an">${esc(streamLabel(b.stream))}</span><b class="amt ${b.balance < 0 ? 'bad' : ''}">${rp(b.balance)}</b></button>`;
  const group = (type, title) => {
    const list = d.balances.filter((b) => b.type === type);
    if (!list.length) return '';
    return `<div class="acct-head"><span>${esc(title)}</span><b class="amt">${rp(list.reduce((a, b) => a + b.balance, 0))}</b></div><div class="acct-grid">${list.map(acctTile).join('')}</div>`;
  };
  const allBalance = (d.balances || []).reduce((t, b) => t + b.balance, 0);
  const setAside = (d.goals || []).reduce((t, g) => t + Math.min(g.saved, g.target), 0);
  const accountsCard = `<section class="card accounts"><div class="acct-total"><h2>${esc(T.accounts)}</h2>${bigRp(allBalance, 'md')}</div>
      <p class="meta">${esc(setAside > 0 ? T.walletSplit(rp(allBalance - setAside), rp(setAside)) : T.walletTotal)}</p>${group('Spending', T.spendingGroup)}${group('Saving', T.savingGroup)}</section>`;
  const latest = (d.recent || []).length ? `<section class="latest"><h2 class="section-title row-title">${esc(T.latestTitle)}<button class="link" data-action="go" data-tab="transactions">${esc(T.seeAll)}</button></h2>
      <div class="card list-card">${d.recent.slice(0, 3).map(lineRow).join('')}</div></section>` : '';
  const where = `<section><h2 class="section-title">${esc(T.whereItWent)}</h2><div class="card list-card">${catsHtml}</div></section>`;
  // Everything else folds: one line each, open on a tap.
  const more = [owedCard(d.owed), incomeRows ? `<section class="card"><h2>${esc(T.incomeByCategory)}</h2><div class="rows">${incomeRows}</div></section>` : '',
    goalsCard(d.goals), recurringCard(d.recurring), eventsCard(d.events), sharedCard(d.shared), claimsCard(d.claims), warrantiesCard(d.warranties), cardsCard(d.cards),
    healthCard(d.health), wealthCard(d.wealth)].map((h) => fold(h));
  // Reading order (--o): the month, the question box, what needs you, the money you have, where it went, the latest, the rest.
  return flow([
    sec(10, status),
    sec(15, askCard()),
    sec(20, isNow ? attentionCard(d, lead) : ''),
    sec(25, isNow ? paydayCard(d.paydayPlan) : ''),
    sec(30, accountsCard),
    sec(50, where),
    sec(60, latest),
    ...more.map((h, i) => sec(70 + i, h)),
  ]);
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
  const line = `<div class="line-wrap" data-line="${esc(JSON.stringify({ a: a.map(Math.round), b: b.map(Math.round), n, now: monthName(d.month), prev: prevName }))}"><svg class="line-chart" viewBox="0 0 ${W} ${H + 4}" preserveAspectRatio="none" role="img" aria-label="${esc(`${monthName(d.month)} ${rp(lastA)}, ${prevName} ${rp(lastB)}`)}">
      ${b.length ? `<path class="prev" d="${path(b)}"/>` : ''}${a.length ? `<path class="now-fill" d="${path(a)} L${(((a.length - 1) / (n - 1)) * W).toFixed(1)},${H} L0,${H} Z"/><path class="now" d="${path(a)}"/>` : ''}
    </svg><div class="chart-tip" hidden></div></div>`;
  const cats = s.byCategory.filter((c) => c.kind !== 'income').sort((x, y) => y.amount - x.amount);
  const trend = d.trend || [];
  const tTop = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));
  const chart = trend.map((t) => `
    <button class="m ${t.month === d.month ? 'on' : ''}" data-action="setmonth" data-month="${t.month}" aria-label="${esc(`${monthAria(t.month)}: ${T.income} ${rp(t.income)}, ${T.expense} ${rp(t.expense)}`)}">
      <span class="bars"><i class="in" style="height:${Math.round((t.income / tTop) * 100)}%"></i><i class="out" style="height:${Math.round((t.expense / tTop) * 100)}%"></i></span>
      <span>${esc(monthShort(t.month))}</span></button>`).join('');
  // On a phone the order is --o; the document order below is what keeps the two columns even on a wide screen.
  return flow([
    sec(10, `<section class="card spend"><p class="k">${esc(T.moneyOut)}</p><button class="hero-num" data-action="drill" data-direction="out">${bigRp(s.expense, 'lg')}</button>
        <p class="muted">${esc(T.ofIncome(rp(s.income), rp(s.balance)))}</p></section>`),
    sec(20, `<section class="card"><h2>${esc(T.dailyTrend)}</h2><p class="lead">${esc(T.avgPerDay(rp(s.expense / idx)))}</p>
        <div class="hm-grid">${weekdays.map((w) => `<span class="hm-wd">${esc(w)}</span>`).join('')}${cells}</div>
        <div class="hm-legend"><span>${esc(T.heatLess)}</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>${esc(T.heatMore)}</span></div></section>`),
    sec(40, `<section class="card"><h2>${esc(T.spendTrend)}</h2><p class="lead">${esc(T.spendTrendHint)}</p>${line}
        <div class="legend"><span><i class="out-now"></i>${esc(monthName(d.month))} ${rp(lastA)}</span>${b.length ? `<span><i class="out-prev"></i>${esc(prevName)} ${rp(lastB)}</span>` : ''}</div></section>`),
    sec(50, trend.length ? `<section class="card"><h2>${esc(T.trendTitle)}</h2><p class="lead">${esc(T.trendHint)}</p><div class="chart">${chart}</div></section>` : ''),
    sec(30, donutCard(cats, (v) => T.perDayShort(rp(v / idx)), T.whereItWent, 5)),
    ...[fold(flowCard(d.flow, d)), fold(patternCard(d.pattern)), fold(tagsCard(d.tags)), fold(placesCard(d.places)), fold(biggestCard(d.biggest))].map((h, i) => sec(60 + i, h)),
  ]);
}

/** Donut and list of spending categories; `per` labels each row's average (per day or per month). */
function donutCard(cats, per, title = T.whereItWent, limit = 99) {
  const total = cats.reduce((t, c) => t + c.amount, 0);
  let at = 0;
  const stops = cats.map((c, i) => { const from = at; at += total ? (c.amount / total) * 100 : 0; return `var(--ch${i % 8}) ${from.toFixed(2)}% ${at.toFixed(2)}%`; }).join(', ');
  const list = cats.map((c, i) => `<button class="lrow" data-action="drill" data-category="${esc(c.category)}">${icon(c.category)}
      <span class="what"><b><i class="dot" style="background:var(--ch${i % 8})"></i>${esc(c.category)}</b><span class="meta">${esc(`${total ? Math.round((c.amount / total) * 100) : 0}% · ${per(c.amount)}`)}</span></span>
      <span class="amt">${rp(c.amount)}</span></button>`);
  return `<section class="card donut-card"><h2>${esc(title)}</h2><p class="lead">${esc(T.donutHint)}</p>
    ${total ? `<div class="donut" data-segs="${esc(JSON.stringify(cats.map((c) => ({ c: c.category, v: Math.round(c.amount), p: total ? +((c.amount / total) * 100).toFixed(2) : 0 }))))}" style="background:conic-gradient(${stops})" role="img" aria-label="${esc(`${T.moneyOut} ${rp(total)}`)}"><div><span>${esc(T.moneyOut)}</span><b>${rp(total)}</b><small>${esc(T.nCats(cats.length))}</small></div></div>
    <div class="rows">${list.slice(0, limit).join('')}${list.length > limit ? `<details class="more-rows"><summary>${esc(T.allCats(list.length))}</summary>${list.slice(limit).join('')}</details>` : ''}</div>` : `<p class="hint">${esc(T.nothingYet)}</p>`}</section>`;
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
export function flowCard(flow, d) {
  if (!flow || (!flow.income.length && !flow.transfers.length && !flow.spent.length)) return '';
  const type = new Map((d.balances || []).map((x) => [x.stream, x.type]));
  const income = new Map(flow.income.map((x) => [x.stream, x.amount]));
  const spent = new Map(flow.spent.map((x) => [x.stream, x.amount]));
  const order = [...new Set([...flow.income.map((x) => x.stream), ...flow.transfers.map((t) => t.from), ...flow.transfers.map((t) => t.to), ...flow.spent.map((x) => x.stream)])];
  const totalIn = flow.income.reduce((t, x) => t + x.amount, 0);
  // Every line is the same three things: a small label, what it is about, and the amount on the right.
  const line = (cls, tag, text, amount, tail = '') => `<span class="fl-tag ${cls}">${esc(tag)}</span><span class="fl-text">${esc(text)}</span><b class="amt fl-amt ${tail}">${amount}</b>`;
  const node = (stream) => {
    const rows = [];
    if (income.get(stream)) rows.push(`<li><div class="fl-line">${line('in', T.flowRowIn, '', `+${rp(income.get(stream))}`, 'in')}</div></li>`);
    for (const t of flow.transfers.filter((x) => x.to === stream)) rows.push(`<li><div class="fl-line">${line('in', T.flowRowGot, T.flowRowFrom(streamLabel(t.from)), `+${rp(t.amount)}`, 'in')}</div></li>`);
    for (const t of flow.transfers.filter((x) => x.from === stream)) {
      const save = type.get(t.to) === 'Saving';
      rows.push(`<li><div class="fl-line">${line(save ? 'save' : 'move', save ? T.flowSave : T.flowMove, T.flowRowTo(streamLabel(t.to)), `−${rp(t.amount)}`)}</div></li>`);
    }
    if (spent.get(stream)) rows.push(`<li><button type="button" class="fl-line" data-action="drill" data-stream="${esc(stream)}">${line('spend', T.flowRowSpent, '', `−${rp(spent.get(stream))}`)}</button></li>`);
    return `<div class="fl-acct"><div class="fl-head">${acctIcon(stream)}<b>${esc(streamLabel(stream))}</b></div><ul class="fl-lines">${rows.join('')}</ul></div>`;
  };
  return `<section class="card fl"><h2>${esc(T.flowTitle)}</h2><p class="lead">${esc(T.flowHint)}</p>
    <div class="fl-total"><span>${esc(T.flowMoneyIn)}</span><b class="amt in">+${rp(totalIn)}</b></div>
    ${order.map(node).join('')}</section>`;
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
    return `<button class="m ${m.month === nowMonth ? 'on' : ''}" data-action="yearmonth" data-month="${m.month}" ${m.month > nowMonth ? 'disabled' : ''} aria-label="${esc(`${monthAria(m.month)}: ${rp(m.expense)}`)}"><span class="stack-bar">${segs}</span><span>${esc(monthShort(m.month))}</span></button>`;
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
  return `<div class="flow">
      ${fold(recapCard(y))}
      <section class="card spend"><p class="k">${esc(T.moneyOutYear(shown.length ? `${monthShort(shown[0].month)}–${monthShort(shown[shown.length - 1].month)}` : String(y.year)))}</p>${bigRp(totalOut, 'lg')}
        <p class="muted">${esc(T.ofIncome(rp(totalIn), rp(totalIn - totalOut)))}</p></section>
      <section class="card"><h2>${esc(T.monthlyTrend)}</h2><p class="lead">${esc(T.monthlyTrendHint(rp(avg)))}</p>
        <div class="chart year-chart">${avg ? `<span class="avg-line" style="bottom:calc(${((avg / max) * 100).toFixed(1)}% * 0.82 + 30px)"></span>` : ''}${bars}</div>
        <div class="legend">${legend}</div></section>
      ${grid ? `<section class="card"><h2>${esc(T.catsOverTime)}</h2><p class="lead">${esc(T.catsOverTimeHint)}</p>
        <div class="ct-grid" style="--n:${gridMonths.length}"><div class="ct-head"><span></span><span></span>${gridMonths.map((m) => `<span>${esc(monthShort(m.month).slice(0, 3))}</span>`).join('')}<span></span></div>${grid}</div></section>` : ''}
      ${donutCard(cats, (v) => T.perMonthShort(rp(v / Math.max(1, shown.length))), T.whereItWent, 5)}
      ${[fold(patternCard(y.pattern)), fold(tagsCard(y.tags)), fold(placesCard(y.places)), fold(biggestCard(y.biggest)), fold(sptCard(y.year))].join('')}
  </div>`;
}
