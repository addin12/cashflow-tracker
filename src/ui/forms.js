// The forms inside Settings: plans, assets, cards, rules, balance check, goals, accounts, statement import and restore.

import { compileRule } from '../core/rules.js';
import { matchStatement, parseStatement } from '../core/statement.js';
import { svgIcon } from './icons.js';
import { parseBackupCsv } from '../core/csv.js';
import { setAll } from './data.js';
import { dateLabel, esc, locale, rp } from './format.js';
import { accountOptions, field, streamLabel } from './render.js';
import { call } from './server.js';
import { $, $$, T, state } from './state.js';

/** The import section: the account, the file, then the rows to add (the ones already in the app are skipped). */
export function importForm(s) {
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
    ${restoreForm()}
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

export async function readStatement(form) {
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
      <label class="check"><input type="checkbox" data-imp="on" checked><span><b>${esc(r.description || T.noName)}</b><small>${esc(dateLabel(r.date))}</small></span></label>
      <span class="amt ${r.direction}">${r.direction === 'in' ? '+' : '−'}${rp(r.amount)}</span>
      <select data-imp="category" aria-label="${esc(T.category)}">${opts(r.direction, r.category)}</select></div>`)).join('')}</div>
      <p class="hint">${esc(T.importNote)}</p>` : `<p class="hint">${esc(T.importNothingNew)}</p>`}`;
  const n = fresh.length;
  btn.disabled = !n;
  btn.textContent = T.importSave(n);
}

export function importChosen(form) {
  const imp = state.importRows;
  return $$('.imp-row', form).filter((el) => $('[data-imp=on]', el).checked).map((el) => {
    const r = imp.rows[Number(el.dataset.i)];
    return { date: r.date, description: r.description, amount: r.amount, direction: r.direction, category: $('[data-imp=category]', el).value };
  });
}

/** Planned recurring transactions (rent, cash bills): one card per plan. */
export function plansForm(s) {
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

export const readPlans = (form) => $$('.plan-row', form).map((row, i) => ({
  ...((state.settings.plans || [])[i] || {}),
  ...Object.fromEntries($$('[data-p]', row).map((el) => [el.dataset.p, el.type === 'checkbox' ? el.checked : el.value])),
}));

/** Assets, debts and collectibles beyond the accounts. */
export function assetsForm(s) {
  const kinds = s.assetKinds || ['property', 'vehicle', 'gold', 'stock', 'crypto', 'collectible', 'other', 'debt'];
  const rows = (s.assets || []).map((a, i) => {
    const price = Number(a.price);
    const value = (Number(a.qty) || 1) * (price > 0 ? price : Number(a.unit_value) || 0);
    return `<fieldset class="acct-row asset-row" data-i="${i}"><legend>${esc(a.name || T.newAsset)}${a.name ? ` · ${rp(value)}` : ''}</legend>
    <div class="fields2">
      ${field(T.assetName, `<input data-a2="name" value="${esc(a.name)}" placeholder="${esc(T.assetNamePh)}">`)}
      ${field(T.assetKind, `<select data-a2="kind">${kinds.map((k) => `<option value="${k}" ${k === a.kind ? 'selected' : ''}>${esc(T[`kind_${k}`])}</option>`).join('')}</select>`)}
      ${field(T.assetQty, `<input data-a2="qty" inputmode="decimal" value="${esc(a.qty === '' || a.qty == null ? 1 : a.qty)}">`, { help: T.assetQtyHelp })}
      ${field(T.assetValue, `<input data-a2="unit_value" class="calc-input" inputmode="decimal" value="${esc(a.unit_value || '')}"><em class="calc-out"></em>`, { help: price > 0 ? (Number(a.price_at) && Date.now() - Number(a.price_at) > 24 * 3600000 ? T.assetMarketStale : T.assetMarket)(rp(price), Number(a.price_at) ? new Date(Number(a.price_at)).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') : a.ticker || a.kind === 'gold' ? T.assetPriceSoon : T.assetValueHelp })}
      ${field(T.assetTicker, `<input data-a2="ticker" value="${esc(a.ticker || '')}" placeholder="IDX:BBCA" autocapitalize="characters" spellcheck="false">`, { help: T.assetTickerHelp })}
      ${field(T.assetPaid, `<input data-a2="paid" class="calc-input" inputmode="decimal" value="${esc(a.paid || '')}"><em class="calc-out"></em>`, { help: T.optional })}
      ${field(T.assetWarranty, `<input data-a2="warranty" type="date" value="${esc(a.warranty || '')}">`, { help: T.assetWarrantyHelp })}
    </div>
    <div class="actions"><button class="btn danger small" type="button" data-action="delasset" data-i="${i}">${esc(T.assetDelete)}</button></div></fieldset>`;
  }).join('');
  return `<form class="card" data-form="assets" novalidate><h2>${esc(T.assetsTitle)}</h2><p class="lead">${esc(T.assetsHint)}</p>${s.prices && s.prices.failed ? `<p class="hint bad">${svgIcon('alert')} ${esc(T.pricesFailed(s.prices.failed, s.prices.tried, s.prices.at, s.prices.reasons.join('; ')))}</p>` : ''}${rows || `<p class="hint">${esc(T.noAssets)}</p>`}
    <div class="actions"><button class="btn secondary left" type="button" data-action="addasset">＋ ${esc(T.addAsset)}</button><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.saveAssets)}</button></div></form>`;
}

export const readAssets = (form) => $$('.asset-row', form).map((row, i) => ({
  ...((state.settings.assets || [])[i] || {}),
  ...Object.fromEntries($$('[data-a2]', row).map((el) => [el.dataset.a2, el.value])),
}));

export function cardsForm(s) {
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

export const readCards = (form) => $$('.card-row', form).map((row) => Object.fromEntries($$('[data-c]', row).map((el) => [el.dataset.c, el.value])));

/** Settings → Impor: put transactions back from a backup file (only the ones missing, by id). */
function restoreForm() {
  return `<form class="card" data-form="restore" novalidate><h2>${esc(T.restoreTitle)}</h2><p class="lead">${esc(T.restoreHint)}</p>
    ${field(T.importFile, '<input name="backup" type="file" accept=".csv,text/csv,text/plain">', { help: T.restoreFileHelp })}
    <div id="restoreReview" role="status"></div>
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit" disabled>${esc(T.restoreSave(0))}</button></div></form>`;
}

export async function readBackup(form) {
  const input = form.querySelector('[name=backup]');
  const box = $('#restoreReview');
  const btn = form.querySelector('button[type=submit]');
  state.restoreRows = null;
  btn.disabled = true;
  const file = input.files && input.files[0];
  if (!file) { box.innerHTML = ''; return; }
  box.innerHTML = `<p class="hint">${esc(T.loading)}</p>`;
  try {
    const text = file.text ? await file.text() : await new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsText(file); });
    const rows = parseBackupCsv(text);
    if (!state.all || state.allStale) setAll((await call('list', { limit: 1000000 })).rows);
    const have = new Set(state.all.map((r) => String(r.id)));
    const fresh = rows.filter((r) => r.id && !have.has(String(r.id)));
    state.restoreRows = fresh;
    box.innerHTML = `<p class="imp-sum"><b>${esc(T.restoreRead(rows.length))}</b> · ${esc(T.restoreKnown(rows.length - fresh.length))} · <b>${esc(T.restoreNew(fresh.length))}</b></p>`;
    btn.textContent = T.restoreSave(fresh.length);
    btn.disabled = !fresh.length;
  } catch (e) {
    box.innerHTML = `<p class="hint bad">${esc(T.restoreFailed(e.message))}</p>`;
  }
}

