// The last startup data, kept in this browser so the app can paint instantly next time, then replaced by fresh data from the server.

// The last startup data is kept in this browser so the app can paint instantly next time,
// then it is replaced by fresh data from the server.
const CACHE_KEY = 'cashflow.init.v1';

export const FRESH_MS = 10 * 60000;

export const TIMING_KEY = 'cashflow.lastLoad.v1';

export function readCache() {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; }
}

export function writeCache(data) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}
