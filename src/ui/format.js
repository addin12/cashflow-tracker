// Turning values into text: money, dates, months, escaping for HTML.

import { state } from './state.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const locale = () => (state.boot?.lang === 'en' ? 'en-GB' : 'id-ID');

export const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }); // whole rupiah on screen; the sheet keeps cents

export const rp = (n) => (state.hide ? 'Rp •••' : `${Number(n) < 0 ? '−' : ''}Rp${fmt.format(Math.abs(Number(n) || 0))}`);

export const signed = (x) => `${x.direction === 'in' ? '+' : '−'}${rp(x.amount)}`;

export const monthAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export const monthDate = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1); };

export const monthLabel = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });

export const monthShort = (ym) => monthDate(ym).toLocaleDateString(locale(), { month: 'short' });

const thisYear = () => String(state.boot?.today || '').slice(0, 4);

export function dateLabel(d, { weekday = true } = {}) {
  if (!d) return '';
  const opts = { day: 'numeric', month: 'short', ...(weekday ? { weekday: 'short' } : {}), ...(String(d).slice(0, 4) !== thisYear() ? { year: 'numeric' } : {}) };
  return new Date(`${d}T00:00:00`).toLocaleDateString(locale(), opts);
}

export const rangeLabel = (a, b) => `${dateLabel(a, { weekday: false })} – ${dateLabel(b, { weekday: false })}`;

export const currentMonth = () => state.boot.currentMonth || state.boot.today.slice(0, 7);

export const timeLabel = (t) => (t ? String(t).slice(0, 5).replace(':', state.boot?.lang === 'en' ? ':' : '.') : '');

export const when = (x) => [dateLabel(x.date), timeLabel(x.time)].filter(Boolean).join(' · ');

// Notion-style tags: a category always gets the same calm tint.
export const hashOf = (name) => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 997; return h % 8; };