/** Rules as edited on screen, keeping each one's id, hits and author. */
export function readRules(form) {
  return $$('.rule', form).map((el, i) => ({
    ...(state.settings.rules[i] || {}),
    pattern: $('[data-r=pattern]', el).value.trim(), category: $('[data-r=category]', el).value, auto_approve: $('[data-r=auto_approve]', el).checked,
  }));
}

/** Under each rule: how many transactions it matches, with a few examples. */
export function previewRule(el) {
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

/**
 * Balance check of every account on one form: the app's balance and the last check next to each,
 * the difference as you type, and what to record it as (Penyesuaian, or a real income/expense
 * category, e.g. money that came into BCA, which never emails about money coming in).
 */
export function balanceForm(s) {
  const bal = new Map((s.balances || []).map((b) => [b.stream, b.balance]));
  const checks = s.lastChecks || {};
  const rows = s.accounts.map((a) => {
    const last = checks[a.stream];
    return `<fieldset class="acct-row bal-row" data-stream="${esc(a.stream)}" data-app="${esc(bal.get(a.stream) || 0)}"><legend>${esc(streamLabel(a.stream))}</legend>
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
export function updateBalRow(row) {
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

export function goalsForm(s) {
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

export const readGoals = (form) => $$('.goal-row', form).map((row) => Object.fromEntries($$('[data-g]', row).map((i) => [i.dataset.g, i.value])));

// `_orig`: where the account sits in storage (see accountorder.js), kept so that saving does not reorder the Accounts tab.
export const readAccounts = (form) => $$('.acct', form).map((row) => ({ ...Object.fromEntries($$('[data-a]', row).map((i) => [i.dataset.a, i.value])), ...(row.dataset.orig !== undefined ? { _orig: Number(row.dataset.orig) } : {}) }));
