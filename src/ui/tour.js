// A short tour of the main screens: shown once on a first visit, and again from Settings.
import { esc } from './format.js';
import { openModal } from './modal.js';
import { $, T } from './state.js';

const KEY = 'cashflow.tour.v1';
const seen = () => { try { return !!window.localStorage.getItem(KEY); } catch (e) { return true; } };
const markSeen = () => { try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* asked again next time */ } };

export function tourStep(i) {
  const steps = T.tourSteps;
  const n = steps.length;
  const k = Math.min(Math.max(0, i), n - 1);
  const [title, body] = steps[k];
  $('#modal').innerHTML = `<div class="sheet tour"><p class="eyebrow">${esc(T.tourStepOf(k + 1, n))}</p><h2>${esc(title)}</h2><p class="lead">${esc(body)}</p>
    <div class="actions">${k ? `<button class="btn secondary" type="button" data-action="tourstep" data-i="${k - 1}">${esc(T.tourBack)}</button>` : `<button class="btn secondary" type="button" data-action="close">${esc(T.tourSkip)}</button>`}
      ${k < n - 1 ? `<button class="btn primary" type="button" data-action="tourstep" data-i="${k + 1}">${esc(T.tourNext)}</button>` : '<button class="btn primary" type="button" data-action="close">' + esc(T.tourDone) + '</button>'}</div></div>`;
  openModal();
  markSeen();
}

/** On a first visit, once the first screen is up. */
export function maybeTour() {
  if (!seen() && !$('#modal').classList.contains('open')) tourStep(0);
}
