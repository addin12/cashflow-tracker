// A ready-made copy of the web app's first-screen data ("init"), kept in Apps Script's cache.
// The sync refreshes it when it adds rows (and every 30 minutes) and every fresh `init` call updates it, so doGet can
// put it straight into the page: the app shows data without waiting on the spreadsheet.
/* global CacheService */

import { createApi } from '../core/api.js';
import { sheetStore } from './sheetstore.js';

const KEY = 'INIT_JSON';
const keyOf = (name) => `${KEY}:${name || ''}`; // each person's first screen is their own (their streak, their salary card)
const MAX_CHARS = 95000; // CacheService values are limited to 100 KB
const SIX_HOURS = 21600;

export function storeInit(json, name) {
  try {
    if (json && json.length < MAX_CHARS) CacheService.getScriptCache().put(keyOf(name), json, SIX_HOURS);
  } catch (e) { /* the cache is an optimisation only */ }
}

export function cachedInit(name) {
  try { return CacheService.getScriptCache().get(keyOf(name)); } catch (e) { return null; }
}

/** Recompute and cache the first-screen data (called by the sync). */
export function refreshInit(ss, who) {
  const api = createApi(sheetStore(ss), { now: () => new Date(), sync: () => null, sheetUrl: ss.getUrl(), meName: who.name, isOwner: who.owner, myEmail: who.email });
  storeInit(JSON.stringify(api.init()), who.name);
}
