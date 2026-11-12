// Screenshots of every screen at phone and PC size, with made-up demo data, in headless Edge.
//   node scripts/screens.mjs [--only=phone-review,pc-dashboard]   -> private/screens/*.png
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
const sizes = { phone: [390, Number((process.argv.find((a) => a.startsWith('--phone-height=')) || '=1500').split('=')[1])], pc: [1440, Number((process.argv.find((a) => a.startsWith('--pc-height=')) || '=1000').split('=')[1])], mid: [1120, 1000], mid2: [1260, 1000] }; // mid: just above the table breakpoint, only with --only=mid-...
const shots = [
  ['review'], ['dashboard'], ['transactions'], ['add'], ['settings'],
  ['editor', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ document.querySelector('.trow').click(); }, 300);"],
  ['invalid', "document.querySelector('.txcard [data-action=approve]').click();"],
  ['split', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ var r = [].slice.call(document.querySelectorAll('.trow')).filter(function(x){ return /TOKOPEDIA/.test(x.textContent); })[0]; r.click(); setTimeout(function(){ document.querySelector('[data-action=splitopen]').click(); var rows = document.querySelectorAll('.split-row'); rows[0].querySelector('[data-s=amount]').value = '150000'; rows[1].querySelector('[data-s=amount]').value = '50000'; rows[1].querySelector('[data-s=amount]').dispatchEvent(new Event('input', { bubbles: true })); }, 200); }, 300);"],
  ['trend', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=drill][data-category]').click(); }, 300);"],
  ['rules', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=rules]').click(); }, 300);"],
  ['balcheck', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ var r = document.querySelector('.bal-row[data-stream=\"Bank A\"]'); var i = r.querySelector('[data-k=actual]'); i.value = String(Number(r.dataset.app) + 750000); i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('[data-k=category]').value = 'Pemasukan Lainnya'; var w = document.querySelector('.bal-row[data-stream=\"E-Wallet\"] [data-k=actual]'); w.value = '0'; w.dispatchEvent(new Event('input', { bubbles: true })); }, 500);"],
  ['report', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=dashview][data-view=report]').click(); }, 400);"],
  ['flow', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=dashview][data-view=report]').click(); setTimeout(function(){ var d = [].slice.call(document.querySelectorAll('details.fold')).filter(function(x){ return /Alur uang|Money flow/.test(x.textContent); })[0]; d.open = true; var v = document.getElementById('view'); v.innerHTML = ''; v.appendChild(d); window.scrollTo(0, 0); }, 500); }, 300);"],
  ['ask', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=askchip]').click(); }, 600);"],
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
  ['darkmode', "document.querySelector('#themeBtn').click(); document.querySelector('.nav [data-tab=dashboard]').click();"],
  ['dup', "document.querySelector('.nav [data-tab=add]').click(); setTimeout(function(){ var f = document.querySelector('form[data-form=add]'); f.querySelector('[name=amount]').value = '45000'; f.querySelector('[name=category]').value = 'Food & Beverages'; f.querySelector('[name=description]').value = 'Bakso'; f.querySelector('[type=submit]').click(); }, 600);"],
];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const lang = (process.argv.find((a) => a.startsWith('--lang=')) || '--lang=id').slice(7);
mkdirSync('private/screens', { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'ct-shot-'));
for (const [size, [w, h]] of Object.entries(sizes)) {
  for (const [name, script] of shots) {
    const id = `${size}-${name}`;
    if (only.length && !only.includes(id)) continue;
    if (size.startsWith('mid') && !only.length) continue;
    const click = script || `document.querySelector('.nav [data-tab=${name}]').click();`;
    const harness = `<script>
window.google = { script: { get run() { var ok; var r = { withSuccessHandler: function (f) { ok = f; return r; }, withFailureHandler: function () { return r; },
  api: function (name, json) { var p = JSON.parse(json || '{}'); var A = ${JSON.stringify(answers).replace(/</g, '\\u003c')};
    var data = name === 'dashboard' ? (A['dashboard:' + p.month] || A.init.dashboard) : name === 'init' ? A.init : A[name] || { ok: true };
    setTimeout(function () { ok(JSON.stringify({ data: data })); }, 50); } }; return r; } } };
Object.defineProperty(navigator, 'language', { value: '${lang === 'en' ? 'en-GB' : 'id-ID'}' });
setTimeout(function () { ${click} }, 400);
</script>`;
    const html = built.replace(INIT_PLACEHOLDER, () => `window.__INIT__=${JSON.stringify(answers.init).replace(/</g, '\\u003c')};`).replace('<head>', `<head>${harness}`);
    // Browsers keep a minimum window width, so a phone is a 390px-wide frame inside a wider window.
    writeFileSync(join(dir, `${id}-app.html`), html);
    const file = join(dir, `${id}.html`);
    writeFileSync(file, size === 'phone'
      ? `<!doctype html><body style="margin:0;background:#888"><iframe src="${id}-app.html" style="border:0;width:${w}px;height:${h}px;display:block"></iframe></body>`
      : html);
    const out = join(process.cwd(), 'private', 'screens', `${id}${process.argv.includes('--dark') ? '-dark' : ''}.png`);
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${join(dir, 'profile')}`,
      `--window-size=${size === 'phone' ? 600 : w},${h}`, '--virtual-time-budget=4000', ...(process.argv.includes('--dark') ? [] : ['--blink-settings=preferredColorScheme=1']), `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 60000 });
    console.log(`private/screens/${id}.png`);
  }
}
