// Round 8: near-real-time sync. The every-minute trigger only looks at Gmail (no spreadsheet)
// and runs the full sync when something new arrived, on a 30-minute heartbeat, or after an upgrade.
import { describe, expect, it, beforeEach } from 'vitest';
import { SETUP_VERSION } from '../src/core/schema.js';

let props;
let gmailIds;
let lockTaken;
function install() {
  props = {};
  gmailIds = [];
  lockTaken = 0;
  const store = {
    getProperties: () => ({ ...props }),
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); },
    setProperties: (o) => { Object.entries(o).forEach(([k, v]) => { props[k] = String(v); }); },
    deleteProperty: (k) => { delete props[k]; },
  };
  globalThis.PropertiesService = { getScriptProperties: () => store };
  globalThis.Gmail = { Users: { Messages: { list: () => ({ messages: gmailIds.map((id) => ({ id })) }) } } };
  // A taken lock stands for "the full sync would run now" without needing a spreadsheet.
  globalThis.LockService = { getScriptLock: () => ({ tryLock: () => { lockTaken += 1; return false; }, releaseLock() {} }) };
  globalThis.Utilities = { formatDate: () => '2026-10-09' };
}

const { runSync, syncStamp, addRuntime } = await (async () => { install(); return import('../src/gas/sync.js'); })();
const ready = (extra = {}) => Object.assign(props, {
  SYNC_CHECKPOINT_MS: String(Date.now() - 3600000), SYNC_KNOWN_IDS: JSON.stringify(['a', 'b']),
  SYNC_LAST_FULL_MS: String(Date.now() - 60000), SYNC_SETUP_VERSION: String(SETUP_VERSION), ...extra,
});

describe('every-minute quick look', () => {
  beforeEach(install);

  it('nothing new in Gmail: done in a moment, without the spreadsheet', () => {
    ready();
    gmailIds = ['a', 'b'];
    expect(runSync({ quick: true })).toEqual({ status: 'idle' });
    expect(lockTaken).toBe(0);
    expect(Number(props.SYNC_LAST_CHECK_MS)).toBeGreaterThan(Date.now() - 5000);
  });

  it('a new bank email starts the full sync', () => {
    ready();
    gmailIds = ['a', 'b', 'c'];
    expect(runSync({ quick: true })).toEqual({ status: 'busy' }); // reached the full sync (lock stubbed as taken)
    expect(lockTaken).toBe(1);
  });

  it('the full sync also runs every 30 minutes, after an upgrade, and the first time', () => {
    ready({ SYNC_LAST_FULL_MS: String(Date.now() - 31 * 60000) });
    runSync({ quick: true });
    ready({ SYNC_SETUP_VERSION: String(SETUP_VERSION - 1) });
    runSync({ quick: true });
    install();
    runSync({ quick: true });
    expect(lockTaken).toBe(1);
  });

  it('the menu and the app\'s "Sync now" always do the full sync', () => {
    ready();
    gmailIds = ['a', 'b'];
    runSync({});
    expect(lockTaken).toBe(1);
  });
});

describe('what the open app asks every minute', () => {
  beforeEach(install);

  it('stamp, last look and trigger time used today', () => {
    props.SYNC_DATA_STAMP = '1791500000000';
    props.SYNC_LAST_CHECK_MS = '1791500060000';
    addRuntime(1200);
    addRuntime(800);
    expect(syncStamp()).toEqual({ stamp: '1791500000000', checked: 1791500060000, today: 2000 });
  });

  it('yesterday\'s runtime is dropped', () => {
    props['SYNC_RUNTIME_2026-10-08'] = '5000000';
    addRuntime(100);
    expect(Object.keys(props).filter((k) => k.startsWith('SYNC_RUNTIME_'))).toEqual(['SYNC_RUNTIME_2026-10-09']);
  });
});
