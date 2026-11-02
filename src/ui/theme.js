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

export function applyTheme(mode) {
  const m = mode === 'light' || mode === 'dark' ? mode : 'auto';
  if (m === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', m);
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
