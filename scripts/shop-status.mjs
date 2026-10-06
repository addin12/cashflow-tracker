// Dev helper: which bank rows carry a shop receipt, and what the Inbox Log says about receipts.
//   node scripts/shop-status.mjs [--count]   (--count prints only the number of named rows)
import { execFileSync } from 'node:child_process';

const read = (tab) => JSON.parse(execFileSync(process.execPath, ['scripts/read-tab.mjs', tab, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const rows = read('Transactions');
const named = rows.filter((r) => / order( |$)/.test(String(r.details)) && !String(r.id).endsWith('_fee'));
if (process.argv.includes('--count')) {
  console.log(named.length);
} else {
  for (const r of named) console.log([String(r.date).slice(0, 10), r.amount, r.description, r.category || '(pending)', r.status, String(r.details).slice(0, 110)].join(' | '));
  const parsers = new Set(['apple', 'tokopedia', 'shopee', 'xendit', 'shop-order', 'myminifactory', 'optik-melawai']);
  const latest = new Map();
  for (const l of read('Inbox Log')) if (parsers.has(l.parser)) latest.set(l.gmail_id, l);
  console.log('\nreceipt log (latest per email):');
  for (const l of latest.values()) console.log(`  ${l.status.padEnd(8)} ${l.parser.padEnd(14)} ${String(l.subject).slice(0, 50).padEnd(50)} ${l.reason}`);
}
