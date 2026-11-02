// The pop-up that edits one transaction, and who changed it last.

import { sharedToggle } from './cards.js';
import { dateLabel, esc, locale, rp } from './format.js';
import { accountOptions, categoryOptions, field, gmailLink } from './render.js';
import { splitSummary } from './split.js';
import { openModal } from './modal.js';
import { $, T, state } from './state.js';

/** Insurance claim marks on a payment, in its editor. */
function claimBox(x) {
  const s = x.claim || '';
  const btn = (v, label) => `<button type="button" class="chip-btn ${s === v ? 'on' : ''}" aria-pressed="${s === v}" data-action="claim" data-id="${esc(x.id)}" data-status="${s === v ? '' : v}">${esc(label)}</button>`;
  return `<div class="split-box" id="claimBox"><h3>${esc(T.claimTitle)}</h3><p class="hint">${esc(s === 'open' && x.claimDue ? T.claimOpenHint(dateLabel(x.claimDue, { weekday: false })) : T.claimHint)}</p>
    <div class="actions" style="justify-content:flex-start">${btn('open', T.claimOpen)}${btn('claimed', T.claimDone)}${btn('skip', T.claimSkip)}</div></div>`;
}

/** "Terakhir diubah oleh <nama>, 19 Okt 10.05": two people edit the same rows. */
const lastChanged = (x) => {
  if (!x.updated_by || !x.updated_at) return '';
  const at = new Date(x.updated_at);
  if (Number.isNaN(at.getTime())) return '';
  const by = ['sync', 'app'].includes(x.updated_by) ? T.bySync : x.updated_by;
  return `<p class="hint">${esc(T.lastChanged(by, at.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))}</p>`;
};

export function openEditor(id) {
  const x = state.rowsById.get(String(id));
  if (!x) return;
  const statuses = ['approved', 'pending', 'ignored'].map((s) => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${esc(T[`status${s[0].toUpperCase()}${s.slice(1)}`])}</option>`).join('');
  const parentId = String(x.ref_no || '').startsWith('split:') ? String(x.ref_no).slice(6) : '';
  $('#modal').innerHTML = `<div class="sheet">
    <form data-form="edit" data-id="${esc(x.id)}" novalidate>
      <h2>${esc(T.editTitle)}</h2>
      <p class="lead">${esc(x.gmail_id ? T.fromEmail : T.enteredByHand)}${gmailLink(x, 'link') ? ` · ${gmailLink(x, 'link')}` : ''}</p>
      ${lastChanged(x)}
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
      ${sharedToggle(x.details)}
      <div class="actions"><button class="btn secondary" type="button" data-action="close">${esc(T.cancel)}</button><button class="btn primary" type="submit">${esc(T.saveChanges)}</button></div>
    </form>
    ${parentId ? `<div class="split-box"><p>${esc(T.isSplitPart)}</p><button class="btn secondary" type="button" data-action="edit" data-id="${esc(parentId)}">${esc(T.openSplitParent)}</button></div>`
    : `<div class="split-box" id="splitBox">${splitSummary(x)}</div>`}
    ${x.direction === 'out' ? claimBox(x) : ''}
    ${x.direction === 'out' ? `<div class="split-box" id="tagihBox"><h3>${esc(T.tagihTitle)}</h3><p class="hint">${esc(T.tagihHint)}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" type="button" data-action="tagihopen" data-id="${esc(x.id)}">${esc(T.tagihOpen)}</button></div></div>` : ''}
    <div class="danger-zone"><button class="btn danger" type="button" data-action="delete" data-id="${esc(x.id)}">${esc(T.deleteTransaction)}</button>
      ${x.gmail_id ? `<p class="hint">${esc(T.deleteEmailHint)}</p>` : ''}</div>
  </div>`;
  openModal();
  const first = $('#modal input[name=description]');
  if (first && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) first.focus();
}

export function tagihForm(x) {
  return `<form data-form="tagih" data-id="${esc(x.id)}" novalidate><h3>${esc(T.tagihTitle)}</h3>
    ${field(T.tagihWho, '<input name="who" autocomplete="off" placeholder="Andi, Budi, Citra">', { help: T.tagihWhoHelp })}
    <label class="check"><input type="checkbox" name="me" checked> ${esc(T.tagihWithMe)}</label>
    ${field(T.tagihEach, '<input name="each" class="calc-input" inputmode="decimal" autocomplete="off"><em class="calc-out"></em>', { help: T.tagihEachHelp(rp(x.amount)) })}
    <div class="actions"><span class="state" role="status"></span><button class="btn primary" type="submit">${esc(T.tagihSave)}</button></div></form>`;
}

/** Each person's share: the payment split between the names (and you, when "including me"). */
export function updateTagih(form) {
  const x = state.rowsById.get(String(form.dataset.id));
  const names = form.querySelector('[name=who]').value.split(',').map((n) => n.trim()).filter(Boolean);
  const n = names.length + (form.querySelector('[name=me]').checked ? 1 : 0);
  const each = form.querySelector('[name=each]');
  if (!each.dataset.touched) each.value = names.length && n ? String(Math.round((Number(x.amount) || 0) / n)) : '';
}

