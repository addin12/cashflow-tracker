// Anti-Slop browser audit: measures every screen (phone and PC, light and dark) with demo data in headless Edge:
//   tap targets under 44px, horizontal overflow, focus visibility, and an inventory of decoration (gradients, shadows,
//   pills, emoji icons, arrows, badges, uppercase tracking). Generated from a11y.mjs (same screens and demo data).
//   A11Y_OUT=out.json node scripts/antislop-browser.mjs [--only=phone-review,...] [--dark]
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { INIT_PLACEHOLDER } from './ui-build.mjs';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');

import { answers } from './demo-data.mjs';

// ---- shots
const built = readFileSync('dist/index.html', 'utf8');
const phoneWidth = Number((process.argv.find((a) => a.startsWith('--phone-width=')) || '=390').split('=')[1]);
const sizes = { phone: [phoneWidth, 1500], pc: [1440, Number((process.argv.find((a) => a.startsWith('--pc-height=')) || '=1000').split('=')[1])] };
const shots = [
  ['review'], ['dashboard'], ['transactions'], ['add'], ['settings'],
  ['editor', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ document.querySelector('.trow').click(); }, 300);"],
  ['invalid', "document.querySelector('.txcard [data-action=approve]').click();"],
  ['split', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ var r = [].slice.call(document.querySelectorAll('.trow')).filter(function(x){ return /TOKOPEDIA/.test(x.textContent); })[0]; r.click(); setTimeout(function(){ document.querySelector('[data-action=splitopen]').click(); var rows = document.querySelectorAll('.split-row'); rows[0].querySelector('[data-s=amount]').value = '150000'; rows[1].querySelector('[data-s=amount]').value = '50000'; rows[1].querySelector('[data-s=amount]').dispatchEvent(new Event('input', { bubbles: true })); }, 200); }, 300);"],
  ['trend', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=drill][data-category]').click(); }, 300);"],
  ['rules', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=rules]').click(); }, 300);"],
  ['balcheck', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ var r = document.querySelector('.bal-row[data-stream=\"Bank A\"]'); var i = r.querySelector('[data-k=actual]'); i.value = String(Number(r.dataset.app) + 750000); i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('[data-k=category]').value = 'Pemasukan Lainnya'; var w = document.querySelector('.bal-row[data-stream=\"E-Wallet\"] [data-k=actual]'); w.value = '0'; w.dispatchEvent(new Event('input', { bubbles: true })); }, 500);"],
  ['report', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=dashview][data-view=report]').click(); }, 400);"],
  ['yearly', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=dashview][data-view=report]').click(); setTimeout(function(){ document.querySelector('[data-action=reportmode][data-mode=year]').click(); }, 300); }, 300);"],
  ['picking', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ document.querySelector('[data-action=selectmode]').click(); setTimeout(function(){ var r = document.querySelectorAll('.trow'); r[3].click(); r[4].click(); }, 300); }, 300);"],
  ['import', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=import]').click(); }, 300);"],
  ['subs', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=subs]').click(); }, 400);"],
  ['quick', "document.querySelector('.nav [data-tab=add]').click(); setTimeout(function(){ var q = document.querySelector('#quickIn'); q.value = 'kopi kenangan 28rb+5rb e-wallet #ngopi'; q.dispatchEvent(new Event('input', { bubbles: true })); }, 400);"],
  ['plans', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=plans]').click(); }, 300);"],
  ['assets', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=assets]').click(); }, 300);"],
  ['household', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=household]').click(); }, 300);"],
  ['setbudgets', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=budgets]').click(); }, 300);"],
  ['bell', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('#bellBtn').click(); }, 300);"],
  ['darkmode', process.argv.includes('--dark') ? "document.querySelector('.nav [data-tab=dashboard]').click();" : "document.querySelector('#themeBtn').click(); document.querySelector('.nav [data-tab=dashboard]').click();"],
  ['dup', "document.querySelector('.nav [data-tab=add]').click(); setTimeout(function(){ var f = document.querySelector('form[data-form=add]'); f.querySelector('[name=amount]').value = '45000'; f.querySelector('[name=category]').value = 'Food & Beverages'; f.querySelector('[name=description]').value = 'Bakso'; f.querySelector('[type=submit]').click(); }, 600);"],
];

