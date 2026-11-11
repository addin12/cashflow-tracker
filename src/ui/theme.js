// Light and dark: follows the system, with a manual toggle.

import { toast } from './render.js';
import { $, T } from './state.js';

// Light, dark, or the device's own setting; kept in this browser (each device can differ).
const THEME_KEY = 'cashflow.theme.v1';

export function readTheme() {
  try { return window.localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
}

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Dark from 18:00 to 06:00 when the theme is "by time of day". */
const nightNow = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };

/** Called every minute: a page left open flips at dusk and dawn. */
export function refreshTimeTheme() { if (readTheme() === 'time') applyTheme('time'); }

export function applyTheme(mode) {
  const m = mode === 'light' || mode === 'dark' || mode === 'time' ? mode : 'auto';
  const shown = m === 'time' ? (nightNow() ? 'dark' : 'light') : m;
  if (shown === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', shown);
  try { window.localStorage.setItem(THEME_KEY, m); } catch (e) { /* storage unavailable */ }
  const dark = isDark();
  const btn = $('#themeBtn');
  if (btn) { btn.setAttribute('aria-label', dark ? T.themeToLight : T.themeToDark); btn.title = dark ? T.themeToLight : T.themeToDark; }
  const meta = $('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', dark ? '#000000' : '#f5f5f7');
}

export function toggleTheme() {
  applyTheme(isDark() ? 'light' : 'dark');
  toast(isDark() ? T.themeNowDark : T.themeNowLight);
}
