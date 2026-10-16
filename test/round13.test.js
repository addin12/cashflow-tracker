// Round 13: market prices for IDX stocks (GOOGLEFINANCE has none): Yahoo Finance, then Google Finance's page.
import { describe, expect, it } from 'vitest';
import { priceSymbols, priceFromYahoo, priceFromGooglePage, goldFromHargaEmas, assetProblems } from '../src/core/wealth.js';

let answers;
globalThis.UrlFetchApp = { fetch: (url) => { const a = answers.find(([re]) => re.test(url)); return { getResponseCode: () => (a ? 200 : 404), getContentText: () => (a ? a[1] : '') }; } };
const { fetchPrice, fetchGold } = await import('../src/gas/prices.js');

describe('stock prices', () => {
  it('tickers: BBCA and IDX:BBCA are Jakarta stocks; others keep their exchange; nothing odd gets through', () => {
    expect(priceSymbols('bbca')).toEqual({ yahoo: 'BBCA.JK', google: 'BBCA:IDX' });
    expect(priceSymbols('IDX:BBRI')).toEqual({ yahoo: 'BBRI.JK', google: 'BBRI:IDX' });
    expect(priceSymbols('NASDAQ:AAPL')).toEqual({ yahoo: 'AAPL', google: 'AAPL:NASDAQ' });
    expect(priceSymbols('BB"CA')).toBeNull();
    expect(priceSymbols('')).toBeNull();
  });

  it('reads Yahoo\'s chart JSON and Google Finance\'s quote page', () => {
    expect(priceFromYahoo({ chart: { result: [{ meta: { regularMarketPrice: 5200, currency: 'IDR' } }] } })).toBe(5200);
    expect(priceFromYahoo({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNaN();
    expect(priceFromGooglePage('<div>Bank Central Asia</div><div class="x">Rp5,275</div><div>Rp 1,586.8</div>')).toBe(5275);
    expect(priceFromGooglePage('<div>$227.50</div>')).toBe(227.5);
    expect(priceFromGooglePage('<div>no price</div>')).toBeNaN();
  });

  it('Antam gold: the buyback price per gram from harga-emas.org; gold needs no typed value', () => {
    const page = '<td>1</td><td>2.715.000</td><td>2.517.000</td><span>Update harga LM Antam: </span>16 Oktober 2026<span>Harga pembelian kembali: </span><b>Rp2.443.500</b>/grm';
    expect(goldFromHargaEmas(page)).toBe(2443500);
    expect(goldFromHargaEmas('<p>no table</p>')).toBeNaN();
    answers = [[/harga-emas\.org/, page]];
    expect(fetchGold()).toEqual({ price: 2443500, source: 'harga-emas.org' });
    expect(assetProblems([{ name: 'Emas Antam', kind: 'gold', qty: 5 }])).toEqual([]);
  });

  it('asks Yahoo first, Google when Yahoo has nothing, and gives up quietly', () => {
    answers = [[/yahoo.*BBCA\.JK/, JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 5200 } }] } })], [/google.*BBRI:IDX/, '<b>Rp4,150</b>']];
    expect(fetchPrice('BBCA')).toEqual({ price: 5200, source: 'yahoo' });
    expect(fetchPrice('IDX:BBRI')).toEqual({ price: 4150, source: 'google' });
    expect(fetchPrice('IDX:XXXX')).toBeNull();
    expect(fetchPrice('bad"ticker')).toBeNull();
  });
});
