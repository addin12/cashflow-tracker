// The sync planner: parsed emails + rows already in Transactions -> rows to add / update.
// Pure (no Google APIs), so every decision below is unit-tested.
//
// Decisions, in order, per event:
//  1. An email whose id is already in Transactions is skipped (re-runs are safe).
//  2. GoPay monthly summary -> one pending row for the GoPay spending not seen in other rows.
//  3. Counterparty is one of the owner's own accounts -> a transfer:
//     - both sides are the same stream (BCA pocket -> BCA)      -> nothing to record
//     - the other side is already in the sheet (its own email,
//       or the mirror leg of a transfer created earlier)          -> link to it, add no duplicate
//     - otherwise                                                -> two legs (Credit + Debit),
//                                                                   category "trf ke bank lain"
//  4. Anything else is income/expense, categorized by the first matching rule.
//  5. A fee becomes its own row (category for fees, e.g. "Biaya Admin").
// Rows go straight to the reports ("approved") when the stream is known and a rule (or the
// transfer/fee/dividend logic) is sure; otherwise they wait in Review ("pending").

import { resolveAccount, ownCounterparty } from './accounts.js';
import { matchRule } from './rules.js';

export const MATCH_WINDOW_MINUTES = 15;

function minutesOf(row) {
  const [y, m, d] = String(row.date).split('-').map(Number);
  const [hh = 0, mm = 0] = String(row.time || '').split(':').map(Number);
  return { day: Date.UTC(y, m - 1, d) / 60000, at: Date.UTC(y, m - 1, d, hh, mm) / 60000, hasTime: !!row.time };
}

/** Same money movement seen from the other side: same stream, direction, amount, and time. */
function closeInTime(a, b) {
  const x = minutesOf(a);
  const y = minutesOf(b);
  if (x.hasTime && y.hasTime) return Math.abs(x.at - y.at) <= MATCH_WINDOW_MINUTES;
  return x.day === y.day;
}

function sameMovement(row, leg) {
  return row.stream === leg.stream && row.direction === leg.direction
    && Math.abs(Number(row.amount) - Number(leg.amount)) < 0.005 && closeInTime(row, leg);
}

const monthOf = (date) => String(date).slice(0, 7);
const lastDay = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/**
 * @param {object} p
 * @param {{id, from, epochMs, gmail, result}[]} p.emails  parseEmail() results, any order
 * @param {object[]} p.existing  Transactions rows (objects keyed by header)
 * @param {object[]} p.accounts  Accounts rows
 * @param {object[]} p.rules     Rules rows (in order)
 * @param {{owner: string, ownerNames: string[], categories: {transfer, fee, dividend}}} p.config
 * @param {string} p.nowIso  timestamp written to updated_at
 */
