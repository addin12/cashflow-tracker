// Screenshots of the REAL data in the real UI, as each person sees it (phone size, headless Edge). Read-only copy of
// the spreadsheet; the pictures go to private/screens-live/ (git-ignored: they show real transactions).
//   node scripts/screens-live.mjs [--who=<name>] [--only=review,dashboard]
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createApi } from '../src/core/api.js';
import { INIT_PLACEHOLDER } from './ui-build.mjs';
import { loadLive } from './live-store.mjs';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');
const arg = (name, fallback = '') => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `=${fallback}`).split('=')[1];
const wantWho = arg('who');
const only = arg('only').split(',').filter(Boolean);

const { store, people } = await loadLive();
const built = readFileSync('dist/index.html', 'utf8');
const section = (key) => `document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=${key}]').click(); }, 300);`;
const shots = [
  ['review', "document.querySelector('.nav [data-tab=review]').click();"],
  ['dashboard', "document.querySelector('.nav [data-tab=dashboard]').click();"],
  ['transactions', "document.querySelector('.nav [data-tab=transactions]').click();"],
  ['accounts', section('accounts')],
  ['household', section('household')],
  ['monthend', section('monthend')],
];
mkdirSync('private/screens-live', { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'ct-live-'));
for (const p of people.filter((x) => !wantWho || x.who === wantWho)) {
  const api = createApi(store, { now: () => new Date(), isOwner: p.isOwner, meName: p.who, myEmail: p.emails.split(',')[0].trim().toLowerCase(), sheetUrl: 'https://example.invalid/sheet' });
  const init = api.init();
  const month = init.boot.currentMonth || init.boot.today.slice(0, 7);
  const answers = { init, list: api.list({ limit: 1e6 }), settings: api.settings(), review: api.review(), yearly: api.yearly({ year: new Date().getFullYear() }), [`dashboard:${month}`]: api.dashboard({ month }) };
  for (const [name, click] of shots) {
    if (only.length && !only.includes(name)) continue;
    const id = `${p.who}-${name}`;
    const harness = `<script>
window.__ME__ = ${JSON.stringify(p.who)};
window.google = { script: { get run() { var ok; var r = { withSuccessHandler: function (f) { ok = f; return r; }, withFailureHandler: function () { return r; },
  api: function (name, json) { var p = JSON.parse(json || '{}'); var A = ${JSON.stringify(answers).replace(/</g, '\\u003c')};
    var data = name === 'dashboard' ? (A['dashboard:' + p.month] || A.init.dashboard) : name === 'init' ? A.init : A[name] || { ok: true };
    setTimeout(function () { ok(JSON.stringify({ data: data })); }, 50); } }; return r; } } };
Object.defineProperty(navigator, 'language', { value: 'id-ID' });
setTimeout(function () { ${click} }, 500);
</script>`;
    const html = built.replace(INIT_PLACEHOLDER, () => `window.__INIT__=${JSON.stringify(init).replace(/</g, '\\u003c')};`).replace('<head>', `<head>${harness}`);
    writeFileSync(join(dir, `${id}-app.html`), html);
    const file = join(dir, `${id}.html`);
    writeFileSync(file, `<!doctype html><body style="margin:0;background:#888"><iframe src="${id}-app.html" style="border:0;width:390px;height:1700px;display:block"></iframe></body>`);
    const out = join(process.cwd(), 'private', 'screens-live', `${id}.png`);
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${join(dir, 'profile')}`,
      '--window-size=600,1700', '--virtual-time-budget=4000', '--blink-settings=preferredColorScheme=1', `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 60000 });
    console.log(`private/screens-live/${id}.png`);
  }
}
