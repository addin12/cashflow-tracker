// Measured UX facts in a real browser at phone width (Edge or Chrome, demo data): tap targets under 44 px, text under 14 px, and text that is cut off with "...".
// The rules are the owner's "UI rules for real users" (docs/UI-DIRECTION.md). Prints counts and the first examples per screen.
//   npm run build && node scripts/ux-measure.mjs
import { openPage, pageFile, sleep } from './cdp.mjs';

const SCREENS = [
  ['Cek', "document.querySelector('.nav [data-tab=review]').click()"],
  ['Ringkasan (Ikhtisar)', "document.querySelector('.nav [data-tab=dashboard]').click()"],
  ['Ringkasan (Laporan)', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=dashview][data-view=report]').click(); }, 300)"],
  ['Transaksi', "document.querySelector('.nav [data-tab=transactions]').click()"],
  ['Tambah', "document.querySelector('.nav [data-tab=add]').click()"],
  ['Pengaturan', "document.querySelector('.nav [data-tab=settings]').click()"],
  ['Pengaturan > Preferensi', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=prefs]').click(); }, 300)"],
];

const probe = `(function () {
  var vis = function (el) { var r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') && r.bottom > 0; };
  var label = function (el) { return (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 36); };
  var small = [], tiny = [], cut = [];
  document.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, summary, [role=button]').forEach(function (el) {
    if (!vis(el) || el.closest('.nav')) return;
    var r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push(label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });
  document.querySelectorAll('#view *').forEach(function (el) {
    if (!vis(el) || !el.childNodes.length) return;
    var own = Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
    if (!own) return;
    var s = getComputedStyle(el);
    if (parseFloat(s.fontSize) < 13.5) tiny.push(label(el) + ' ' + s.fontSize);
    if ((s.textOverflow === 'ellipsis' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) cut.push(label(el));
  });
  return JSON.stringify({ small: small, tiny: tiny, cut: cut });
})()`;

for (const [name, open] of SCREENS) {
  const page = await openPage(pageFile(10), { width: 390, height: 844 });
  try {
    await page.run(open);
    await sleep(900);
    const r = JSON.parse(await page.run(probe));
    const show = (list) => [...new Set(list)].slice(0, 5).join(' | ');
    console.log(`\n${name}`);
    console.log(`  taps under 44 px : ${r.small.length}${r.small.length ? `  e.g. ${show(r.small)}` : ''}`);
    console.log(`  text under 13.5px: ${r.tiny.length}${r.tiny.length ? `  e.g. ${show(r.tiny)}` : ''}`);
    console.log(`  text cut off     : ${r.cut.length}${r.cut.length ? `  e.g. ${show(r.cut)}` : ''}`);
  } finally { page.close(); }
}
