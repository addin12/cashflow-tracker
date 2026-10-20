// Logging by Telegram. The every-minute job asks Telegram for new messages to your own bot (no
// public address needed), and core/telegram.js says what to do with each. Only chats linked with a
// one-time code (Settings → Telegram) may log, and only private chats with text. The bot token is a
// script property: never in the sheet, never in an error message.
/* global UrlFetchApp, PropertiesService, LockService */

import { createApi } from '../core/api.js';
import { handleUpdate, validToken } from '../core/telegram.js';
import { sheetStore } from './sheetstore.js';
import { configValue, setConfigValue } from './setup.js';

const TOKEN = 'TELEGRAM_TOKEN';
const OFFSET = 'TG_OFFSET'; // the next update to ask for (Telegram forgets the ones before it)
const LAST = 'TG_LAST'; // when Telegram was last asked: the two people's jobs share one ask a minute
const props = () => PropertiesService.getScriptProperties();

export const tokenSet = () => !!props().getProperty(TOKEN);

/** One call to the bot API. The token is taken out of anything that goes into an error. */
function call(token, method, payload = {}) {
  let res;
  try {
    res = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  } catch (e) {
    throw new Error(`Telegram: ${String(e.message || e).split(token).join('•••').slice(0, 160)}`);
  }
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = {}; }
  if (res.getResponseCode() !== 200 || !body.ok) throw new Error(`Telegram: ${String(body.description || `HTTP ${res.getResponseCode()}`).slice(0, 120)}`);
  return body.result;
}

/** Saves a bot token after asking Telegram who it is; returns the bot's username. */
export function saveToken(token) {
  const t = String(token || '').trim();
  if (!validToken(t)) throw new Error('that does not look like a bot token');
  const me = call(t, 'getMe');
  props().setProperties({ [TOKEN]: t, [OFFSET]: '0' });
  return { username: String(me.username || '') };
}
export function removeToken() {
  [TOKEN, OFFSET, LAST].forEach((k) => props().deleteProperty(k));
}

const parseList = (v) => { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

/**
 * Handles the messages waiting for the bot. Cheap when there are none (one call, the spreadsheet isn't opened).
 * @param {() => object} getSpreadsheet  opened only when there is something to handle
 * @param {{onChange?: () => void}} opts  onChange: rows were added (the open app should refresh)
 */
export function pollTelegram(getSpreadsheet, { onChange } = {}) {
  const token = props().getProperty(TOKEN);
  if (!token) return { skipped: 'no bot' };
  if (Date.now() - Number(props().getProperty(LAST) || 0) < 45000) return { skipped: 'asked a moment ago' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return { skipped: 'busy' };
  try {
    props().setProperty(LAST, String(Date.now()));
    const updates = call(token, 'getUpdates', { offset: Number(props().getProperty(OFFSET) || 0), limit: 20, timeout: 0, allowed_updates: ['message'] });
    if (!updates.length) return { handled: 0 };
    const ss = getSpreadsheet();
    const lang = String(configValue(ss, 'language') || 'id') === 'en' ? 'en' : 'id';
    const first = String(configValue(ss, 'owner_name') || '');
    let added = 0;
    for (const u of updates) {
      props().setProperty(OFFSET, String(u.update_id + 1)); // before handling: a message that fails is not retried forever
      try {
        const out = handleUpdate(u, {
          chats: parseList(configValue(ss, 'telegram_chats')), nonce: String(configValue(ss, 'telegram_nonce') || ''), now: Date.now(), lang,
          addNotes: (who, p) => createApi(sheetStore(ss), { now: () => new Date(), meName: who, isOwner: who === first }).addNotes(p),
        });
        if (out.chats) setConfigValue(ss, 'telegram_chats', JSON.stringify(out.chats));
        if (out.clearNonce) setConfigValue(ss, 'telegram_nonce', '');
        added += out.added;
        const chat = u.message && u.message.chat && u.message.chat.id;
        for (const text of out.replies) if (chat) call(token, 'sendMessage', { chat_id: chat, text: text.slice(0, 3500) });
      } catch (e) { /* this message is lost; the next one is tried */ }
    }
    if (added && onChange) onChange();
    return { handled: updates.length, added };
  } finally {
    lock.releaseLock();
  }
}
