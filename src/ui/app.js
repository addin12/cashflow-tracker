// Cashflow Tracker web app (runs in the browser inside Apps Script's HtmlService).
// Talks to the server through google.script.run.api(name, payloadJson) -> JSON string.
// The shell that starts the page: sets up the listeners and the first load, and asks Google every minute whether the sync added anything. The screens are in the other files of this folder.
//
// Saving is optimistic: the screen changes at once, the change goes into a queue that sends it
// to Google in order (retrying while a sync holds the lock), and a quiet refresh follows when the
// queue is empty. If Google refuses a change, it is put back on screen with the reason.
/* global google */

import { svgIcon } from './icons.js';
import { applyQuick, showCalc, submitAdd } from './add.js';
import { FRESH_MS, TIMING_KEY, readCache, writeCache } from './cache.js';
import { updateInterest } from './cards.js';
import { absorb } from './data.js';
import { updateTagih } from './editor.js';
import { closeModal, trapTab } from './modal.js';
import { onChange, onClick, onSubmit } from './events.js';
import { esc } from './format.js';
import { previewRule, updateBalRow } from './forms.js';
import { failed, mineRow, repaint, setView, toast, updateNav } from './render.js';
import { quickFromReview } from './review.js';
import { show } from './router.js';
import { call, net, queue, scheduleRefresh, status } from './server.js';
import { updateSplitLeft } from './split.js';
import { $, T, state } from './state.js';
import { applyTheme, readTheme } from './theme.js';

const POLL_MS = 60000;

/** Cheap check (no spreadsheet on Google's side): refresh only when the sync changed something. */
async function pollChanges() {
  if (document.hidden || queue.length || net.refreshing || !state.boot) return;
  try {
    const s = await call('stamp');
    const c = (state.boot.connections || [])[0];
    if (c && s.checked && (!c.last_sync || s.checked > Date.parse(c.last_sync))) {
      c.last_sync = new Date(s.checked).toISOString();
      updateNav();
    }
    if (s.stamp && Number(s.stamp) > Date.parse(state.dataAt || 0)) scheduleRefresh(0);
  } catch (e) { /* next minute */ }
}

