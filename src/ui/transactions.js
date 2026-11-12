// The Transactions screen: filters, the list, drilling into a category, exporting and choosing several rows.

import { filterTransactions } from '../core/app.js';
import { categoryHabit } from '../core/insights.js';
import { patchRow, remember, setAll } from './data.js';
import { currentMonth, dateLabel, esc, monthAdd, monthAria, monthLabel, monthShort, rangeLabel, rp, signed, timeLabel } from './format.js';
import { categoryOptions, downloadCsv, field, setView, skeleton, streamLabel, toast, updateNav, whoSeg } from './render.js';
import { show } from './router.js';
import { call, save } from './server.js';
import { $, T, state } from './state.js';
import { firstBadge, icon, statusBadge, tag } from './visuals.js';

export function exportCsv() {
  const list = filterTransactions(state.all || [], { ...state.filters, limit: 1e9 }).rows;
  const head = [T.date, T.time, T.description, T.notes, T.category, T.account, T.kind, T.amount, T.status];
  downloadCsv(`cashflow-${state.boot.today}.csv`, head, list.map((r) => [String(r.date).slice(0, 10), String(r.time || '').slice(0, 5), r.description, r.details, r.category, r.stream,
    r.direction === 'in' ? T.kindIn : T.kindOut, (r.direction === 'in' ? 1 : -1) * (Number(r.amount) || 0), T[`status${r.status[0].toUpperCase()}${r.status.slice(1)}`] || r.status]));
  toast(T.exported(list.length));
}

/** Applies a category (or "ignore") to the picked rows at once, with undo. */
export function applyPicked(category, status) {
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
  // The last 90 days: how often, how much, how far apart.
  const h = categoryHabit(mine, { today: state.boot.today });
  const habit = h ? T.catHabit(h.n, rp(h.sum), rp(h.avg), h.every) : '';
  return `<section class="card trend-card cat-detail"><div class="cat-head">${icon(category)}<div><h2>${esc(category)}</h2><p class="lead">${esc(T.categoryTrendHint(rp(avg)))}</p></div></div>
    ${habit ? `<p class="hint">${esc(habit)}</p>` : ''}
    ${budget ? `<p class="budget-note ${budget.ratio > 1 ? 'over' : ''}">${esc(budget.ratio > 1 ? T.overBudget(rp(budget.spent - budget.budget), rp(budget.budget)) : T.ofBudget(rp(budget.budget), rp(budget.budget - budget.spent)))}</p>` : ''}
    <div class="chart cat-chart">${data.map((d) => `<button class="m ${state.filters.month === d.m ? 'on' : ''}" data-action="trendmonth" data-month="${d.m}" aria-label="${esc(`${monthAria(d.m)}: ${rp(d.v)}`)}"><span class="bars"><i class="${dir}" style="height:${Math.round((d.v / top) * 100)}%"></i></span><span>${esc(monthShort(d.m))}</span></button>`).join('')}</div>
    ${topPlaces.length ? `<h3 class="sub-title">${esc(T.topPlaces)}</h3><div class="rows">${topPlaces.map((p) => `<button class="rowi" data-action="drill" data-q="${esc(p.name)}"><span class="what"><b>${esc(p.name)}</b><span class="meta">${p.n}×</span></span><span class="amt">${rp(p.v)}</span></button>`).join('')}</div>` : ''}
    ${biggest.length ? `<h3 class="sub-title">${esc(T.biggestTitle)}</h3><div class="rows">${biggest.map((x) => `<button class="rowi" data-action="edit" data-id="${esc(x.id)}"><span class="what"><b>${esc(x.description || T.noName)}</b><span class="meta">${esc(dateLabel(x.date))}</span></span><span class="amt">${rp(x.amount)}</span></button>`).join('')}</div>` : ''}
  </section>`;
}

