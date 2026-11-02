// The copy rules of docs/UI-DIRECTION.md, kept true: no em dashes, no exclamation marks, no buzzwords or generic buttons
// in anything a person reads (both languages).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/ui/i18n.js', import.meta.url), 'utf8');
const strings = [...source.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]).filter((s) => /[A-Za-z]{3}/.test(s));
const offenders = (re) => strings.filter((s) => re.test(s));

describe('copy rules', () => {
  it('reads a real number of strings', () => {
    expect(strings.length).toBeGreaterThan(1000);
  });
  it('has no em dashes', () => {
    expect(offenders(/—/)).toEqual([]);
  });
  it('has no exclamation marks at the end of a sentence', () => {
    expect(offenders(/!(\s|$)/)).toEqual([]);
  });
  it('has no buzzwords', () => {
    expect(offenders(/\b(seamless|seamlessly|revolutionary|effortless|robust|powerful|supercharge|streamline|cutting-edge|game-changing|next-level|best-in-class)\b/i)).toEqual([]);
  });
  it('has no generic buttons', () => {
    expect(offenders(/^(get started|learn more|click here|submit)$/i)).toEqual([]);
  });
});
