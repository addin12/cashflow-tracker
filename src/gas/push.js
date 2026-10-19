// Sends phone notifications through the app's site (core/push.js says what). PUSH comes from
// private/push.json at build time ({ site, secret }); without it nothing is sent.
/* global UrlFetchApp, PUSH, PropertiesService, LockService */

import { parseSubscription, addDevice, safeEqual, pushEventsOf } from '../core/push.js';
import { configValue, setConfigValue } from './setup.js';

const conf = () => (typeof PUSH !== 'undefined' && PUSH && PUSH.site && PUSH.secret ? PUSH : null);
export const pushSite = () => (conf() ? conf().site : '');

export function devices(ss) {
  try { const v = JSON.parse(String(configValue(ss, 'push_devices') || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
export const pushOn = (ss, event) => !!conf() && pushEventsOf(configValue(ss, 'push_events')).includes(event) && devices(ss).length > 0;

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
export function acceptDevice(ss, raw, code, label) {
  const [want, at] = String(configValue(ss, 'push_nonce') || '').split(' ');
  if (!want || !code || !safeEqual(code, want) || Date.now() - Number(at) > 30 * 60000) return false;
  const sub = parseSubscription(raw);
  if (!sub) return false;
  setConfigValue(ss, 'push_devices', JSON.stringify(addDevice(devices(ss), sub, label, new Date().toISOString())));
  setConfigValue(ss, 'push_nonce', '');
  return true;
}

/** Sends one notification to every device; devices the push service says are gone are dropped. */
export function sendPush(ss, notice) {
  const c = conf();
  if (!c || !notice) return { sent: 0, skipped: true };
  const list = devices(ss);
  if (!list.length) return { sent: 0, skipped: true };
  const res = UrlFetchApp.fetch(`${c.site}/api/push`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { authorization: `Bearer ${c.secret}` },
    payload: JSON.stringify({ subscriptions: list.map((d) => ({ endpoint: d.endpoint, keys: d.keys })), notification: notice }),
  });
  if (res.getResponseCode() !== 200) throw new Error(`notification service answered HTTP ${res.getResponseCode()}`);
  const results = (JSON.parse(res.getContentText()).results || []);
  const gone = new Set(results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint));
  if (gone.size) setConfigValue(ss, 'push_devices', JSON.stringify(list.filter((d) => !gone.has(d.endpoint))));
  return { sent: results.filter((r) => r.status >= 200 && r.status < 300).length, gone: gone.size };
}