export async function viewTransactions() {
  if (state.filters.month == null) state.filters.month = state.month;
  if (state.txStart) { // what was chosen last time on this device (the current period is the default and stays as it is)
    const { preset, kind } = state.txStart;
    state.txStart = null;
    if (preset && preset !== 'period') setPreset(preset);
    if (kind && kind !== 'all') setKind(kind);
  }
  if (!state.all) {
    skeleton(T.tabTransactions, 'list');
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
        <button class="btn secondary small" data-action="exportcsv">${esc(T.exportCsv)}</button></div></header>
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
export function presetOf(f) {
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

export function setPreset(v) {
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

export function kindOf(f) {
  if (f.category === fixedCats()[1]) return 'transfer';
  if (f.category === fixedCats()[0]) return 'adjust';
  if (f.category) return '';
  return f.direction || 'all';
}

export function setKind(v) {
  const f = state.filters;
  if (fixedCats().includes(f.category)) f.category = '';
  f.direction = v === 'out' || v === 'in' ? v : '';
  if (v === 'transfer') f.category = fixedCats()[1];
  if (v === 'adjust') f.category = fixedCats()[0];
}

/** Filter chips and the table only, so typing in the search box keeps its place. */
export function showResults() {
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
  ].filter(Boolean).filter(([k]) => !(k === 'month' && presetOf(f) === 'period')); // the default period is already lit above
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
    return `<div class="day-head" role="heading" aria-level="2"><span>${esc(label)}</span><span class="amt">${t.out ? `−${rp(t.out)}` : ''}${t.in ? ` <span class="in">+${rp(t.in)}</span>` : ''}</span></div>`;
  };
  const items = rows.map((x) => { const flags = `${statusBadge(x.status)}${firstBadge(x)}`; return `${dayHead(x)}
    <button class="trow${state.selecting ? ' picking' : ''}${state.picked.has(String(x.id)) ? ' picked' : ''}" data-action="${state.selecting ? 'pick' : 'edit'}" data-id="${esc(x.id)}" ${state.selecting ? `aria-pressed="${state.picked.has(String(x.id))}"` : ''}>
      <span class="c-date">${state.selecting ? `<span class="pick-box" aria-hidden="true">${state.picked.has(String(x.id)) ? '✓' : ''}</span>` : ''}${esc(timeLabel(x.time) || '')}</span>
      <span class="c-desc">${icon(x.category)}<span>${esc(x.description || T.noName)}${x.details ? `<small>${esc(x.details)}</small>` : ''}</span></span>
      <span class="c-mobile-meta">${esc([timeLabel(x.time), x.category || T.noCategory, x.stream ? streamLabel(x.stream) : T.noAccount].filter(Boolean).join(' · '))}</span>
      <span class="c-cat">${tag(x.category)}</span>
      <span class="c-flags">${flags}</span>
      <span class="c-acct">${esc(x.stream ? streamLabel(x.stream) : T.noAccount)}</span>
      <span class="c-amt amt ${esc(x.direction)}">${signed(x)}</span>
    </button>`; }).join('');
  box.innerHTML = `${f.category ? categoryDetail(f.category) : ''}
    <div class="summary-bar"><span><b>${esc(T.countTransactions(all.total))}</b></span>
      <span>${esc(T.kindIn)} <b class="amt in">+${rp(sum('in'))}</b> · ${esc(T.kindOut)} <b class="amt">${rp(sum('out'))}</b></span></div>
    ${rows.length ? `<div class="table"><div class="thead" aria-hidden="true"><span>${esc(T.time)}</span><span>${esc(T.description)}</span><span>${esc(T.category)}</span><span>${esc(T.status)}</span><span>${esc(T.account)}</span><span class="r">${esc(T.amount)}</span></div>${items}</div>`
    : `<div class="card empty"><b>${esc(T.noTransactions)}</b>${esc(chips.length ? T.noTransactionsFiltered : '')}</div>`}
    ${all.total > rows.length ? `<div class="more"><span>${esc(T.showing(rows.length, all.total))}</span><button class="btn secondary" data-action="more">${esc(T.showMore)}</button></div>` : ''}
    ${state.selecting ? `<div class="pick-bar" role="region" aria-label="${esc(T.selectMany)}"><b>${esc(T.pickedN(state.picked.size))}</b>
      <select id="pickCat" aria-label="${esc(T.category)}">${categoryOptions('', 'out')}</select>
      <button class="btn primary small" data-action="pickapply" ${state.picked.size ? '' : 'disabled'}>${esc(T.pickApply)}</button>
      <button class="btn secondary small" data-action="pickignore" ${state.picked.size ? '' : 'disabled'}>${esc(T.ignore)}</button>
      <button class="btn plain small" data-action="selectmode">${esc(T.cancel)}</button></div>` : ''}`;
}

export function drill(el) {
  // By payday the month is a date range (28 Sep - 27 Oct), so the list gets the same range.
  const d = state.dashByMonth[state.month];
  const all = el.dataset.stream || el.dataset.q;
  const range = !all && d && d.summary && d.summary.from ? d.summary : null;
  state.filters = { q: el.dataset.q || '', month: all || range ? '' : state.month, from: range ? range.from : '', to: range ? range.to : '', stream: el.dataset.stream || '', category: el.dataset.category || '', status: '', direction: el.dataset.direction || '' };
  state.limit = 50;
  return show('transactions');
}