export function planSync({ emails, existing, accounts, rules, config, nowIso }) {
  const add = [];
  const update = new Map(); // row id -> changes
  const log = [];
  const ruleHits = {};
  const pool = existing.map((r) => ({ ...r }));
  const seen = new Set(existing.map((r) => r.gmail_id).filter(Boolean));
  const cat = config.categories;

  const base = (email, ev, extra) => ({
    id: '', date: ev.date, time: ev.time || '', owner: config.owner, stream: '', direction: ev.direction,
    amount: ev.amount, category: '', description: ev.description || '', details: ev.details || '',
    source: 'email', sender: email.from, gmail: email.gmail || '', gmail_id: email.id, ref_no: ev.refNo || '',
    status: 'pending', transfer_id: '', rule_id: '', updated_by: 'sync', updated_at: nowIso, ...extra,
  });
  const added = new Set();
  const push = (row) => { add.push(row); pool.push(row); added.add(row.id); return row; };
  const change = (row, changes) => {
    Object.assign(row, changes); // rows added in this run are written with the change already in
    if (added.has(row.id)) return;
    update.set(row.id, { ...(update.get(row.id) || {}), ...changes, updated_by: 'sync', updated_at: nowIso });
  };

  const ordered = [...emails].sort((a, b) => a.epochMs - b.epochMs);
  for (const email of ordered) {
    const r = email.result;
    if (seen.has(email.id)) { log.push({ gmailId: email.id, status: 'duplicate', reason: 'already in Transactions', rows: 0 }); continue; }
    if (r.status !== 'ok') { log.push({ gmailId: email.id, status: r.status, reason: r.reason, parser: r.parser, rows: 0 }); continue; }
    seen.add(email.id);
    const before = add.length;
    const notes = [];

    r.events.forEach((ev, i) => {
      const id = `t_${email.id}${r.events.length > 1 ? `_${i}` : ''}`;
      const src = resolveAccount(ev.account, accounts);
      if (!src) notes.push(`account not recognised (${ev.account.institution}${ev.account.hint ? ` …${ev.account.hint}` : ''})`);

      if (ev.type === 'summary') {
        const stream = resolveAccount({ institution: 'GoPay' }, accounts);
        const month = monthOf(ev.date);
        const recorded = (dir) => pool.filter((x) => stream && x.stream === stream && x.direction === dir && monthOf(x.date) === month && x.source !== 'summary')
          .reduce((s, x) => s + Number(x.amount || 0), 0);
        const gaps = [['out', ev.amount - recorded('out'), 'Pengeluaran'], ['in', (ev.income || 0) - recorded('in'), 'Pemasukan']];
        for (const [dir, gap, label] of gaps) {
          if (gap > 0.004) {
            push(base(email, ev, {
              id: `${id}_${dir}`, date: lastDay(month), stream, direction: dir, amount: Math.round(gap * 100) / 100, source: 'summary',
              description: `${label} GoPay ${month} (ringkasan bulanan)`, details: 'Dari ringkasan bulanan GoPay: pilih kategori',
            }));
          }
        }
        return;
      }

      if (ev.type === 'dividend') {
        push(base(email, ev, { id, stream: src, category: cat.dividend, status: src ? 'approved' : 'pending' }));
        return;
      }

      // The other side of a transfer recorded earlier (its mirror leg is waiting): link, whatever
      // the counterparty text says. Catches emails whose sender name can't be read.
      const waiting = src && pool.find((x) => x.transfer_id && !x.gmail_id
        && sameMovement(x, { stream: src, direction: ev.direction, amount: ev.amount, date: ev.date, time: ev.time }));
      const own = ownCounterparty(ev, accounts, config.ownerNames);
      if (waiting) {
        change(waiting, { gmail_id: email.id, ref_no: ev.refNo || waiting.ref_no, sender: email.from, details: ev.details || waiting.details });
        notes.push('linked to an existing transfer');
      } else if (own.own && src && own.stream === src) {
        notes.push('internal move within one account');
      } else if (own.own && src && own.stream) {
        const thisLeg = base(email, ev, { id, stream: src, category: cat.transfer, status: 'approved' });
        const otherLeg = base(email, ev, {
          id: `${id}_m`, stream: own.stream, direction: ev.direction === 'out' ? 'in' : 'out', category: cat.transfer,
          status: 'approved', gmail_id: '', details: `Pasangan transfer (${own.why})`,
        });
        const mirror = pool.find((x) => x.transfer_id && !x.gmail_id && sameMovement(x, thisLeg));
        const otherEmail = !mirror && pool.find((x) => x.gmail_id && x.gmail_id !== email.id && !x.transfer_id && sameMovement(x, otherLeg));
        if (mirror) {
          change(mirror, { gmail_id: email.id, ref_no: thisLeg.ref_no || mirror.ref_no, sender: email.from, details: thisLeg.details || mirror.details });
          notes.push('linked to an existing transfer');
        } else if (otherEmail) {
          const tid = otherEmail.transfer_id || `x_${email.id}`;
          change(otherEmail, { category: cat.transfer, transfer_id: tid, status: 'approved', rule_id: '' });
          push({ ...thisLeg, transfer_id: tid });
        } else {
          const tid = `x_${email.id}`;
          push({ ...thisLeg, transfer_id: tid });
          push({ ...otherLeg, transfer_id: tid });
        }
      } else if (own.own) {
        push(base(email, ev, { id, stream: src, details: [ev.details, 'Ke/dari rekening sendiri yang belum terdaftar di Accounts'].filter(Boolean).join(' · ') }));
      } else {
        const row = base(email, ev, { id, stream: src });
        const rule = matchRule(row, rules);
        if (rule) {
          row.category = rule.category;
          row.rule_id = rule.id || '';
          if (rule.stream_override) row.stream = rule.stream_override;
          if (rule.autoApprove && row.stream) row.status = 'approved';
          if (rule.id) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;
        }
        push(row);
      }

      if (ev.fee > 0) {
        push(base(email, ev, {
          id: `${id}_fee`, stream: src, direction: 'out', amount: ev.fee, category: cat.fee, status: src ? 'approved' : 'pending',
          description: `Biaya: ${ev.description || ev.type}`, details: '',
        }));
      }
    });
    log.push({ gmailId: email.id, status: 'ok', parser: r.parser, rows: add.length - before, reason: notes.join('; ') });
  }

  return { add, update: [...update].map(([id, changes]) => ({ id, changes })), log, ruleHits };
}
