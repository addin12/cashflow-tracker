// Per-person one-time work, and guards against the trigger-context bug of 2026-11-04: in a time-driven trigger there is no
// user cache and Session.getActiveUser() can throw, so any code that assumes them took every trigger for the owner.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runOnce } from '../src/gas/once.js';

const fakeProps = () => { const m = new Map(); return { getProperty: (k) => m.get(k) ?? null, setProperty: (k, v) => m.set(k, v) }; };

describe('runOnce', () => {
  it('runs a task the first time and never again for the same person', () => {
    const props = fakeProps();
    let n = 0;
    expect(runOnce('t', () => { n += 1; return 'done'; }, props)).toEqual({ ran: true, result: 'done' });
    expect(runOnce('t', () => { n += 1; }, props)).toEqual({ ran: false });
    expect(n).toBe(1);
  });
  it('gives each person their own turn (the shared setup upgrade cannot)', () => {
    const a = fakeProps();
    const b = fakeProps();
    let n = 0;
    runOnce('t', () => { n += 1; }, a);
    runOnce('t', () => { n += 1; }, b);
    expect(n).toBe(2);
  });
  it('does not retry a task that failed, and reports why', () => {
    const props = fakeProps();
    expect(runOnce('t', () => { throw new Error('no calendar access'); }, props)).toEqual({ ran: true, error: 'no calendar access' });
    expect(runOnce('t', () => 'again', props)).toEqual({ ran: false });
  });
  it('runs again under a new name', () => {
    const props = fakeProps();
    runOnce('t-1', () => 1, props);
    expect(runOnce('t-2', () => 2, props)).toEqual({ ran: true, result: 2 });
  });
});

describe('trigger-context guards', () => {
  const dir = new URL('../src/gas/', import.meta.url);
  const sources = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')]);
  it('never chains off CacheService.getUserCache(): a trigger gets null', () => {
    expect(sources.filter(([, s]) => /getUserCache\(\)\s*\./.test(s)).map(([f]) => f)).toEqual([]);
  });
  it('asks Session.getActiveUser() only inside members.js, where a throw is caught and the Gmail profile is the fallback', () => {
    expect(sources.filter(([f, s]) => f !== 'members.js' && /Session\.getActiveUser\(/.test(s)).map(([f]) => f)).toEqual([]);
  });
});
