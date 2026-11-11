// The motion rules of docs/UI-DIRECTION.md, kept true in the stylesheet: durations and easing come from tokens, nothing
// animates "all", and whoever asks for less motion gets none.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const declarations = (prop) => [...css.matchAll(new RegExp(`(?<![-\\w])${prop}\\s*:\\s*([^;}]+)`, 'g'))].map((m) => m[1].trim());

describe('motion', () => {
  it('defines the motion tokens', () => {
    expect(css).toMatch(/--dur-quick:\s*120ms/);
    expect(css).toMatch(/--dur-base:\s*200ms/);
    expect(css).toMatch(/--ease-out:\s*cubic-bezier/);
  });
  it('never transitions "all"', () => {
    expect(declarations('transition').filter((v) => /(^|[\s,])all\b/.test(v))).toEqual([]);
    expect(declarations('transition-property').filter((v) => /\ball\b/.test(v))).toEqual([]);
  });
  it('takes every transition duration and easing from the tokens', () => {
    const own = (v) => v.replace(/var\([^)]*\)/g, ''); // what is left once the tokens are taken out
    const hardCoded = declarations('transition').filter((v) => /\d*\.?\d+m?s\b/.test(own(v)) || /\b(ease|ease-in|ease-out|ease-in-out|linear)\b/.test(own(v)));
    expect(hardCoded).toEqual([]);
  });
  it('honours prefers-reduced-motion for every transition and animation, and stops the looping ones', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after/);
    expect(block).toMatch(/transition-duration:\s*1ms\s*!important/);
    expect(block).toMatch(/animation-duration:\s*1ms\s*!important/);
    expect(block).toMatch(/\.spin,\s*\.skeleton\s*\{\s*animation:\s*none/);
  });
  it('keeps the number of looping animations small, and every other animation plays once', () => {
    expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]).sort()).toEqual(['grow', 'pop', 'reveal', 'ringdraw', 'shimmer', 'spin']);
    expect(declarations('animation').filter((v) => /\binfinite\b/.test(v)).map((v) => v.split(/\s/)[0]).sort()).toEqual(['shimmer', 'spin']);
  });
});
