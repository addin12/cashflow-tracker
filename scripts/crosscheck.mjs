// Dev check on the live sheet: the app's month totals (src/core/app.js over Transactions) must
// equal the template's CASHFLOW Income/Expense rows for every month with data.
//   node scripts/crosscheck.mjs
import { execFileSync } from 'node:child_process';
import { summarizeMonth, categoryLists } from '../src/core/app.js';

const read = (tab, range) => execFileSync(process.execPath, ['scripts/read-tab.mjs', tab, ...(range ? [range] : ['--json'])], { encoding: 'utf8', maxBuffer: 64 << 20 });

const tx = JSON.parse(read('Transactions')).map((r) => ({ ...r, date: String(r.date).slice(0, 10), amount: Number(r.amount) }));
const grid = read('CASHFLOW', 'K1:W40').trim().split('\n').map((l) => l.replace(/^\d+:\s*/, '').split(' | '));
const col = (r, c) => grid[r - 1][c];
const slots = { income: [], expense: [] };
for (let r = 5; r <= 10; r += 1) slots.income.push(col(r, 0));
for (let r = 11; r <= 38; r += 1) slots.expense.push(col(r, 0));
const cats = categoryLists(slots);

const months = [...new Set(tx.filter((r) => r.status === 'approved').map((r) => r.date.slice(0, 7)))].sort();
let bad = 0;
for (const m of months) {
  const app = summarizeMonth(tx, cats, m);
  const c = Number(m.slice(5, 7)); // column index 1..12 in K..W
  const sheet = { income: Number(col(3, c)) || 0, expense: Number(col(4, c)) || 0 };
  const ok = Math.abs(app.income - sheet.income) < 0.01 && Math.abs(app.expense - sheet.expense) < 0.01;
  if (!ok) bad += 1;
  console.log(`${m}  app income ${app.income} / sheet ${sheet.income}   app expense ${app.expense} / sheet ${sheet.expense}   ${ok ? 'OK' : 'MISMATCH'}`);
}
console.log(`${tx.length} rows (${tx.filter((r) => r.status === 'approved').length} approved, ${tx.filter((r) => r.status === 'pending').length} pending); ${bad ? `${bad} month(s) differ` : 'all months match'}`);
process.exit(bad ? 1 : 0);
