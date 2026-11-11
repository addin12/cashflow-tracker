// The "Cashflow" Google Calendar (Settings → Email & pengingat, off by default): bills, subscriptions,
// card due dates, yearly renewals and payday for the next 45 days, as all-day events with a reminder
// at 09:00 the day before. Rebuilt every morning and when switched on. Only events this app made
// (marked in their description) are changed or removed.
/* global CalendarApp */

import { createApi } from '../core/api.js';
import { TABS } from '../core/schema.js';
import { calendarEvents, CAL_DAYS } from '../core/calevents.js';
import { sheetStore } from './sheetstore.js';
import { configValue, setConfigValue } from './setup.js';
import { whoAmI, roleKey, activeEmail } from './members.js';

const MARK = '[cashflow]';
export { calendarEvents };
const DAYS = CAL_DAYS;
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const NAME = 'Cashflow';
const SUMMARY = 'Tagihan, langganan dan gajian dari aplikasi Cashflow';

/** Every calendar of this person named Cashflow: the app's own, or one a person made by hand with the same name. */
const named = () => CalendarApp.getOwnedCalendarsByName(NAME);
const isMarked = (ev) => String(ev.getDescription() || '').includes(MARK);

/**
 * Earlier versions could leave several "Cashflow" calendars behind, each with its own copy of every bill and payday.
 * A copy is the app's when it has the app's description, or when it holds events (a year back to a year ahead) and
 * every one of them is marked as the app's. Everything but the one in use goes; anything a person added by hand,
 * in a calendar with the same name, keeps that calendar.
 */
export function removeStrayCalendars(keepId, today = new Date()) {
  const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const to = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
  let removed = 0;
  for (const c of named()) {
    if (c.getId() === keepId) continue;
    const events = c.getEvents(from, to);
    const ours = c.getDescription() === SUMMARY || events.length > 0;
    if (ours && events.every(isMarked)) { c.deleteCalendar(); removed += 1; }
  }
  return removed;
}

/** After an upgrade: fill the calendar when it is on; when it is off, take away the copies earlier versions left. */
export function tidyCalendar(ss) {
  if (String(configValue(ss, roleKey(ss, 'calendar_sync')) || 'off') === 'on') return syncCalendar(ss);
  return { strays: removeStrayCalendars('') };
}

export function syncCalendar(ss, today = new Date()) {
  const key = (base) => roleKey(ss, base); // the owner's setting, or the partner's own
  if (String(configValue(ss, key('calendar_sync')) || 'off') !== 'on') return { skipped: 'off' };
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const id = String(configValue(ss, key('calendar_id')) || '');
    let cal = id ? CalendarApp.getCalendarById(id) : null;
    const idFound = Boolean(cal);
    if (!cal) { // the saved one is gone or was never saved: take one the app already made before making another
      cal = named().find((c) => c.getDescription() === SUMMARY) || CalendarApp.createCalendar(NAME, { summary: SUMMARY });
      setConfigValue(ss, key('calendar_id'), cal.getId());
    }
    const strays = removeStrayCalendars(cal.getId(), today);
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
    let seen = 0;
    const have = new Set();
    for (const ev of cal.getEvents(from, to)) {
      if (!isMarked(ev)) continue;
      seen += 1;
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
    setConfigValue(ss, key('calendar_status'), `${stamp} ok: ${want.size} events (+${added} −${removed})${strays ? `, ${strays} old calendar(s) removed` : ''} [named ${named().length}, saved calendar ${idFound ? 'found' : 'missing'}, ${seen} marked events seen, made under ${activeEmail()}]`);
    return { events: want.size, added, removed, strays };
  } catch (e) {
    setConfigValue(ss, key('calendar_status'), `${stamp} ERROR: ${e.message}`);
    throw e;
  }
}
