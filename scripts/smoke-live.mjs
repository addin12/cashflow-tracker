// Dev check: runs the app's API on a READ-ONLY copy of the real spreadsheet (exported with the clasp login, kept
// in memory, nothing is written anywhere) for both people, and reports crashes, slow calls and odd numbers.
//   node scripts/smoke-live.mjs
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { loadLive } from './live-store.mjs';

const { store, tables, cfg, slots, people } = await loadLive();

let problems = 0;
const money = (n) => (typeof n === 'number' ? Math.round(n).toLocaleString('id-ID') : n);
for (const p of people) {
  const api = createApi(store, { now: () => new Date(), isOwner: p.isOwner, meName: p.who, myEmail: p.emails.split(',')[0].trim().toLowerCase() });
  const calls = [
    ['bootstrap', () => api.bootstrap()], ['review', () => api.review()], ['dashboard', () => api.dashboard({})],
    ['dashboard Kita', () => api.dashboard({ who: '' })], ['dashboard mine', () => api.dashboard({ who: p.who })],
    ['list', () => api.list({ limit: 100000 })], ['settings', () => api.settings()], ['yearly', () => api.yearly({ year: new Date().getFullYear() })],
    ['yearly mine', () => api.yearly({ year: new Date().getFullYear(), owner: p.who })],
  ];
  console.log(`\n== ${p.who} (${p.isOwner ? 'owner' : 'partner'})`);
  for (const [name, fn] of calls) {
    const t = Date.now();
    try {
      const out = fn();
      const ms = Date.now() - t;
      const flag = ms > 400 ? '  SLOW' : '';
      if (flag) problems += 1;
      let note = '';
      if (name === 'bootstrap') note = `setup ${JSON.stringify(out.setup)} · notConnected ${JSON.stringify(out.notConnected)} · newAccounts ${JSON.stringify(out.newAccounts)}`;
      if (name === 'review') note = `pending ${out.pending.length} · unreadable ${out.errors.length} · ruleable ${out.ruleable}`;
      if (name === 'dashboard') note = `spent ${money(out.summary && out.summary.expense)} · accounts ${(out.balances || []).filter((b) => b.owner === p.who).map((b) => `${b.stream} ${money(b.balance)}`).join(', ')}`;
      console.log(`${name.padEnd(16)} ${String(ms).padStart(4)} ms${flag}  ${note}`);
    } catch (e) {
      problems += 1;
      console.log(`${name.padEnd(16)} CRASH: ${e.message}\n${String(e.stack).split('\n').slice(1, 3).join('\n')}`);
    }
  }
}
if (process.argv.includes('--audit')) {
  const rows = tables[TABS.transactions];
  const accts = tables[TABS.accounts];
  const streams = new Map(accts.map((a) => [a.stream, a]));
  const cats = new Set([...slots.income, ...slots.expense, 'Penyesuaian', String(cfg.cat_transfer || ''), String(cfg.cat_fee || ''), String(cfg.cat_dividend || '')].filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  const report = [];
  const check = (title, list) => { if (list.length) report.push(`${title}: ${list.length}\n    ${list.slice(0, 4).map((r) => `${r.date} ${r.amount} ${r.description || ''} [${r.stream || '-'}/${r.owner || '-'}]`).join('\n    ')}`); };
  check('rows on an account that does not exist', rows.filter((r) => r.stream && !streams.has(r.stream)));
  check('rows whose owner is not the account owner', rows.filter((r) => streams.has(r.stream) && streams.get(r.stream).owner && r.owner && r.owner !== streams.get(r.stream).owner));
  check('approved rows with no category', rows.filter((r) => r.status === 'approved' && !r.category));
  check('rows with a category that is not in the list', rows.filter((r) => r.category && !cats.has(r.category)));
  check('rows dated in the future', rows.filter((r) => String(r.date) > today));
  check('rows with a bad amount', rows.filter((r) => !(Number(r.amount) > 0)));
  const dup = new Map();
  rows.filter((r) => r.status !== 'ignored' && r.source === 'email').forEach((r) => { const k = [r.date, r.time, r.amount, r.description, r.stream, r.direction].join('|'); dup.set(k, [...(dup.get(k) || []), r]); });
  check('possible duplicates (same time, amount, place, account)', [...dup.values()].filter((g) => g.length > 1).map((g) => g[0]));
  const legs = new Map();
  rows.filter((r) => r.transfer_id).forEach((r) => legs.set(r.transfer_id, [...(legs.get(r.transfer_id) || []), r]));
  check('transfers without exactly two legs', [...legs.values()].filter((g) => g.length !== 2).map((g) => g[0]));
  const hints = new Map();
  accts.forEach((a) => String(a.match_hint || '').split(',').map((h) => h.trim()).filter(Boolean).forEach((h) => hints.set(h, [...(hints.get(h) || []), a.stream])));
  const clash = [...hints].filter(([, s]) => s.length > 1);
  if (clash.length) report.push(`the same account hint on two accounts: ${clash.map(([h, s]) => `${h} -> ${s.join(' & ')}`).join('; ')}`);
  console.log(`\n== data audit (${rows.length} transactions, ${accts.length} accounts)\n${report.length ? report.join('\n') : 'nothing odd found'}`);
}
console.log(problems ? `\n${problems} problem(s)` : '\nno crashes, nothing slow');
