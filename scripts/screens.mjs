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
    add({ date: `${month}-${String(d).padStart(2, '0')}`, time: `${String(8 + (d % 12)).padStart(2, '0')}:${String((d * 13) % 60).padStart(2, '0')}:00`, stream: d % 3 ? 'Bank A' : 'E-Wallet', direction: 'out', amount: amt + d * 500, category: cat, description: name, details: d % 2 ? 'QRIS' : (d % 5 === 0 ? '#weekend' : '') });
  }
}
add({ date: '2026-09-15', stream: 'Bank A', direction: 'in', amount: 125000, category: 'Cashback & Refund', description: 'REFUND TOKOPEDIA' });
for (const d of ['2026-10-02', '2026-10-04', '2026-10-05']) add({ date: d, stream: 'Cash', direction: 'out', amount: 15000, category: 'Food & Beverages', description: 'Bakso', source: 'manual', gmail_id: '', rule_id: '', updated_by: 'Demo' });
add({ date: '2026-10-03', stream: 'E-Wallet', direction: 'out', amount: 350000, category: 'Nongkrong & Hiburan', description: 'Villa Puncak', details: '#puncak', updated_by: 'sync' });
add({ date: '2026-10-02', stream: 'Bank A', direction: 'out', amount: 180000, category: 'Pengeluaran Lainnya', description: 'APOTEK K24', details: '' });
const claimId = tx[tx.length - 1].id;
add({ date: '2026-10-04', stream: 'Rek Dewi', direction: 'out', amount: 120000, category: 'Belanja Harian', description: 'ALFAMART', owner: 'Dewi' });
add({ date: '2026-10-05', stream: 'Rek Dewi', direction: 'out', amount: 64000, category: '', description: 'TOKO BUAH SEGAR', owner: 'Dewi', status: 'pending', rule_id: '' });
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
    { stream: 'Rek Dewi', type: 'Spending', owner: 'Dewi', institution: 'Bank A', match_hint: '9876', opening_balance: 2500000 },
  ],
  [TABS.rules]: [{ id: 'r1', field: 'description', pattern: 'KOPI|COFFEE|WARUNG', category: 'Food & Beverages', auto_approve: true, hits: 14 }, { id: 'r2', field: 'description', pattern: 'BARBER', category: 'Barber', auto_approve: true, hits: 2 }],
  [TABS.connections]: [{ gmail: 'demo@example.com', last_sync: '2026-10-06T02:50:00.000Z', last_status: 'live ok: +3 rows, 0 errors' }],
  [TABS.inboxLog]: [{ gmail_id: 'g99', subject: 'Pembayaran Berhasil', from: 'bank', status: 'error', reason: 'no amount found' }],
  [TABS.budgets]: [{ category: 'Food & Beverages', monthly_budget: 1500000 }, { category: 'Belanja Online', monthly_budget: 200000 }, { category: 'Barber', monthly_budget: 100000 }],
  [TABS.goals]: [{ stream: 'Tabungan', name: 'Dana Darurat', target: 25000000, target_date: '2027-06-30' }, { stream: 'Bank A', name: 'Liburan', target: 5000000, target_date: '' }],
  [TABS.owed]: [{ id: 'o1', tx_id: 'd3', who: 'Andi', amount: 75000, note: 'Makan bareng', date: '2026-10-03', status: 'open' }, { id: 'o2', tx_id: 'd3', who: 'Rina', amount: 75000, note: 'Makan bareng', date: '2026-10-03', status: 'open' }],
  [TABS.plans]: [{ id: 'p1', name: 'Bayar kos', amount: 1500000, direction: 'out', stream: 'Cash', category: 'Pengeluaran Lainnya', day: 25, auto: false, last: '', active: true }],
  [TABS.assets]: [{ id: 'a1', name: 'Motor', kind: 'vehicle', qty: 1, unit_value: 15000000 }, { id: 'a9', name: 'Laptop', kind: 'goods', qty: 1, unit_value: 12000000, warranty: '2026-10-28' }, { id: 'a2', name: 'BBCA', kind: 'stock', qty: 500, unit_value: 9000, ticker: 'IDX:BBCA', price: 9450 }, { id: 'a3', name: 'Koleksi board game', kind: 'collectible', qty: 1, unit_value: 4000000, paid: 3200000 }],
};
const cfg = { owner_email: 'demo@example.com', partner_name: 'Dewi', partner_email: 'dewi@example.com', claims: JSON.stringify({ [claimId]: { s: 'open', due: '2026-10-09' } }), tag_budgets: '{"puncak":1000000}', closed_days: '2026-10-05,2026-10-04', owner_name: 'Demo', start_date: '2026-09-01', payday_day: 20, language: '', salary_stream: 'Bank A', summary_period: process.argv.includes('--by-payday') ? 'payday' : 'month', cat_transfer: 'trf ke bank lain', last_selftest: 'PASS 2026-10-05', owner_bank_names: 'DEMO USER' };
const slots = buildCategorySlots({ income, expense });
const store = {
  read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append() {}, update() {}, remove() {}, replace() {},
  config: (k) => cfg[k] ?? '', setConfig() {}, slots: () => slots, setSlots() {},
};
const api = createApi(store, { now: () => new Date(2026, 9, 6, 10, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
const answers = { init: api.init(), list: api.list({ limit: 1e6 }), settings: api.settings(), 'dashboard:2026-09': api.dashboard({ month: '2026-09' }), yearly: api.yearly({ year: 2026 }) };

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
