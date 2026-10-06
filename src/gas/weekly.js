// The emails the app sends by itself, and the time triggers behind them:
//   Mondays 07:00   weekly summary
//   every day 07:00 the monthly report on the 1st, the balance-check reminder on payday
//   after a sync    an alert when the sync failed or a new bank email couldn't be read
// plus the self-test that runs by itself after an upgrade. All go to the owner's own Gmail.
/* global MailApp, ScriptApp, PropertiesService */

import { createApi } from '../core/api.js';
import { summaryEmail } from '../core/summary.js';
import { monthlyEmail, paydayEmail, alertEmail, prevMonth } from '../core/notices.js';
import { isPayday } from '../core/payday.js';
import { sheetStore } from './sheetstore.js';
import { configValue } from './setup.js';
import { myAddress } from './gmail.js';

export const WEEKLY_HANDLER = 'weeklySummaryTrigger';
export const DAILY_HANDLER = 'dailyTrigger';
export const SELFTEST_HANDLER = 'selfTestTrigger';
const ALERT_EVERY_MS = 12 * 3600 * 1000;

function appUrl(ss) {
  try { return ScriptApp.getService().getUrl() || ss.getUrl(); } catch (e) { return ss.getUrl(); }
}
const langOf = (ss) => (String(configValue(ss, 'language') || 'id') === 'en' ? 'en' : 'id');
const isOn = (ss, key) => String(configValue(ss, key) || 'on').toLowerCase() !== 'off';
function send(ss, { subject, html }) {
  const to = myAddress();
  MailApp.sendEmail({ to, subject, htmlBody: html, name: 'Cashflow' });
  return { sent: true, to };
}

/** Sends the summary to the owner's own Gmail. `force` sends even when switched off. */
export function sendWeeklySummary(ss, { force = false } = {}) {
  if (!force && !isOn(ss, 'weekly_email')) return { sent: false, reason: 'off' };
  const api = createApi(sheetStore(ss), { now: () => new Date() });
  return send(ss, summaryEmail(api.weekly(), { appUrl: appUrl(ss), lang: langOf(ss) }));
}

/** Every morning: the monthly report on the 1st (about the month that just ended), the reminder on payday. */
export function runDaily(ss, today = new Date()) {
  const done = [];
  const api = createApi(sheetStore(ss), { now: () => today });
  if (today.getDate() === 1 && isOn(ss, 'monthly_email')) {
    const month = prevMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    send(ss, monthlyEmail(api.monthly({ month }), { appUrl: appUrl(ss), lang: langOf(ss) }));
    done.push('monthly');
  }
  const payday = Number(configValue(ss, 'payday_day')) || 28;
  if (isPayday(today, payday) && isOn(ss, 'payday_email')) {
    send(ss, paydayEmail(api.dashboard({}).balances, { appUrl: appUrl(ss), lang: langOf(ss) }));
    done.push('payday');
  }
  return done;
}

/**
 * An alert about a sync problem, at most once per 12 hours for the same problem.
 * problem: { error?: string, unread?: [{subject, from, reason}] }
 */
export function sendSyncAlert(ss, problem) {
  const key = `ALERT_${(problem.error ? `e:${problem.error}` : `u:${(problem.unread || []).map((u) => u.subject).join('|')}`).slice(0, 200)}`;
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty(key) || 0);
  if (Date.now() - last < ALERT_EVERY_MS) return { sent: false, reason: 'sent recently' };
  const r = send(ss, alertEmail(problem, { appUrl: appUrl(ss), lang: langOf(ss) }));
  props.setProperty(key, String(Date.now()));
  return r;
}

/** Installs the Monday-morning and the daily triggers once (running it again changes nothing). */
export function installMailTriggers() {
  const have = new Set(ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()));
  if (!have.has(WEEKLY_HANDLER)) ScriptApp.newTrigger(WEEKLY_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  if (!have.has(DAILY_HANDLER)) ScriptApp.newTrigger(DAILY_HANDLER).timeBased().everyDays(1).atHour(7).create();
}

/** A self-test one minute from now, in its own run (it takes a while), once. */
export function scheduleSelfTest() {
  clearSelfTestTrigger();
  ScriptApp.newTrigger(SELFTEST_HANDLER).timeBased().after(60 * 1000).create();
}

/** Removes the one-off self-test trigger once it has fired. */
export function clearSelfTestTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === SELFTEST_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
}
