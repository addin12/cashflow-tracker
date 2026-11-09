// Which logged emails the sync reads again.
import { describe, expect, it } from 'vitest';
import { retryable } from '../src/core/retry.js';

const NOW = Date.parse('2026-11-10T00:00:00Z');
const DAY = 86400000;

describe('retryable', () => {
  it('an error is tried again for ever, a recent "waiting" for 14 days, an ok or a skip never', () => {
    expect(retryable('error', NOW - 90 * DAY, NOW)).toBe(true);
    expect(retryable('waiting', NOW - 3 * DAY, NOW)).toBe(true);
    expect(retryable('waiting', NOW - 20 * DAY, NOW)).toBe(false);
    expect(retryable('waiting', 0, NOW)).toBe(true);
    expect(retryable('ok', NOW, NOW)).toBe(false);
    expect(retryable('skip', NOW, NOW, { reason: 'no parser for bca@bca.co.id' })).toBe(false);
  });
  it('while all mail is read again, a skip that only says "no parser" is tried again; other skips are not', () => {
    expect(retryable('skip', NOW, NOW, { rescan: true, reason: 'no parser for bca@bca.co.id' })).toBe(true);
    expect(retryable('skip', NOW, NOW, { rescan: true, reason: 'not a transaction email' })).toBe(false);
    expect(retryable('skip', NOW, NOW, { rescan: true, reason: 'failed transaction' })).toBe(false);
    expect(retryable('ok', NOW, NOW, { rescan: true, reason: 'no parser' })).toBe(false);
  });
});
