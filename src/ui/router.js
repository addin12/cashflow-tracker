// Moving between the five screens.

import { viewAdd } from './add.js';
import { viewDashboard } from './dashboard.js';
import { failed } from './render.js';
import { viewReview } from './review.js';
import { viewSettings } from './settings.js';
import { $, $$, state } from './state.js';
import { viewTransactions } from './transactions.js';

const VIEWS = { review: viewReview, dashboard: viewDashboard, transactions: viewTransactions, add: viewAdd, settings: viewSettings };

export async function show(tab) {
  state.tab = tab;
  $$('.nav button[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const fab = $('#fab');
  if (fab) fab.hidden = ['add', 'review', 'settings'].includes(tab); // on Cek and Pengaturan it would sit over Simpan / Abaikan
  try { await VIEWS[tab](); } catch (e) { if (state.tab === tab) failed(e); }
  if (typeof window.scrollTo === 'function') try { window.scrollTo(0, 0); } catch (e) { /* not available */ }
}
