// A small, shared set of things every screen needs: the app state, the strings of the language in use, and the query helpers.

import { STRINGS } from './i18n.js';

let T = STRINGS.id;
/** The strings of the language in use; setLanguage changes it for every screen that imported T. */
export { T };
export function setLanguage(lang) { T = STRINGS[lang]; }

export const state = {
  boot: null, tab: 'review', month: '', review: null, dashByMonth: {}, all: null, allStale: true,
  filters: { q: '', month: null, stream: '', category: '', status: '', direction: '' },
  limit: 50, addKind: 'out', settings: null, rowsById: new Map(), picked: new Set(), yearly: null,
};

export const $ = (sel, el = document) => el.querySelector(sel);

export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// "Hide amounts" (the eye on the summary): kept in this browser, for looking at the app in public.
export const HIDE_KEY = 'cashflow.hide.v1';

// Starts as this browser remembered it.
state.hide = (() => { try { return window.localStorage.getItem(HIDE_KEY) === '1'; } catch (e) { return false; } })();
