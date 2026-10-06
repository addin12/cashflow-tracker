// The weekly summary email (Mondays 07:00) and the self-test that runs by itself after an
// upgrade, both on time triggers so the owner never has to start them.
/* global MailApp, ScriptApp */

import { createApi } from '../core/api.js';
import { summaryEmail } from '../core/summary.js';
import { sheetStore } from './sheetstore.js';
import { configValue } from './setup.js';
import { myAddress } from './gmail.js';

export const WEEKLY_HANDLER = 'weeklySummaryTrigger';
export const SELFTEST_HANDLER = 'selfTestTrigger';

function appUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/** Sends the summary to the owner's own Gmail. `force` sends even when switched off. */
export function sendWeeklySummary(ss, { force = false } = {}) {
  if (!force && String(configValue(ss, 'weekly_email') || 'on').toLowerCase() === 'off') return { sent: false, reason: 'off' };
  const api = createApi(sheetStore(ss), { now: () => new Date() });
  const lang = String(configValue(ss, 'language') || 'id') === 'en' ? 'en' : 'id';
  const { subject, html } = summaryEmail(api.weekly(), { appUrl: appUrl() || ss.getUrl(), lang });
  const to = myAddress();
  MailApp.sendEmail({ to, subject, htmlBody: html, name: 'Cashflow' });
  return { sent: true, to };
}

/** Installs the Monday-morning trigger once (setup calls this; running it again changes nothing). */
export function installWeeklyTrigger() {
  if (ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === WEEKLY_HANDLER)) return false;
  ScriptApp.newTrigger(WEEKLY_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  return true;
}

/** A self-test one minute from now, in its own run (it takes a while), once. */
export function scheduleSelfTest() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === SELFTEST_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(SELFTEST_HANDLER).timeBased().after(60 * 1000).create();
}

/** Removes the one-off self-test trigger once it has fired. */
export function clearSelfTestTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === SELFTEST_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
}
