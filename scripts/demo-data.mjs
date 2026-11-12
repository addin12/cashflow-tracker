// Invented demo data and the answers the app gives for it, shared by the screenshot and audit scripts
// (screens.mjs, a11y.mjs, antislop-browser.mjs). Nothing here is real.
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

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
export const answers = { init: api.init(), list: api.list({ limit: 1e6 }), settings: api.settings(), ask: api.ask({ text: 'tinjau minggu ini' }), 'dashboard:2026-09': api.dashboard({ month: '2026-09' }), yearly: api.yearly({ year: 2026 }) };
