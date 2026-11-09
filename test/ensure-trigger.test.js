// A person whose sync trigger has disappeared gets it back the next time their own sync runs.
import { beforeEach, describe, expect, it } from 'vitest';

let triggers;
let created;
beforeEach(() => {
  triggers = [];
  created = 0;
  const store = { getProperties: () => ({}), getProperty: () => null, setProperty() {}, setProperties() {}, deleteProperty() {} };
  globalThis.PropertiesService = { getScriptProperties: () => store, getUserProperties: () => store };
  globalThis.Utilities = { formatDate: () => '2026-11-09' };
  globalThis.ScriptApp = {
    getProjectTriggers: () => triggers,
    deleteTrigger: (t) => { triggers = triggers.filter((x) => x !== t); },
    newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { created += 1; triggers.push({ getHandlerFunction: () => fn }); } }) }) }),
  };
});

const { ensureTrigger } = await import('../src/gas/sync.js');

describe('ensureTrigger', () => {
  it('installs the every-minute trigger when the person has none', () => {
    expect(ensureTrigger()).toBe(true);
    expect(created).toBe(1);
    expect(triggers).toHaveLength(1);
  });
  it('leaves an existing one alone, and installs only once however often it is called', () => {
    ensureTrigger();
    expect(ensureTrigger()).toBe(false);
    expect(ensureTrigger()).toBe(false);
    expect(created).toBe(1);
  });
  it('a different kind of trigger (the daily one) does not count', () => {
    triggers = [{ getHandlerFunction: () => 'dailyTrigger' }];
    expect(ensureTrigger()).toBe(true);
  });
});
