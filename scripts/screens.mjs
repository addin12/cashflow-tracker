// Screenshots of every screen at phone and PC size, with made-up demo data, in headless Edge.
//   node scripts/screens.mjs [--only=phone-review,pc-dashboard]   -> private/screens/*.png
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';
import { INIT_PLACEHOLDER } from './ui-build.mjs';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');

// ---- demo data (invented)
const expense = ['Food & Beverages', 'Belanja Harian', 'Belanja Online', 'Transportasi & Bensin', 'Langganan Digital', 'Nongkrong & Hiburan', 'Barber', 'Biaya Admin', 'Pengeluaran Lainnya'];
const income = ['Gaji', 'Cashback & Refund', 'Pemasukan Lainnya'];
const merchants = [
  ['KOPI KENANGAN', 'Food & Beverages', 28000], ['INDOMARET', 'Belanja Harian', 76500], ['TOKOPEDIA', 'Belanja Online', 249000], ['PERTAMINA', 'Transportasi & Bensin', 150000],
  ['SPOTIFY', 'Langganan Digital', 54990], ['CGV', 'Nongkrong & Hiburan', 100000], ['WARUNG SEDERHANA', 'Food & Beverages', 35000], ['BARBERSHOP KAPTEN', 'Barber', 65000],
  ['BIAYA ADMIN', 'Biaya Admin', 15000], ['GRAB', 'Transportasi & Bensin', 42000], ['HOKBEN', 'Food & Beverages', 89000], ['SUPERINDO', 'Belanja Harian', 187300],
];
const tx = [];
let n = 0;
const add = (r) => tx.push({ id: `d${++n}`, owner: 'Demo', updated_by: 'sync', gmail_id: `g${n}`, details: '', rule_id: 'r1', status: 'approved', time: '12:00:00', ...r });
for (const month of ['2026-09', '2026-10']) {
  add({ date: `${month}-01`, stream: 'Bank A', direction: 'in', amount: 9500000, category: 'Gaji', description: 'GAJI BULANAN', gmail_id: '', updated_by: 'Demo', rule_id: '' });
  const days = month === '2026-09' ? 30 : 5;
  for (let d = 1; d <= days; d += 1) {
    const [name, cat, amt] = merchants[(d * 7 + month.length) % merchants.length];
    add({ date: `${month}-${String(d).padStart(2, '0')}`, time: `${String(8 + (d % 12)).padStart(2, '0')}:${String((d * 13) % 60).padStart(2, '0')}:00`, stream: d % 3 ? 'Bank A' : 'E-Wallet', direction: 'out', amount: amt + d * 500, category: cat, description: name, details: d % 2 ? 'QRIS' : '' });
  }
}
add({ date: '2026-09-15', stream: 'Bank A', direction: 'in', amount: 125000, category: 'Cashback & Refund', description: 'REFUND TOKOPEDIA' });
add({ date: '2026-10-06', time: '09:12:00', stream: 'Bank A', direction: 'out', amount: 45000, category: '', description: 'BAKSO PAK DE', details: 'QRIS', status: 'pending', rule_id: '' });
add({ date: '2026-10-06', time: '08:01:00', stream: '', direction: 'out', amount: 1250000, category: '', description: 'TRANSFER KE ANDI', details: 'BI-FAST', status: 'pending', rule_id: '' });
add({ date: '2026-10-05', time: '19:40:00', stream: 'E-Wallet', direction: 'out', amount: 23000, category: '', description: 'BAKSO PAK DE', status: 'pending', rule_id: '' });
const t = {
  [TABS.transactions]: tx,
  [TABS.accounts]: [
    { stream: 'Bank A', type: 'Spending', owner: 'Demo', institution: 'Bank A', match_hint: '1234', opening_balance: 4200000 },
    { stream: 'E-Wallet', type: 'Spending', owner: 'Demo', institution: '', match_hint: 'wallet', opening_balance: 350000 },
    { stream: 'Cash', type: 'Spending', owner: 'Demo', institution: '', match_hint: 'manual', opening_balance: 200000 },
    { stream: 'Tabungan', type: 'Saving', owner: 'Demo', institution: 'Bank B', match_hint: 'Kantong', opening_balance: 15000000 },
  ],
  [TABS.rules]: [{ id: 'r1', field: 'description', pattern: 'KOPI|COFFEE|WARUNG', category: 'Food & Beverages', auto_approve: true, hits: 14 }, { id: 'r2', field: 'description', pattern: 'BARBER', category: 'Barber', auto_approve: true, hits: 2 }],
  [TABS.connections]: [{ gmail: 'demo@example.com', last_sync: '2026-10-06T02:50:00.000Z', last_status: 'live ok: +3 rows, 0 errors' }],
  [TABS.inboxLog]: [{ gmail_id: 'g99', subject: 'Pembayaran Berhasil', from: 'bank', status: 'error', reason: 'no amount found' }],
  [TABS.budgets]: [{ category: 'Food & Beverages', monthly_budget: 1500000 }, { category: 'Belanja Online', monthly_budget: 200000 }, { category: 'Barber', monthly_budget: 100000 }],
  [TABS.goals]: [{ stream: 'Tabungan', name: 'Dana Darurat', target: 25000000, target_date: '2027-06-30' }, { stream: 'Bank A', name: 'Liburan', target: 5000000, target_date: '' }],
};
const cfg = { owner_name: 'Demo', start_date: '2026-09-01', payday_day: 20, language: '', salary_stream: 'Bank A', summary_period: process.argv.includes('--by-payday') ? 'payday' : 'month', cat_transfer: 'trf ke bank lain', last_selftest: 'PASS 2026-10-05', owner_bank_names: 'DEMO USER' };
const slots = buildCategorySlots({ income, expense });
const store = {
  read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append() {}, update() {}, remove() {}, replace() {},
  config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {},
};
const api = createApi(store, { now: () => new Date(2026, 9, 6, 10, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
const answers = { init: api.init(), list: api.list({ limit: 1e6 }), settings: api.settings(), 'dashboard:2026-09': api.dashboard({ month: '2026-09' }) };

// ---- shots
const built = readFileSync('dist/index.html', 'utf8');
const sizes = { phone: [390, 1500], pc: [1440, Number((process.argv.find((a) => a.startsWith('--pc-height=')) || '=1000').split('=')[1])] };
const shots = [
  ['review'], ['dashboard'], ['transactions'], ['add'], ['settings'],
  ['editor', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ document.querySelector('.trow').click(); }, 300);"],
  ['invalid', "document.querySelector('.txcard [data-action=approve]').click();"],
  ['split', "document.querySelector('.nav [data-tab=transactions]').click(); setTimeout(function(){ var r = [].slice.call(document.querySelectorAll('.trow')).filter(function(x){ return /TOKOPEDIA/.test(x.textContent); })[0]; r.click(); setTimeout(function(){ document.querySelector('[data-action=splitopen]').click(); var rows = document.querySelectorAll('.split-row'); rows[0].querySelector('[data-s=amount]').value = '150000'; rows[1].querySelector('[data-s=amount]').value = '50000'; rows[1].querySelector('[data-s=amount]').dispatchEvent(new Event('input', { bubbles: true })); }, 200); }, 300);"],
  ['trend', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function(){ document.querySelector('[data-action=drill][data-category]').click(); }, 300);"],
  ['rules', "document.querySelector('.nav [data-tab=settings]').click(); setTimeout(function(){ document.querySelector('[data-section=rules]').click(); }, 300);"],
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
