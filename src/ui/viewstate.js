// What you chose last time on this device, so the app opens the way you left it: whose numbers (Kita / Aku / the other person), Ikhtisar or Laporan,
// the report's Bulanan / Tahunan switch, and Transaksi's period and kind chips. Kept in the browser. The month always opens on the current one.
import { state } from './state.js';

const KEY = 'cashflow.view.v1';
const PRESETS = ['period', '30', '90', 'year', 'all'];
const KINDS = ['all', 'out', 'in', 'transfer', 'adjust'];

const read = () => {
  try { const v = JSON.parse(window.localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
};

/** Remembers the current choices; `extra` adds Transaksi's { preset, kind }. */
export function saveView(extra = {}) {
  const me = (state.boot || {}).me;
  const next = {
    ...read(),
    who: !state.who ? 'all' : state.who === me ? 'me' : 'other', // not a name: "Aku" stays "Aku" whoever signs in on this device
    view: state.dashView === 'report' ? 'report' : 'overview',
    yearly: !!state.reportYearly,
    ...extra,
  };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* this visit only */ }
}

/** Puts the remembered choices back (once, when the first data arrives and we know who is who). */
export function restoreView() {
  if (state.viewRestored) return;
  state.viewRestored = true;
  const v = read();
  const boot = state.boot || {};
  const members = boot.members || [];
  if (members.length > 1) {
    const other = members.find((m) => m !== boot.me) || '';
    state.who = v.who === 'me' ? boot.me : v.who === 'other' ? other : '';
    state.filters.owner = state.who;
  }
  if (v.view === 'report') { state.dashView = 'report'; state.reportYearly = !!v.yearly; }
  state.txStart = { preset: PRESETS.includes(v.preset) ? v.preset : '', kind: KINDS.includes(v.kind) ? v.kind : '' };
}
