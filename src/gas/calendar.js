// The "Cashflow" Google Calendar (Settings → Email & pengingat, off by default): bills, subscriptions,
// card due dates, yearly renewals and payday for the next 45 days, as all-day events with a reminder
// at 09:00 the day before. Rebuilt every morning and when switched on. Only events this app made
// (marked in their description) are changed or removed.
/* global CalendarApp */

import { createApi } from '../core/api.js';
import { TABS } from '../core/schema.js';
import { upcomingBills } from '../core/wealth.js';
import { nextPayday } from '../core/payday.js';
import { sheetStore } from './sheetstore.js';
import { configValue, setConfigValue } from './setup.js';
import { whoAmI, roleKey } from './members.js';

const MARK = '[cashflow]';
const DAYS = 45;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rp = (n) => `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`;

/** The events the calendar should hold: key "YYYY-MM-DD|title". */
export function calendarEvents({ plans, recurringItems, cards, payday, today, lang = 'id', claims = [], warranties = [] }) {
  const out = new Map();
  for (const b of upcomingBills(plans, recurringItems, today, DAYS, cards)) out.set(`${b.date}|${b.name} · ${rp(b.amount)}`, true);
  for (const c of claims) if (c.daysLeft >= 0 && c.daysLeft <= DAYS) out.set(`${c.due}|${lang === 'en' ? 'Claim deadline' : 'Batas klaim'} · ${c.description} ${rp(c.amount)}`, true);
  for (const w of warranties) if (w.daysLeft <= DAYS) out.set(`${w.date}|${lang === 'en' ? 'Warranty ends' : 'Garansi habis'} · ${w.name}`, true);
  let p = nextPayday(today, payday);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DAYS);
  for (let i = 0; i < 2 && p <= end; i += 1) {
    out.set(`${iso(p)}|💼 ${lang === 'en' ? 'Payday' : 'Gajian'}`, true);
    p = nextPayday(p, payday);
  }
  return [...out.keys()];
}

export function syncCalendar(ss, today = new Date()) {
  const key = (base) => roleKey(ss, base); // the owner's setting, or the partner's own
  if (String(configValue(ss, key('calendar_sync')) || 'off') !== 'on') return { skipped: 'off' };
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const id = String(configValue(ss, key('calendar_id')) || '');
    let cal = id ? CalendarApp.getCalendarById(id) : null;
    if (!cal) {
      cal = CalendarApp.createCalendar('Cashflow', { summary: 'Tagihan, langganan dan gajian dari aplikasi Cashflow' });
      setConfigValue(ss, key('calendar_id'), cal.getId());
    }
    const store = sheetStore(ss);
    const w = whoAmI(ss);
    const d = createApi(store, { now: () => today, meName: w.name, isOwner: w.owner, myEmail: w.email }).dashboard({});
    const want = new Set(calendarEvents({
      plans: store.read(TABS.plans), recurringItems: d.recurring.items, cards: d.cards || [],
      payday: Number(configValue(ss, key('payday_day'))) || Number(configValue(ss, 'payday_day')) || 28, today, lang: String(configValue(ss, 'language') || 'id'), claims: d.claims || [], warranties: d.warranties || [],
    }));
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DAYS + 2);
    let removed = 0;
    const have = new Set();
    for (const ev of cal.getEvents(from, to)) {
      if (!String(ev.getDescription() || '').includes(MARK)) continue;
      const key = `${iso(ev.getAllDayStartDate())}|${ev.getTitle()}`;
      if (want.has(key) && !have.has(key)) have.add(key);
      else { ev.deleteEvent(); removed += 1; }
    }
    let added = 0;
    for (const key of want) {
      if (have.has(key)) continue;
      const [date, title] = [key.slice(0, 10), key.slice(11)];
      const ev = cal.createAllDayEvent(title, new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)), { description: `${MARK} Cashflow` });
      ev.removeAllReminders();
      ev.addPopupReminder(15 * 60); // all-day events start at 00:00: 15 hours before is 09:00 the day before
      added += 1;
    }
    setConfigValue(ss, key('calendar_status'), `${stamp} ok: ${want.size} events (+${added} −${removed})`);
    return { events: want.size, added, removed };
  } catch (e) {
    setConfigValue(ss, key('calendar_status'), `${stamp} ERROR: ${e.message}`);
    throw e;
  }
}
