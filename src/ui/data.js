// The rows and review data kept in the browser, and how fresh data is taken in.

import { rp } from './format.js';
import { applyLanguage } from './language.js';
import { restoreView } from './viewstate.js';
import { toast, updateNav } from './render.js';
import { T, state } from './state.js';

export const remember = (rows) => rows.forEach((r) => state.rowsById.set(String(r.id), r));

export function setAll(rows) { state.all = rows; state.allStale = false; remember(rows); }

export function absorb(data) {
  // The page says who opened it (the cached first screen may have been made for the other person).
  state.boot = { ...data.boot, me: window.__ME__ || data.boot.me, lang: state.boot?.lang };
  state.dataAt = data.at; // when Google built this data: newer sync changes mean refresh
  restoreView(); // whose numbers, which view, which period: as they were left on this device (once)
  const incoming = data.incoming || [];
  if (state.incomingIds) {
    const fresh = incoming.filter((x) => !state.incomingIds.has(String(x.id)));
    if (fresh.length) toast(T.newRows(fresh.length, `${fresh[0].description} ${fresh[0].direction === 'in' ? '+' : '−'}${rp(fresh[0].amount)}`));
  }
  state.incomingIds = new Set([...(state.incomingIds || []), ...incoming.map((x) => String(x.id))]);
  applyLanguage(state.boot.language);
  if (!state.month) state.month = data.boot.currentMonth || data.boot.today.slice(0, 7);
  state.review = data.review;
  remember([...data.review.pending, ...data.review.recentAuto]);
  if (!state.who) state.dashByMonth[data.dashboard.month] = data.dashboard;
  updateNav();
}

/** Changes one row everywhere it is shown. */
export function patchRow(id, changes) {
  const key = String(id);
  const old = state.rowsById.get(key) || { id };
  const row = { ...old, ...changes };
  state.rowsById.set(key, row);
  if (state.all) state.all = state.all.map((r) => (String(r.id) === key ? row : r));
  if (state.review) {
    const pending = state.review.pending.filter((r) => String(r.id) !== key);
    if (row.status === 'pending') pending.push(row);
    state.review.pending = sortByDate(pending);
    state.review.recentAuto = state.review.recentAuto.map((r) => (String(r.id) === key ? row : r));
  }
  state.dashByMonth = {}; // totals change: fetched again when shown
  return row;
}

const sortByDate = (rows) => rows.sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
