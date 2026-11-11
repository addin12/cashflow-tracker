// "Add to home screen": the browser offers it with an event; Settings keeps the offer until it is used (only where the browser makes one).
import { state } from './state.js';

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvt = e; });
  window.addEventListener('appinstalled', () => { state.installEvt = null; });
}

/** Shows the browser's own install dialog. */
export async function installApp() {
  const e = state.installEvt;
  if (!e) return;
  state.installEvt = null;
  try { e.prompt(); await e.userChoice; } catch (err) { /* the person closed it */ }
}
