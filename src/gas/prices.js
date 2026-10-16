// Market prices for the Aset tab's tickers (validated by TICKER, so they go into URLs as they are). GOOGLEFINANCE() in Sheets has no IDX stocks, so the
// script asks Yahoo Finance first and reads Google Finance's quote page when Yahoo doesn't answer.
// Run by the sync's full runs (every 30 minutes) and right after assets are saved.
/* global UrlFetchApp */

import { TABS, ASSET_HEADERS } from '../core/schema.js';
import { priceSymbols, priceFromYahoo, priceFromGooglePage } from '../core/wealth.js';
import { readTable } from './store.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

function get(url) {
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': UA } });
  return r.getResponseCode() === 200 ? r.getContentText() : '';
}

/** { price, source } for a ticker, or null when neither source knows it. */
export function fetchPrice(ticker) {
  const s = priceSymbols(ticker);
  if (!s) return null;
  try {
    const v = priceFromYahoo(JSON.parse(get(`https://query1.finance.yahoo.com/v8/finance/chart/${s.yahoo}?range=1d&interval=1d`) || '{}'));
    if (v > 0) return { price: v, source: 'yahoo' };
  } catch (e) { /* try Google */ }
  try {
    const v = priceFromGooglePage(get(`https://www.google.com/finance/quote/${s.google}?hl=en`));
    if (v > 0) return { price: v, source: 'google' };
  } catch (e) { /* no price this time */ }
  return null;
}

/** Fetches the prices older than `maxAgeMs`; returns how many were updated. */
export function refreshPrices(ss, { maxAgeMs = 25 * 60000 } = {}) {
  const sh = ss.getSheetByName(TABS.assets);
  if (!sh || sh.getLastRow() < 2) return 0;
  const col = (h) => ASSET_HEADERS.indexOf(h) + 1;
  let n = 0;
  for (const r of readTable(ss, TABS.assets)) {
    if (!r.ticker || (Number(r.price_at) && Date.now() - Number(r.price_at) < maxAgeMs)) continue;
    const p = fetchPrice(r.ticker);
    if (!p) continue;
    sh.getRange(r._row, col('price')).setValue(p.price);
    sh.getRange(r._row, col('price_at')).setValue(Date.now());
    n += 1;
  }
  return n;
}
