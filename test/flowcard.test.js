// "Alur uang": one block per account, every line the same three parts (label, what it is about, amount); the money-in total on top.
import { describe, expect, it } from 'vitest';
import { flowCard } from '../src/ui/dashboard.js';

const flow = {
  income: [{ stream: 'Bank A', amount: 9500000 }],
  transfers: [{ from: 'Bank A', to: 'Dana Darurat', amount: 1000000 }, { from: 'Bank A', to: 'E-Wallet', amount: 500000 }],
  spent: [{ stream: 'Bank A', amount: 699300 }, { stream: 'E-Wallet', amount: 406490 }],
};
const d = { balances: [{ stream: 'Dana Darurat', type: 'Saving' }, { stream: 'E-Wallet', type: 'Spending' }, { stream: 'Bank A', type: 'Spending' }] };

describe('flowCard', () => {
  const html = flowCard(flow, d);
  it('shows the total money in and one block per account', () => {
    expect(html).toContain('fl-total');
    expect(html).toContain('+Rp9.500.000');
    expect((html.match(/class="fl-acct"/g) || []).length).toBe(3);
  });
  it('tells saving from moving, and what each line is about', () => {
    expect(html).toMatch(/fl-tag save">Tabung/);
    expect(html).toMatch(/fl-tag move">Pindah/);
    expect(html).toContain('ke Dana Darurat');
    expect(html).toMatch(/Dapat transfer<\/span><span class="fl-text">dari Bank A/);
  });
  it('makes "Dibelanjakan" a tappable line that opens that account\'s transactions', () => {
    expect(html).toMatch(/<button type="button" class="fl-line" data-action="drill" data-stream="Bank A">/);
  });
  it('shows nothing when there is nothing to show', () => {
    expect(flowCard({ income: [], transfers: [], spent: [] }, d)).toBe('');
  });
});

describe('Transaksi table on a wide screen', () => {
  it('shows the category column on every row and gives state badges their own column, so the columns stay aligned', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
    const wide = css.slice(css.indexOf('@media (min-width: 1240px)'));
    expect(wide).toMatch(/\.trow \.c-cat \{ display: flex/);
    expect(wide).toMatch(/\.trow \.c-flags \{ display: flex/); // its own Status column, not inside the name or the category
    expect(css).not.toMatch(/\.c-cat:not\(:has/);
  });
});
