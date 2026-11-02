// Splitting one transaction into parts with their own category, and joining them back.

import { patchRow } from './data.js';
import { closeModal } from './editor.js';
import { esc, rp } from './format.js';
import { categoryOptions, field, fieldMessage, repaint, toast } from './render.js';
import { save, scheduleRefresh } from './server.js';
import { $, $$, T, state } from './state.js';
import { tag } from './visuals.js';

const splitParts = (id) => (state.all || []).filter((r) => r.ref_no === `split:${id}`);

const cents = (n) => Math.round((Number(n) || 0) * 100);

export function splitSummary(x) {
  const parts = splitParts(x.id);
  if (!parts.length) return `<h3>${esc(T.splitTitle)}</h3><p class="hint">${esc(T.splitHint)}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="splitopen" data-id="${esc(x.id)}">${esc(T.splitOpen)}</button></div>`;
  const all = [x, ...parts];
  return `<h3>${esc(T.splitDone(all.length))}</h3><div class="rows">${all.map((p) => `<div class="rowi"><span class="what">${tag(p.category)} <span class="meta">${esc(p.description)}</span></span><span class="amt">${rp(p.amount)}</span></div>`).join('')}</div>
    <div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="splitopen" data-id="${esc(x.id)}">${esc(T.splitChange)}</button><button class="btn plain" type="button" data-action="unsplit" data-id="${esc(x.id)}">${esc(T.splitUndo)}</button></div>`;
}

export function splitRow(p, i) {
  return `<div class="split-row" data-i="${i}">
    ${field(T.amountRp, `<input data-s="amount" type="number" inputmode="decimal" step="any" min="0" value="${esc(p.amount || '')}">`)}
    ${field(T.category, `<select data-s="category">${categoryOptions(p.category, p.direction)}</select>`)}
    ${field(T.splitName, `<input data-s="description" value="${esc(p.description || '')}">`, { help: T.optional })}
  </div>`;
}

export function openSplit(id) {
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

export function updateSplitLeft() {
  const form = $('form[data-form=split]');
  if (!form) return 0;
  const left = state.splitTotal - readSplit(form).reduce((s, p) => s + cents(p.amount), 0);
  const el = $('#splitLeft');
  el.className = `split-left ${left === 0 ? 'ok' : 'bad'}`;
  el.textContent = left === 0 ? `✓ ${T.splitBalanced}` : left > 0 ? T.splitLeft(rp(left / 100)) : T.splitOver(rp(-left / 100));
  return left;
}

export function submitSplit(form) {
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

export function unsplit(id) {
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
