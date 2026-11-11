// How the app looks on THIS device (each of you can choose your own): the accent colour and the text size. Kept in the browser.

const KEY = 'cashflow.look.v1';
export const ACCENTS = ['blue', 'green', 'purple', 'orange', 'rose'];
export const SIZES = { normal: 1, large: 1.12, xlarge: 1.25 };

export function readLook() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return { accent: ACCENTS.includes(v.accent) ? v.accent : 'blue', size: v.size in SIZES ? v.size : 'normal' };
  } catch (e) { return { accent: 'blue', size: 'normal' }; }
}

export function saveLook(part) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...readLook(), ...part })); } catch (e) { /* storage unavailable: it still applies until the page closes */ }
}

/** Puts the saved (or given) look on the page: data-accent for the colours, zoom for the text size. */
export function applyLook(look = readLook()) {
  const root = document.documentElement;
  if (look.accent === 'blue') root.removeAttribute('data-accent'); else root.setAttribute('data-accent', look.accent);
  const scale = SIZES[look.size] || 1;
  if (scale === 1) root.style.removeProperty('zoom'); else root.style.zoom = String(scale);
}
