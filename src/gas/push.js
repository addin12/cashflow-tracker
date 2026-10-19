// Sends phone notifications through the app's site (core/push.js says what). PUSH comes from
// private/push.json at build time ({ site, secret }); without it nothing is sent.
/* global UrlFetchApp, PUSH, PropertiesService, LockService */

import { parseSubscription, addDevice, safeEqual, pushEventsOf, pushTargets } from '../core/push.js';
import { configValue, setConfigValue } from './setup.js';

const conf = () => (typeof PUSH !== 'undefined' && PUSH && PUSH.site && PUSH.secret ? PUSH : null);
export const pushSite = () => (conf() ? conf().site : '');

export function devices(ss) {
  try { const v = JSON.parse(String(configValue(ss, 'push_devices') || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
const firstPerson = (ss) => String(configValue(ss, 'owner_name') || '');
/** The notifications a person has switched on (the partner's are their own setting). */
export function eventsOfPerson(ss, name) {
  const partner = String(configValue(ss, 'partner_email') || '') && name === String(configValue(ss, 'partner_name') || '');
  return pushEventsOf(configValue(ss, partner ? 'partner_push_events' : 'push_events'));
}
/** The devices that should get `event`; `only`: just that person's. */
export function targets(ss, { event = '', only = '' } = {}) {
  return conf() ? pushTargets(devices(ss), { defaultOwner: firstPerson(ss), only, event, eventsOf: (n) => eventsOfPerson(ss, n) }) : [];
}
export const pushOn = (ss, event, only = '') => targets(ss, { event, only }).length > 0;

/**
 * True the first time `key` is asked on a `day`. Each person's morning trigger runs the same jobs;
 * this keeps a household notification from going out twice.
 */
export function onceToday(key, day) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return false;
  try {
    const props = PropertiesService.getScriptProperties();
    const k = `ONCE_${key}`;
    if (props.getProperty(k) === day) return false;
    props.setProperty(k, day);
    return true;
  } finally { lock.releaseLock(); }
}

/** A phone coming back from the site's /notifikasi page: kept only with the current one-time code. */
export function acceptDevice(ss, raw, code, label, owner = '') {
  const [want, at] = String(configValue(ss, 'push_nonce') || '').split(' ');
  if (!want || !code || !safeEqual(code, want) || Date.now() - Number(at) > 30 * 60000) return false;
  const sub = parseSubscription(raw);
  if (!sub) return false;
  setConfigValue(ss, 'push_devices', JSON.stringify(addDevice(devices(ss), sub, label, new Date().toISOString(), owner)));
  setConfigValue(ss, 'push_nonce', '');
  return true;
}

/**
 * Sends one notification to the devices it is for (see targets); devices the push service says are gone are dropped.
 * @param {{event?: string, only?: string}} opts  event: only to people who have it on; only: just that person's devices
 */
export function sendPush(ss, notice, { event = '', only = '' } = {}) {
  const c = conf();
  if (!c || !notice) return { sent: 0, skipped: true };
  const list = targets(ss, { event, only });
  if (!list.length) return { sent: 0, skipped: true };
  const res = UrlFetchApp.fetch(`${c.site}/api/push`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { authorization: `Bearer ${c.secret}` },
    payload: JSON.stringify({ subscriptions: list.map((d) => ({ endpoint: d.endpoint, keys: d.keys })), notification: notice }),
  });
  if (res.getResponseCode() !== 200) throw new Error(`notification service answered HTTP ${res.getResponseCode()}`);
  const results = (JSON.parse(res.getContentText()).results || []);
  const gone = new Set(results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint));
  if (gone.size) setConfigValue(ss, 'push_devices', JSON.stringify(devices(ss).filter((d) => !gone.has(d.endpoint))));
  return { sent: results.filter((r) => r.status >= 200 && r.status < 300).length, gone: gone.size };
}
