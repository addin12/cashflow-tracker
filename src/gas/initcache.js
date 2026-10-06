// A ready-made copy of the web app's first-screen data ("init"), kept in Apps Script's cache.
// The sync refreshes it every 10 minutes and every fresh `init` call updates it, so doGet can
// put it straight into the page: the app shows data without waiting on the spreadsheet.
/* global CacheService */

import { createApi } from '../core/api.js';
import { sheetStore } from './sheetstore.js';

const KEY = 'INIT_JSON';
const MAX_CHARS = 95000; // CacheService values are limited to 100 KB
const SIX_HOURS = 21600;

export function storeInit(json) {
  try {
    if (json && json.length < MAX_CHARS) CacheService.getScriptCache().put(KEY, json, SIX_HOURS);
  } catch (e) { /* the cache is an optimisation only */ }
}

export function cachedInit() {
  try { return CacheService.getScriptCache().get(KEY); } catch (e) { return null; }
}

/** Recompute and cache the first-screen data (called by the sync). */
export function refreshInit(ss) {
  const api = createApi(sheetStore(ss), { now: () => new Date(), sync: () => null, sheetUrl: ss.getUrl() });
  storeInit(JSON.stringify(api.init()));
}
