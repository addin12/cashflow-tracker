// Small pieces of picture: category tags, the category and account icons, bank logos, status badges.

import { svgIcon } from './icons.js';
import { esc, hashOf } from './format.js';
import { T } from './state.js';

export function tag(name) {
  if (!name) return `<span class="tag none">${esc(T.noCategory)}</span>`;
  return `<span class="tag c${hashOf(name)}">${esc(name)}</span>`;
}

// A picture per category, found from words in its name (the owner can rename categories freely).
const ICONS = [
  [/pemasukan|income/i, 'coins'], [/food|makan|minum|kopi|coffee|resto|jajan/i, 'utensils'], [/harian|grocer|sembako/i, 'cart'], [/online|shop/i, 'bag'],
  [/servis|cuci|kendaraan|bengkel/i, 'car'], [/transport|bensin|parkir|ojek/i, 'bus'], [/langganan|subscription|digital/i, 'play'],
  [/hobi|game|board/i, 'dice'], [/buku|book/i, 'book'], [/kesehatan|optik|health|obat/i, 'heart'], [/skincare|kecantikan|beauty/i, 'drop'],
  [/barber|cukur|salon/i, 'scissors'], [/tagihan|utilitas|listrik|bill/i, 'receipt'], [/pulsa|internet/i, 'phone'], [/rumah|house|home/i, 'home'],
  [/pakaian|baju|cloth/i, 'shirt'], [/nongkrong|hiburan|entertain/i, 'ticket'], [/hadiah|sosial|gift/i, 'gift'], [/iuran|patungan/i, 'users'],
  [/pendidikan|kursus|educ/i, 'cap'], [/admin|biaya|fee/i, 'bank'], [/gaji|salary/i, 'briefcase'], [/proyek|freelance/i, 'laptop'],
  [/dividen|bunga|invest|saham/i, 'trend'], [/cashback|refund/i, 'undo'], [/penyesuaian|adjust/i, 'scale'], [/transfer/i, 'swap'], [/lainnya|other/i, 'box'],
];

export function icon(category) {
  const found = category && ICONS.find(([re]) => re.test(category));
  return `<span class="cat-ic ${category ? `c${hashOf(category)}` : 'none'}" aria-hidden="true">${svgIcon(found ? found[1] : 'dot')}</span>`;
}

// A picture per account, from words in its name, else from its type (Saving or Spending). Order matters: "Dana Darurat" is not the DANA wallet.
const ACCT_ICONS = [
  [/darurat|emergency/i, 'lifebuoy'], [/saham|sekuritas|stock|reksa|invest|crypto|kripto/i, 'trend'], [/cash|tunai|dompet/i, 'banknote'],
  [/gopay|ovo|\bdana\b|shopeepay|linkaja|e-?wallet|flip/i, 'phone'], [/kredit|credit|paylater/i, 'card'],
];

// Bank and wallet logos, loaded from Google's favicon service so no logo artwork lives in the repo.
// A colour = the logo's own background, so a square logo blends into the circle (others sit on white). Order matters: "Mandiri Sekuritas" before Mandiri, "Jago Dana Darurat" before DANA.
const ACCT_LOGOS = [
  [/sekuritas/i, 'mandirisekuritas.co.id', '#163d6e'], [/\bbca\b|klikbca/i, 'mybca.bca.co.id', '#0f63ab'], [/\bblu\b/i, 'blubybcadigital.id'], [/jago/i, 'jago.com', '#ffac00'],
  [/mandiri|livin/i, 'bankmandiri.co.id'], [/\bbni\b/i, 'bni.co.id'], [/\bbri\b|brimo/i, 'bri.co.id'], [/seabank/i, 'seabank.co.id'],
  [/jenius/i, 'jenius.com'], [/gopay/i, 'gopay.co.id'], [/\bovo\b/i, 'ovo.id'], [/(?<!reksa\s)\bdana\b(?!\s*darurat)/i, 'dana.id'],
  [/shopee/i, 'shopee.co.id'], [/bibit/i, 'bibit.id'], [/ajaib/i, 'ajaib.co.id'], [/stockbit/i, 'stockbit.com'],
];

const logoUrl = (domain) => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`;

export function acctIcon(stream, type) {
  const found = ACCT_ICONS.find(([re]) => re.test(stream));
  const name = found ? found[1] : type === 'Saving' ? 'safe' : 'wallet';
  const logo = ACCT_LOGOS.find(([re]) => re.test(stream));
  // A logo that fails to load is swapped back to the drawn icon (see the 'error' listener in start()).
  if (logo) return `<span class="cat-ic logo" aria-hidden="true"${logo[2] ? ` style="background:${logo[2]}"` : ''} data-fallback="${name}"><img src="${logoUrl(logo[1])}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return `<span class="cat-ic c${hashOf(stream)}" aria-hidden="true">${svgIcon(name)}</span>`;
}

export const statusBadge = (s) => (s === 'pending' ? `<span class="badge warn">● ${esc(T.statusPending)}</span>`
  : s === 'ignored' ? `<span class="badge neutral">${esc(T.statusIgnored)}</span>` : '');

export const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

export const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

/** "Pertama kali": the first payment to a place (from an email or a statement). */
export const firstBadge = (x) => (x.first ? ` <span class="badge new" title="${esc(T.firstHint)}">${esc(T.firstTime)}</span>` : '');
