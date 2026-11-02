// How the web app's code is kept: one file per screen or purpose, a small entry file, and nothing importing the entry.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('../src/ui/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const text = (f) => readFileSync(new URL(f, dir), 'utf8');

describe('src/ui layout', () => {
  it('has no file of more than 650 lines (the strings table aside)', () => {
    const big = files.filter((f) => f !== 'i18n.js').map((f) => [f, text(f).split('\n').length]).filter(([, n]) => n > 650);
    expect(big).toEqual([]);
  });
  it('keeps the entry file small, and no other file imports it', () => {
    expect(text('app.js').split('\n').length).toBeLessThan(250);
    expect(files.filter((f) => f !== 'app.js' && /from '\.\/app\.js'/.test(text(f)))).toEqual([]);
  });
  it('has no section-banner comments: a new section is a new file', () => {
    expect(files.filter((f) => /^\/\/ -{10,}/m.test(text(f)))).toEqual([]);
  });
});
