// Loads the built web app page (dist/index.html) in a real headless browser (Edge/Chrome) with a
// fake google.script.run, and prints any script errors plus what ended up on screen.
//   node scripts/browser-check.mjs [--embedded]
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');

// A tiny in-memory data set so the fake server can answer "init".
const t = {
  [TABS.transactions]: [{ id: 't1', date: '2026-10-05', time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: '', description: 'WARUNG', details: '', status: 'pending', gmail_id: 'g1', updated_by: 'sync' }],
  [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', institution: 'BCA', match_hint: '', opening_balance: 0 }],
};
const slots = buildCategorySlots({ income: ['gaji'], expense: ['fnb'] });
const store = {
  read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append() {}, update() {}, remove() {}, replace() {},
  config: (k) => ({ owner_name: 'Me', start_date: '2026-09-01', payday_day: 28 }[k] ?? ''), setConfig() {}, slots: () => slots, setSlots() {},
};
const init = createApi(store, { now: () => new Date(2026, 9, 6, 9, 0), sync: () => ({}) }).init();

let html = readFileSync('dist/index.html', 'utf8');
if (process.argv.includes('--embedded')) html = html.replace('/*INIT*/', () => `window.__INIT__=${JSON.stringify(init).replace(/</g, '\\u003c')};`);
const harness = `<script>
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push('error: ' + e.message + ' @' + e.lineno + ':' + e.colno); });
window.addEventListener('unhandledrejection', function (e) { window.__errors.push('rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
window.google = { script: { get run() { var ok; var r = { withSuccessHandler: function (f) { ok = f; return r; }, withFailureHandler: function () { return r; },
  api: function () { setTimeout(function () { ok(${JSON.stringify(JSON.stringify({ data: init }))}); }, 300); } }; return r; } } };
setTimeout(function () { var p = document.createElement('pre'); p.id = 'report'; p.textContent = JSON.stringify({ errors: window.__errors, view: (document.getElementById('view') || {}).textContent }); document.body.appendChild(p); }, 3000);
</script>`;
html = html.replace('<head>', `<head>${harness}`);
const dir = mkdtempSync(join(tmpdir(), 'ct-'));
const file = join(dir, 'page.html');
if (process.argv.includes('--docwrite')) {
  // Like Apps Script's HtmlService: the page is written into a frame with document.write and the
  // document may never be closed, so DOMContentLoaded never fires.
  writeFileSync(file, `<!doctype html><html><body><iframe id="f"></iframe><script>
var d = document.getElementById('f').contentWindow.document; d.open(); d.write(${JSON.stringify(html).replace(/<\//g, '<\\/')});
setTimeout(function () { var r = d.getElementById('report'); var p = document.createElement('pre'); p.id = 'report';
  p.textContent = r ? r.textContent : JSON.stringify({ errors: ['no report inside the frame'], view: (d.getElementById('view') || {}).textContent }); document.body.appendChild(p); }, 4000);
</script></body></html>`);
} else {
  writeFileSync(file, html);
}
const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`,
  '--virtual-time-budget=6000', '--timeout=8000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 60000 });
const m = dom.match(/<pre id="report">([\s\S]*?)<\/pre>/);
const report = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null;
console.log(`browser: ${browser.split('/').pop()}`);
console.log(report ? JSON.stringify(report, null, 2) : `no report; DOM starts: ${dom.slice(0, 500)}`);
