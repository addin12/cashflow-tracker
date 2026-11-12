// The final "we moved" build: every trigger and menu item stops at once, the web app points to the new address, and nothing touches the Sheet.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_NEW = 'https://cashflow.example/';
let main;
const touched = [];

beforeAll(async () => {
  const boom = (name) => new Proxy({}, { get: () => { touched.push(name); throw new Error(`${name} must not be used by a retired build`); } });
  globalThis.RETIRED = { url: URL_NEW };
  globalThis.SpreadsheetApp = boom('SpreadsheetApp');
  globalThis.ScriptApp = boom('ScriptApp');
  globalThis.MailApp = boom('MailApp');
  globalThis.UrlFetchApp = boom('UrlFetchApp');
  globalThis.CalendarApp = boom('CalendarApp');
  globalThis.GmailApp = boom('GmailApp');
  globalThis.HtmlService = { createHtmlOutput: (html) => ({ html, setTitle() { return this; }, addMetaTag() { return this; } }) };
  main = await import('../src/main.js');
});
afterAll(() => { for (const k of ['RETIRED', 'SpreadsheetApp', 'ScriptApp', 'MailApp', 'UrlFetchApp', 'CalendarApp', 'GmailApp', 'HtmlService']) delete globalThis[k]; });

describe('a retired build', () => {
  it('stops every trigger and menu item without touching Google services', () => {
    for (const name of ['syncTrigger', 'weeklySummaryTrigger', 'eveningTrigger', 'dailyTrigger', 'selfTestTrigger', 'updatePrices', 'connectCalendar', 'menuConnect', 'menuSyncNow', 'menuSetup', 'menuSelfTest', 'menuCoverage', 'menuPrices', 'menuWeeklySummary', 'setup', 'selfTest']) {
      expect(main[name](), name).toEqual({ retired: true });
    }
    expect(main.onOpen()).toBeNull();
    expect(touched).toEqual([]);
  });
  it('the web app says where Cashflow moved to, and keeps the screen a person asked for', () => {
    const page = main.doGet({ parameter: { tab: 'settings' } }).html;
    expect(page).toContain('Cashflow sudah pindah');
    expect(page).toContain(`href="${URL_NEW}?tab=settings"`);
    expect(main.doGet({ parameter: { tab: '<script>' } }).html).toContain(`href="${URL_NEW}"`); // a tab name that is not a plain word is dropped
  });
  it('the API refuses with the new address, so a page still open stops saving into the Sheet', () => {
    const r = JSON.parse(main.api('add', '{}'));
    expect(r.error).toContain(URL_NEW);
    expect(JSON.parse(main.api('stamp', '{}')).error).toContain(URL_NEW);
  });
});
