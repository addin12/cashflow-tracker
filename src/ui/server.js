// Talking to Google: one call, and the queue that sends changes in order and refreshes quietly afterwards.
/* global google */

import { writeCache } from './cache.js';
import { callCloud } from './cloud.js';
import { absorb, setAll } from './data.js';
import { esc, wait } from './format.js';
import { repaint, toast } from './render.js';
import { $, T, state } from './state.js';

/** Counters shared with the rest of the page: `seq` goes up with every local change, so an older refresh never overwrites it. */
export const net = { seq: 0, refreshing: false };

export function call(name, payload = {}) {
  // Outside Google (the page served by the Cloudflare Worker) there is no google.script: the calls go to the Worker.
  if (typeof google === 'undefined' || !google.script) return callCloud(name, payload);
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((text) => {
        const r = JSON.parse(text);
        if (r.error) { const e = new Error(r.error); e.retry = !!r.retry; reject(e); } else resolve(r.data);
      })
      .withFailureHandler((e) => reject(e instanceof Error ? e : new Error(String(e && e.message ? e.message : e))))
      .api(name, JSON.stringify(payload));
  });
}

export const queue = [];

let draining = false;

/** Sends a change to Google in the background. Resolves with the server's answer. */
export function save(name, payload) {
  net.seq += 1;
  return new Promise((resolve, reject) => {
    queue.push({ name, payload, resolve, reject, tries: 0 });
    status();
    drain();
  });
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue[0];
    try {
      const r = await call(job.name, job.payload);
      queue.shift();
      job.resolve(r);
    } catch (e) {
      if (e.retry && job.tries < 12) { job.tries += 1; status('waiting'); await wait(5000); continue; }
      queue.shift();
      job.reject(e);
    }
    status();
  }
  draining = false;
  status('done');
  scheduleRefresh();
}

export function status(kind) {
  const el = $('#stale');
  if (!el) return;
  clearTimeout(status.t);
  let text = '';
  if (kind === 'waiting') text = T.waitingSync;
  else if (queue.length) text = T.savingN(queue.length);
  else if (kind === 'loading') text = T.updating;
  else if (kind === 'done') {
    el.innerHTML = `<span class="spin" aria-hidden="true"></span> <b>✓ ${esc(T.allSaved)}</b>`;
    el.className = 'status show done';
    status.t = setTimeout(() => { el.className = 'status'; }, 1600);
    return;
  }
  if (!text) { el.className = 'status'; return; }
  el.innerHTML = `<span class="spin" aria-hidden="true"></span> <b>${esc(text)}</b>`;
  el.className = 'status show';
}

let refreshTimer = null;

export function scheduleRefresh(delay = 1200) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, delay);
}

/** Fresh numbers from Google after changes, without disturbing what is on screen. */
export async function refresh() {
  if (queue.length || net.refreshing) return;
  net.refreshing = true;
  const mine = net.seq;
  try {
    const fresh = await call('init', { refresh: true });
    if (net.seq !== mine || queue.length) return; // a newer change is on its way and refreshes again
    writeCache(fresh);
    state.dashByMonth = {};
    absorb(fresh);
    if (state.all) {
      const r = await call('list', { limit: 1000000 });
      if (net.seq !== mine) return;
      setAll(r.rows);
    }
    repaint();
  } catch (e) {
    // keep what is on screen; the next change or visit tries again
  } finally {
    net.refreshing = false;
  }
}

export async function syncNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = T.syncing; }
  status('loading');
  try {
    const s = await call('syncNow');
    toast(s.status === 'busy' ? T.syncBusy : T.syncDone(s.added || 0));
    await refresh();
  } catch (e) {
    toast(`${T.error}: ${e.message}`, { kind: 'bad' });
  } finally {
    status();
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = `↻ ${T.syncNow}`; }
  }
}