export async function start() {
  applyTheme(readTheme());
  document.addEventListener('click', onClick);
  const modal = $('#modal');
  if (modal && window.MutationObserver) {
    new MutationObserver(() => {
      const h = modal.querySelector('h2, h3');
      if (h) { h.id = h.id || 'modalTitle'; modal.setAttribute('aria-labelledby', h.id); } else modal.removeAttribute('aria-labelledby');
    }).observe(modal, { childList: true, subtree: true });
  }
  document.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('details.day-card')) state.dayOpen = e.target.open; }, true); // stays open while you type
  document.addEventListener('error', (e) => { // load errors don't bubble, so this listens while capturing
    const box = e.target?.parentElement;
    if (e.target?.tagName === 'IMG' && box?.classList.contains('logo')) { box.classList.remove('logo'); box.innerHTML = svgIcon(box.dataset.fallback); }
  }, true);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && $('#modal').classList.contains('open')) trapTab(e);
    if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal();
    if (e.key === 'Enter' && e.target.id === 'quickIn') { e.preventDefault(); const f = $('form[data-form=add]'); if (f) submitAdd(f); return; }
    if (e.key === 'Enter' && e.target.id === 'quickDay' && e.target.value.trim()) { e.preventDefault(); const t = e.target.value; e.target.value = ''; quickFromReview(t); return; }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === 'n' || e.key === 'N') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !$('#modal').classList.contains('open') && state.boot) show('add');
  });
  let searchTimer;
  document.addEventListener('input', (e) => {
    if (e.target.closest('form[data-form=split]')) updateSplitLeft();
    if (e.target.closest('form[data-form=interest]')) updateInterest(e.target.closest('form'));
    if (e.target.id === 'quickIn') applyQuick(e.target.value);
    if (e.target.matches && e.target.matches('.amount-input, .calc-input')) showCalc(e.target);
    const tg = e.target.closest('form[data-form=tagih]');
    if (tg) { if (e.target.name === 'each') e.target.dataset.touched = '1'; else updateTagih(tg); }
    if (e.target.dataset.k === 'actual' && e.target.closest('.bal-row')) updateBalRow(e.target.closest('.bal-row'));
    const rule = e.target.closest('.rule');
    if (rule && e.target.dataset.r === 'pattern') previewRule(rule);
    if (e.target.matches('[data-filter=q]')) { clearTimeout(searchTimer); searchTimer = setTimeout(() => onChange(e), 150); }
  });
  // Startup timing (ms since this page began loading), sent with the next startup.
  const t0 = (window.performance && performance.timing && performance.timing.navigationStart) || Date.now();
  const timing = { client_from_cache: false };
  // Data to paint at once: the snapshot built into the page by the server, or the copy saved in
  // this browser last time, whichever is newer. Fresh data follows in the background.
  const embedded = window.__INIT__ || null;
  const saved = readCache();
  const instant = [embedded, saved].filter(Boolean).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
  let waitTimer = null;
  // A short link (/tambah, /cek ...) asks for a screen; otherwise Review when something waits.
  const asked = window.__TAB__ || '';
  const firstTab = (data) => asked || (data.review.pending.some(mineRow) || (data.review.salary || []).length ? 'review' : 'dashboard');
  if (window.__PUSH__) {
    state.settingsSection = 'notif';
    setTimeout(() => toast(window.__PUSH__ === 'ok' ? T.notifAdded : T.notifBad, { kind: window.__PUSH__ === 'ok' ? 'ok' : 'bad' }), 600);
  }
  if (instant) {
    absorb(instant);
    status('loading');
    await show(firstTab(instant));
    timing.client_from_cache = true;
    timing.client_cached_ms = Date.now() - t0;
  } else {
    // Nothing to show yet: count the seconds, and offer a reload if Google is very slow.
    const began = Date.now();
    const tick = () => {
      const secs = Math.round((Date.now() - began) / 1000);
      setView(secs < 45
        ? `<div class="empty">${esc(T.loading)} ${secs}s</div>`
        : `<div class="card empty error"><b>${esc(T.slowServer)}</b><div class="actions" style="justify-content:center"><button class="btn primary" data-action="reloadpage">${esc(T.reloadPage)}</button></div></div>`);
    };
    tick();
    waitTimer = setInterval(tick, 1000);
  }
  const mine = net.seq;
  // While the page is open, fresh numbers every 10 minutes, and every minute a quick question to
  // Google ("did the sync add anything?") so a new bank transaction shows up within a minute or two.
  setInterval(() => { if (!document.hidden) scheduleRefresh(0); }, FRESH_MS);
  setInterval(pollChanges, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollChanges(); });
  // The sync refreshes the data built into the page every 10 minutes, and every change refreshes
  // it too: when it is that fresh, opening the app needs no extra request to Google.
  const age = instant ? Date.now() - Date.parse(instant.at) : Infinity;
  if (age > -5 * 60000 && age < FRESH_MS) { status(); return; }
  try {
    let lastLoad = null;
    try { lastLoad = JSON.parse(window.localStorage.getItem(TIMING_KEY) || 'null'); } catch (e) { /* none */ }
    const fresh = await call('init', { lastLoad });
    clearInterval(waitTimer);
    writeCache(fresh);
    if (net.seq !== mine) scheduleRefresh(); // something was saved meanwhile: don't paint over it
    else {
      state.dashByMonth = {};
      absorb(fresh);
      if (!instant) await show(firstTab(fresh)); else repaint();
    }
    timing.client_total_ms = Date.now() - t0;
    try { window.localStorage.setItem(TIMING_KEY, JSON.stringify(timing)); } catch (e) { /* storage unavailable */ }
  } catch (e) {
    clearInterval(waitTimer);
    if (!instant) failed(e); else toast(`${T.error}: ${e.message}`, { kind: 'bad' });
  } finally {
    if (!queue.length) status();
  }
}

// Start right away. This script is the last thing in <body>, so the page it needs is already
// there. Don't wait for DOMContentLoaded: Apps Script writes the page into its frame with
// document.write and may never close the document, so that event never fires (2026-10-06).
if (typeof window !== 'undefined' && !window.__CT_NO_AUTOSTART__) start();
