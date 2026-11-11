// The dashboard's sorts use a plain string comparison instead of localeCompare: for the date and time keys the app sorts, it must order exactly the same.
import { describe, expect, it } from 'vitest';
import { cmp } from '../src/core/order.js';

const dates = ['2026-01-05', '2026-09-30', '2026-10-01', '2026-10-06', '2026-10-28', '2026-11-05', '2027-01-01', '2026-10-06T08:00:00', '2026-10-06T08:00:00.000Z', ''];
const times = ['', '00:00:00', '08:05:09', '08:05:10', '12:34:56', '23:59:59', undefined];
const keys = dates.flatMap((d) => times.map((t) => `${d}${t}`));
const sign = (n) => Math.sign(n);

describe('cmp', () => {
  it('orders every date and time key the same way localeCompare does', () => {
    for (const a of keys) for (const b of keys) expect(sign(cmp(a, b)), `${a} vs ${b}`).toBe(sign(a.localeCompare(b)));
  });
  it('is a usable comparator: equal keys are equal, the order is consistent and a sort keeps ties in their original order', () => {
    expect(cmp('x', 'x')).toBe(0);
    expect(cmp('2026-10-01', '2026-10-02')).toBe(-1);
    expect(cmp('2026-10-02', '2026-10-01')).toBe(1);
    const rows = [{ k: '2026-10-02', n: 1 }, { k: '2026-10-01', n: 2 }, { k: '2026-10-02', n: 3 }, { k: '2026-10-01', n: 4 }];
    expect([...rows].sort((a, b) => cmp(b.k, a.k)).map((r) => r.n)).toEqual([1, 3, 2, 4]);
  });
});
