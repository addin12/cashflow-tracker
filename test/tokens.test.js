// docs/UI-DIRECTION.md and src/ui/styles.css must say the same thing: every design token in the stylesheet is in the
// doc's table with the same light and dark value, and the stylesheet's two copies of the dark palette are identical.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../docs/UI-DIRECTION.md', import.meta.url), 'utf8');

const norm = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase();
const body = (startRe) => {
  const m = css.match(startRe);
  if (!m) throw new Error(`not found: ${startRe}`);
  let depth = 1;
  let i = m.index + m[0].length;
  const from = i;
  while (depth && i < css.length) { if (css[i] === '{') depth += 1; else if (css[i] === '}') depth -= 1; i += 1; }
  return css.slice(from, i - 1);
};
const tokensOf = (text) => new Map([...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], norm(m[2])]));

const light = tokensOf(body(/^:root\s*\{/m));
const dark = tokensOf(body(/^:root\[data-theme="dark"\]\s*\{/m));
const darkByDevice = tokensOf(body(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/));

const table = doc.slice(doc.indexOf('## Tokens'), doc.indexOf('## Per screen'));
const documented = new Map(
  [...table.matchAll(/^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|\s*(`[^`]+`|same)\s*\|/gm)]
    .map((m) => [m[1], { light: norm(m[2]), dark: m[3] === 'same' ? 'same' : norm(m[3].replace(/`/g, '')) }]),
);
const series = /^--(t\d+i?|ch\d+)$/; // the category hues are described in prose

describe('design tokens', () => {
  it('reads a real table', () => {
    expect(documented.size).toBeGreaterThan(25);
  });
  it('has every stylesheet token in the doc (except the category hues), so a new token needs a row', () => {
    const missing = [...light.keys()].filter((t) => !series.test(t) && !documented.has(t));
    expect(missing).toEqual([]);
  });
  it('lists no token the stylesheet does not have', () => {
    expect([...documented.keys()].filter((t) => !light.has(t))).toEqual([]);
  });
  it('gives each token the same light value in the doc and the stylesheet', () => {
    const wrong = [...documented].filter(([t, v]) => light.get(t) !== v.light).map(([t, v]) => `${t}: doc ${v.light}, css ${light.get(t)}`);
    expect(wrong).toEqual([]);
  });
  it('gives each token the same dark value (or "same" where the stylesheet does not override it)', () => {
    const wrong = [...documented].filter(([t, v]) => (v.dark === 'same' ? dark.has(t) && dark.get(t) !== light.get(t) : dark.get(t) !== v.dark))
      .map(([t, v]) => `${t}: doc ${v.dark}, css ${dark.get(t) ?? 'same'}`);
    expect(wrong).toEqual([]);
  });
  it('keeps the two copies of the dark palette identical', () => {
    // the manual toggle (data-theme="dark") and "the device is dark and light was not chosen"
    const differ = [...new Set([...dark.keys(), ...darkByDevice.keys()])].filter((t) => dark.get(t) !== darkByDevice.get(t));
    expect(differ).toEqual([]);
  });
});
