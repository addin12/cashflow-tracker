// Small, useful motion: big numbers count up when a screen opens, and charts answer a tap with the exact amounts.
// Whoever asks their phone for less motion gets none of the counting (the CSS handles the rest).
import { fmt, esc, rp } from './format.js';
import { $, T } from './state.js';

const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Counts every big number (data-v) inside `root` up from zero. */
export function countUp(root = document) {
  if (reduced()) return;
  root.querySelectorAll('.big-num[data-v]').forEach((el) => {
    const to = Number(el.dataset.v);
    const node = [...el.childNodes].find((n) => n.nodeType === 3);
    if (!node || !Number.isFinite(to) || Math.abs(to) < 100) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      node.data = fmt.format(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step); else node.data = fmt.format(to);
    };
    requestAnimationFrame(step);
  });
}

const read = (el, name) => { try { return JSON.parse(el.getAttribute(name) || 'null'); } catch (e) { return null; } };
let tipTimer = null;

/** Tap or move over the running-total chart: the day, and both months' totals up to it. */
function lineTip(e) {
  const wrap = e.target.closest && e.target.closest('.line-wrap');
  if (!wrap) return false;
  const d = read(wrap, 'data-line');
  const tip = $('.chart-tip', wrap);
  if (!d || !tip) return true;
  const box = wrap.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(1, box.width)));
  const i = Math.round(ratio * (d.n - 1));
  const parts = [`${T.chartDay(i + 1)}`];
  if (d.a[i] != null) parts.push(`${esc(d.now)} ${rp(d.a[i])}`);
  if (d.b[i] != null) parts.push(`${esc(d.prev)} ${rp(d.b[i])}`);
  tip.innerHTML = parts.map((p, k) => (k ? `<span>${p}</span>` : `<b>${p}</b>`)).join('');
  tip.hidden = false;
  wrap.style.setProperty('--x', `${((i / Math.max(1, d.n - 1)) * 100).toFixed(2)}%`);
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.hidden = true; }, 4000);
  return true;
}

/** Tap a slice of the donut: its category and amount in the middle; tap the middle to go back. */
function donutTap(e) {
  const donut = e.target.closest && e.target.closest('.donut[data-segs]');
  if (!donut) return false;
  const segs = read(donut, 'data-segs') || [];
  const mid = donut.firstElementChild;
  if (!mid) return true;
  if (!donut.dataset.orig) donut.dataset.orig = mid.innerHTML;
  const box = donut.getBoundingClientRect();
  const dx = e.clientX - (box.left + box.width / 2);
  const dy = e.clientY - (box.top + box.height / 2);
  if (Math.hypot(dx, dy) < box.width * 0.34) { mid.innerHTML = donut.dataset.orig; return true; } // the middle: back to the total
  const pct = ((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) / 3.6;
  let at = 0;
  const hit = segs.find((s) => { at += s.p; return pct <= at; }) || segs[segs.length - 1];
  if (hit) mid.innerHTML = `<span>${esc(hit.c)}</span><b>${rp(hit.v)}</b><small>${Math.round(hit.p)}%</small>`;
  return true;
}

export function initCharts() {
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') lineTip(e); });
  document.addEventListener('click', (e) => { if (!lineTip(e)) donutTap(e); });
}