const dir = mkdtempSync(join(tmpdir(), 'ct-a11y-'));
const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const dark = process.argv.includes('--dark');
const all = {};
for (const [size, [w, h]] of Object.entries(sizes)) {
  for (const [name, script] of shots) {
    const id = `${size}-${name}`;
    if (only.length && !only.includes(id)) continue;
    const click = script || `document.querySelector('.nav [data-tab=${name}]').click();`;
    const run = `setTimeout(function(){ ${'axe'}; }, 0);`;
    const harness = `<script>
window.google = { script: { get run() { var ok; var r = { withSuccessHandler: function (f) { ok = f; return r; }, withFailureHandler: function () { return r; },
  api: function (name, json) { var p = JSON.parse(json || '{}'); var A = ${JSON.stringify(answers).replace(/</g, '\\u003c')};
    var data = name === 'dashboard' ? (A['dashboard:' + p.month] || A.init.dashboard) : name === 'init' ? A.init : A[name] || { ok: true };
    setTimeout(function () { ok(JSON.stringify({ data: data })); }, 50); } }; return r; } } };
${dark ? "try { localStorage.setItem('cashflow.theme.v1', 'dark'); } catch (e) {}" : ''}
Object.defineProperty(navigator, 'language', { value: 'id-ID' });
window.__cls = 0; try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true }); } catch (x) { /* not supported */ }
setTimeout(function () { ${click} }, 400);
setTimeout(function () {
  function vis(e) { var r = e.getBoundingClientRect(); var cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  function label(e) { return (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' "' + ((e.getAttribute('aria-label') || e.textContent || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 28)) + '"'); }
  var W = window.innerWidth;
  var interactive = [].slice.call(document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')).filter(vis);
  var small = [];
  interactive.forEach(function (e) {
    var r = e.getBoundingClientRect();
    var inText = e.tagName === 'A' && e.closest('p, li, .hint, small, .meta, label');
    if ((r.width < 44 || r.height < 44) && !(e.type === 'checkbox' || e.type === 'radio') && !inText) small.push({ el: label(e), w: Math.round(r.width), h: Math.round(r.height) });
  });
  var overflow = [].slice.call(document.querySelectorAll('body *')).filter(function (e) { if (!vis(e)) return false; var r = e.getBoundingClientRect(); return r.right > W + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 6).map(label);
  // focus visibility: focus each of the first 60 controls and see whether outline or shadow appears
  var noFocus = [];
  interactive.slice(0, 60).forEach(function (e) {
    var before = getComputedStyle(e); var b = before.outlineStyle + before.outlineWidth + before.boxShadow;
    try { e.focus({ focusVisible: true }); } catch (x) { e.focus(); }
    var a = getComputedStyle(e); var af = a.outlineStyle + a.outlineWidth + a.boxShadow;
    if (document.activeElement === e && (a.outlineStyle === 'none' || a.outlineWidth === '0px') && af === b) noFocus.push(label(e));
    e.blur();
  });
  var all = [].slice.call(document.querySelectorAll('body *')).filter(vis);
  var gradients = 0; var shadows = 0; var pills = 0; var upper = 0;
  all.forEach(function (e) { var c = getComputedStyle(e); if (/gradient/.test(c.backgroundImage)) gradients += 1; if (c.boxShadow !== 'none') shadows += 1; var h = e.getBoundingClientRect().height; if (e.matches('button, a, select, input, .badge, .chip, .tag, [role=button]') && h > 16 && parseFloat(c.borderTopLeftRadius) >= h / 2 - 1) pills += 1; if (c.textTransform === 'uppercase') upper += 1; });
  var text = document.body.innerText;
  var emoji = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  var arrows = (text.match(/[→↗↘›»]/g) || []).length;
  var badges = [].slice.call(document.querySelectorAll('.badge, .tag')).filter(vis).length; var chips = [].slice.call(document.querySelectorAll('.chip, .hchip, .chip-btn')).filter(vis).length;
  var cards = document.querySelectorAll('.card').length;
  var heads = [].slice.call(document.querySelectorAll('h1, h2, h3')).filter(vis).length;
  var out = JSON.stringify({ interactive: interactive.length, smallTargets: small, overflowX: document.documentElement.scrollWidth > W + 1, overflowEls: overflow, noFocusIndicator: noFocus, decoration: { gradients: gradients, shadows: shadows, pills: pills, uppercase: upper, emoji: emoji, arrows: arrows, badges: badges, chips: chips, cards: cards, headings: heads }, layoutShift: Math.round((window.__cls || 0) * 1000) / 1000, textChars: text.length });
  if (window.parent !== window) parent.postMessage({ a11y: out }, '*'); else { var p = document.createElement('pre'); p.id = 'a11y'; p.textContent = out; document.body.appendChild(p); }
}, 2200);
</script>`;
    const html = built.replace(INIT_PLACEHOLDER, () => `window.__INIT__=${JSON.stringify(answers.init).replace(/</g, '\\u003c')};`).replace('<head>', `<head>${harness}`);
    writeFileSync(join(dir, `${id}-app.html`), html);
    const file = join(dir, `${id}.html`);
    writeFileSync(file, size === 'phone'
      ? `<!doctype html><body style="margin:0;background:#888"><iframe src="${id}-app.html" style="border:0;width:${w}px;height:${h}px;display:block"></iframe><pre id="a11y"></pre><script>window.addEventListener('message', function (e) { if (e.data && e.data.a11y) document.getElementById('a11y').textContent = e.data.a11y; });</script></body>`
      : html);
    let dom = '';
    try {
      dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, `--window-size=${size === 'phone' ? 600 : w},${h}`,
        '--virtual-time-budget=12000', ...(dark ? [] : ['--blink-settings=preferredColorScheme=1']), '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 90000, maxBuffer: 80e6 });
    } catch (e) { dom = String(e.stdout || ''); }
    const m = dom.match(/<pre id="a11y"[^>]*>([\s\S]*?)<\/pre>/);
    const text = m ? m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
    try { all[id] = text ? JSON.parse(text) : null; } catch (e) { all[id] = null; }
    console.log(id, all[id] === null ? 'NO RESULT' : `${all[id].smallTargets.length} small targets, overflow ${all[id].overflowX}, ${all[id].noFocusIndicator.length} without focus, decoration ${JSON.stringify(all[id].decoration)}`);
  }
}
writeFileSync(process.env.A11Y_OUT, JSON.stringify(all));
