// Switching the language of the whole page.

import { STRINGS, pickLanguage } from './i18n.js';
import { updateNav } from './render.js';
import { $, $$, T, setLanguage, state } from './state.js';
import { applyTheme, readTheme } from './theme.js';

// The language chosen on THIS device (the button in the app bar, or Settings) wins over the household's setting.
const LANG_KEY = 'cashflow.lang.v1';
const readChoice = () => { try { return window.localStorage.getItem(LANG_KEY) || ''; } catch (e) { return ''; } };

/** Remembers a language for this device ('id' or 'en'; anything else clears the choice) and applies it. */
export function chooseLanguage(lang) {
  try { if (lang === 'id' || lang === 'en') window.localStorage.setItem(LANG_KEY, lang); else window.localStorage.removeItem(LANG_KEY); } catch (e) { /* this visit only */ }
  applyLanguage(state.boot ? state.boot.language : lang);
}

export function applyLanguage(configured) {
  const lang = pickLanguage(readChoice() || configured);
  setLanguage(lang);
  if (state.boot) state.boot.lang = lang;
  document.documentElement.lang = lang;
  $$('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  const btn = $('#langBtn');
  if (btn) { btn.textContent = lang.toUpperCase(); const name = `${lang.toUpperCase()} · ${T.langSwitch}`; btn.setAttribute('aria-label', name); btn.title = name; }
  updateNav();
  applyTheme(readTheme());
}
