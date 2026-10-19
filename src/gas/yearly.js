// Reads bank emails and receipts a year back for yearly plans (core/yearly.js decides which).
// Runs once by itself (the daily trigger, when it never ran) and from Settings → Langganan.
// Nothing becomes a transaction; the plans found go to Config yearly_subs.

import { parseEmail, SENDERS } from '../core/parsers/index.js';
import { findYearly, yearlyQuery, mergeYearly } from '../core/yearly.js';
import { whoAmI, roleKey } from './members.js';
import { listMessageIds, getEmail } from './gmail.js';
import { configValue, setConfigValue } from './setup.js';

export function scanYearly(ss, { today = new Date(), max = 250 } = {}) {
  const after = Math.floor(new Date(today.getFullYear() - 1, today.getMonth() - 1, 1).getTime() / 1000);
  const ids = listMessageIds(yearlyQuery(SENDERS, after), max);
  const charges = [];
  const t0 = Date.now();
  let read = 0;
  for (const id of ids) {
    if (Date.now() - t0 > 240000) break; // well inside Apps Script's 6 minutes; the rest is read next time
    read += 1;
    let res;
    try { res = parseEmail(getEmail(id)); } catch (e) { continue; }
    if (res.status !== 'ok') continue;
    (res.events || []).filter((ev) => ev.direction === 'out')
      .forEach((ev) => charges.push({ date: ev.date, amount: ev.amount, description: ev.description, details: ev.details || '' }));
  }
  const found = findYearly(charges, { today });
  // Each person's Gmail finds its own plans; a scan replaces only the ones that person found before.
  let stored = [];
  try { stored = JSON.parse(String(configValue(ss, 'yearly_subs') || '[]')) || []; } catch (e) { stored = []; }
  const w = whoAmI(ss);
  setConfigValue(ss, 'yearly_subs', JSON.stringify(mergeYearly(stored, found, { by: w.name, firstPerson: String(configValue(ss, 'owner_name') || '') })));
  setConfigValue(ss, roleKey(ss, 'yearly_scan'), today.toISOString());
  return { read, charges: charges.length, found: found.length };
}
