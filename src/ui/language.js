// Switching the language of the whole page.

import { STRINGS, pickLanguage } from './i18n.js';
import { updateNav } from './render.js';
import { $$, T, setLanguage, state } from './state.js';
import { applyTheme, readTheme } from './theme.js';

export function applyLanguage(configured) {
  const lang = pickLanguage(configured, navigator.language);
  setLanguage(lang);
  if (state.boot) state.boot.lang = lang;
  document.documentElement.lang = lang;
  $$('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  updateNav();
  applyTheme(readTheme());
}
