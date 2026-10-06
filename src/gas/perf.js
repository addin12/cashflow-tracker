// Startup timings of the web app, so slowness can be measured instead of guessed.
// The web app only appends to a small list in script properties (cheap); the 10-minute sync
// moves the list into the "Perf Log" tab. Numbers only, no personal data.
/* global PropertiesService */

const KEY = 'PERF';
const MAX = 50;
export const PERF_TAB = 'Perf Log';
export const PERF_HEADERS = ['at', 'open_ms', 'work_ms', 'client_total_ms', 'client_cached_ms', 'client_from_cache'];

export function recordStartup(entry) {
  try {
    const props = PropertiesService.getScriptProperties();
    const list = JSON.parse(props.getProperty(KEY) || '[]');
    list.push({ at: new Date().toISOString(), ...entry });
    props.setProperty(KEY, JSON.stringify(list.slice(-MAX)));
  } catch (e) { /* timing must never break the app */ }
}

/** Called by the sync: moves recorded timings into the Perf Log tab. */
export function flushStartupTimings(ss) {
  const props = PropertiesService.getScriptProperties();
  const list = JSON.parse(props.getProperty(KEY) || '[]');
  if (!list.length) return 0;
  let sh = ss.getSheetByName(PERF_TAB);
  if (!sh) {
    sh = ss.insertSheet(PERF_TAB);
    sh.getRange(1, 1, 1, PERF_HEADERS.length).setValues([PERF_HEADERS]).setFontWeight('bold');
  }
  const rows = list.map((e) => PERF_HEADERS.map((h) => (h === 'at' ? new Date(e.at) : e[h] ?? '')));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, PERF_HEADERS.length).setValues(rows);
  props.deleteProperty(KEY);
  return rows.length;
}
