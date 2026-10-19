// The emails the app sends by itself, and the time triggers behind them:
//   Mondays 07:00   weekly summary, then the self-test (an email only when it finds a problem)
//   every day 07:00 the monthly report on the 1st, the balance-check reminder on payday, bills due tomorrow,
//                   the Cashflow calendar (when on), and once the look a year back for yearly plans
//   every day 21:00 a nudge when nothing was logged by hand today (only when switched on)
//   after a sync    an alert when the sync failed or a new bank email couldn't be read
// plus the self-test that runs by itself after an upgrade. All go to the owner's own Gmail.
/* global MailApp, ScriptApp, PropertiesService, Utilities */

import { createApi } from '../core/api.js';
import { summaryEmail } from '../core/summary.js';
import { monthlyEmail, paydayEmail, alertEmail, prevMonth, billsEmail, closeDayEmail } from '../core/notices.js';
import { isPayday } from '../core/payday.js';
import { sheetStore } from './sheetstore.js';
import { configValue } from './setup.js';
import { myAddress } from './gmail.js';
import { syncCalendar } from './calendar.js';
import { scanYearly } from './yearly.js';
import { sendPush, pushOn, onceToday } from './push.js';
import { billsNotice, paydayNotice, closeNotice, claimsNotice, warrantyNotice } from '../core/push.js';
import { backupCsv } from '../core/csv.js';
import { TABS } from '../core/schema.js';

export const WEEKLY_HANDLER = 'weeklySummaryTrigger';
export const DAILY_HANDLER = 'dailyTrigger';
export const SELFTEST_HANDLER = 'selfTestTrigger';
export const EVENING_HANDLER = 'eveningTrigger';
const ALERT_EVERY_MS = 12 * 3600 * 1000;

function appUrl(ss) {
  try { return ScriptApp.getService().getUrl() || ss.getUrl(); } catch (e) { return ss.getUrl(); }
}
const langOf = (ss) => (String(configValue(ss, 'language') || 'id') === 'en' ? 'en' : 'id');
const isOn = (ss, key) => String(configValue(ss, key) || 'on').toLowerCase() !== 'off';
function send(ss, { subject, html, attachments }) {
  const to = myAddress();
  MailApp.sendEmail({ to, subject, htmlBody: html, name: 'Cashflow', ...(attachments ? { attachments } : {}) });
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
  try { if (api.createDuePlanned().created) done.push('plans'); } catch (e) { /* the sync tries again */ }
  if (today.getDate() === 1 && isOn(ss, 'monthly_email')) {
    const month = prevMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    // The backup: every transaction as a CSV, so the spreadsheet isn't the only copy.
    const backup = Utilities.newBlob(backupCsv(sheetStore(ss).read(TABS.transactions)), 'text/csv', `cashflow-backup-${month}.csv`);
    send(ss, { ...monthlyEmail(api.monthly({ month }), { appUrl: appUrl(ss), lang: langOf(ss), backup: true }), attachments: [backup] });
    done.push('monthly');
  }
  const payday = Number(configValue(ss, 'payday_day')) || 28;
  if (isPayday(today, payday) && pushOn(ss, 'payday')) try { sendPush(ss, paydayNotice(langOf(ss))); done.push('payday push'); } catch (e) { /* email still goes */ }
  if (isPayday(today, payday) && isOn(ss, 'payday_email')) {
    send(ss, paydayEmail(api.dashboard({}).balances, { appUrl: appUrl(ss), lang: langOf(ss) }));
    done.push('payday');
  }
  if (!configValue(ss, 'yearly_scan')) try { scanYearly(ss, { today }); done.push('yearly'); } catch (e) { /* tried again tomorrow */ }
  try { if (!syncCalendar(ss, today).skipped) done.push('calendar'); } catch (e) { /* the status is in Config calendar_status */ }
  const tomorrow = (api.dashboard({}).bills || []).filter((b) => b.daysLeft === 1);
  if (tomorrow.length && pushOn(ss, 'bills')) try { sendPush(ss, billsNotice(tomorrow, langOf(ss))); done.push('bills push'); } catch (e) { /* email still goes */ }
  if (tomorrow.length && isOn(ss, 'bill_email')) {
    send(ss, billsEmail(tomorrow, { appUrl: appUrl(ss), lang: langOf(ss) }));
    done.push('bills');
  }
  // Insurance claims 0-3 days from their deadline; warranties 30, 7 and 1 days from their end.
  const dash = api.dashboard({});
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const claims = (dash.claims || []).filter((c) => c.daysLeft >= 0 && c.daysLeft <= 3);
  if (claims.length && pushOn(ss, 'bills') && onceToday('claims', day)) try { sendPush(ss, claimsNotice(claims, langOf(ss))); done.push('claims push'); } catch (e) { /* the app shows them too */ }
  const warranties = (dash.warranties || []).filter((w) => [30, 7, 1].includes(w.daysLeft));
  if (warranties.length && pushOn(ss, 'bills') && onceToday('warranty', day)) try { sendPush(ss, warrantyNotice(warranties, langOf(ss))); done.push('warranty push'); } catch (e) { /* the app shows them too */ }
  return done;
}

/** 21:00: when switched on, and today isn't closed and nothing was logged by hand, one nudge. */
export function runEvening(ss, today = new Date()) {
  const email = String(configValue(ss, 'close_email') || 'off') === 'on';
  const push = pushOn(ss, 'close');
  if (!email && !push) return 'off';
  const day = createApi(sheetStore(ss), { now: () => today }).review().day;
  if (day.closed || day.byHand) return 'not needed';
  if (email) send(ss, closeDayEmail({ appUrl: appUrl(ss), lang: langOf(ss) }));
  if (push) try { sendPush(ss, closeNotice(langOf(ss))); } catch (e) { /* the email went */ }
  return 'sent';
}

/**
 * An alert about a sync problem, at most once per 12 hours for the same problem.
 * problem: { error?: string, unread?: [{subject, from, reason}] }
 */
export function sendSyncAlert(ss, problem) {
  const what = problem.selftest ? `s:${(problem.selftest.failures || []).length}` : problem.error ? `e:${problem.error}` : `u:${(problem.unread || []).map((u) => u.subject).join('|')}`;
  const key = `ALERT_${what.slice(0, 200)}`;
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
  if (!have.has(EVENING_HANDLER)) ScriptApp.newTrigger(EVENING_HANDLER).timeBased().everyDays(1).atHour(21).create();
}

/** A self-test one minute from now, in its own run (it takes a while), once. */
export function scheduleSelfTest(delayMs = 60 * 1000) {
  clearSelfTestTrigger();
  ScriptApp.newTrigger(SELFTEST_HANDLER).timeBased().after(delayMs).create();
}

/** Removes the one-off self-test trigger once it has fired. */
export function clearSelfTestTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === SELFTEST_HANDLER).forEach((t) => ScriptApp.deleteTrigger(t));
}
