// The Add screen: the form, the typed sentence, the calculator keys, usual entries and the duplicate warning.

import { evalAmount, parseQuick } from '../core/quick.js';
import { svgIcon } from './icons.js';
import { sharedToggle } from './cards.js';
import { setAll } from './data.js';
import { esc, rp, signed, when } from './format.js';
import { accountOptions, categoryOptions, field, fieldMessage, setView, toast } from './render.js';
import { call, save } from './server.js';
import { $, T, state } from './state.js';
import { tag } from './visuals.js';

/** Amount fields accept a little sum ("12000+3500", "3x25rb"); a leading minus stays (adjustments). */
export function amountValue(raw) {
  const s = String(raw ?? '').trim();
  if (/^-/.test(s)) return -evalAmount(s.slice(1));
  return evalAmount(s);
}

/** Under an amount field: "= Rp15.500" while the field holds a sum. */
export function showCalc(input) {
  const out = input.closest('.field') && $('.calc-out', input.closest('.field'));
  if (!out) return;
  const v = amountValue(input.value);
  out.textContent = /[+\-x×*/÷:]/.test(input.value.replace(/^-/, '')) && Number.isFinite(v) ? `= ${rp(v)}` : '';
}

const CALC_KEYS = [['+', '+'], ['−', '-'], ['×', 'x'], ['÷', '/']];

/** The sentence on Add fills the form below it (what it can't tell, the form still asks). */
export function applyQuick(text) {
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

/** "Yang biasa": one tap fills Add with something you log often. */
function usualChips() {
  const list = (state.boot && state.boot.usual) || [];
  if (!list.length) return '';
  return `<div class="usual" role="group" aria-label="${esc(T.usualTitle)}"><span class="usual-label">${esc(T.usualTitle)}</span>${list.map((u, i) => `
    <button type="button" class="chip-btn" data-action="usual" data-i="${i}">${esc(u.description)} · ${rp(u.amount)}${u.stream ? ` · ${esc(u.stream)}` : ''}</button>`).join('')}</div>`;
}

export function useUsual(i) {
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

export function viewAdd() {
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
      ${sharedToggle(pre.details || '')}
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

export function submitAdd(form) {
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
    $('#addDup').innerHTML = `<div class="dup-warning" role="alert"><b>${svgIcon('alert')} ${esc(T.dupTitle)}</b><p>${esc(T.dupHint)}</p>
      <div class="rows">${dups.map((x) => `<div class="rowi"><span class="what"><b>${esc(x.description || T.noName)}</b><span class="meta">${esc(when(x))} · ${esc(x.stream)} · ${tag(x.category)}</span></span><span class="amt ${esc(x.direction)}">${signed(x)}</span></div>`).join('')}</div>
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
    .catch((e) => { if ($('#addState') === st) { st.className = 'state bad'; st.textContent = `${T.notSaved}: ${e.message}`; } toast(`${T.notSaved}: ${label} (${e.message})`, { kind: 'bad' }); });
  el('amount').focus();
}
