// Logging by Telegram: reading a message, linking a chat with a one-time code, what the bot answers,
// and the safety rules (private chats only, linked chats only, the token never in an error).
import { describe, expect, it } from 'vitest';
import { validToken, parseMessage, makeNonce, parseNonce, chatOwner, linkChat, unlinkOwner, replyText, handleUpdate, helpText } from '../src/core/telegram.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';
import { pollTelegram, saveToken, tokenSet, removeToken } from '../src/gas/telegram.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0';

describe('reading a message', () => {
  it('a command, or the notes: one a line, "catat" left off, ten at most', () => {
    expect(parseMessage('/start abc123')).toEqual({ command: 'start', arg: 'abc123', notes: [] });
    expect(parseMessage('/bantuan@MyBot')).toEqual({ command: 'bantuan', arg: '', notes: [] });
    expect(parseMessage('kopi 28rb gopay').notes).toEqual(['kopi 28rb gopay']);
    expect(parseMessage('catat: makan 25rb\n\nLog bensin 50rb\nparkir 5rb').notes).toEqual(['makan 25rb', 'bensin 50rb', 'parkir 5rb']);
    expect(parseMessage(Array.from({ length: 15 }, (_, i) => `item ${i} 1rb`).join('\n')).notes).toHaveLength(10);
    expect(parseMessage('   ').notes).toEqual([]);
    expect(parseMessage('x'.repeat(5000)).notes[0]).toHaveLength(1500);
  });
  it('a bot token looks like one', () => {
    expect(validToken(TOKEN)).toBe(true);
    for (const bad of ['', 'abc', '123456789:short', `${TOKEN} extra`, '123:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0', 'https://api.telegram.org/bot']) expect(validToken(bad)).toBe(false);
  });
});

describe('chats', () => {
  it('one entry per chat, newest first, three a person; a person can be taken out', () => {
    let chats = [];
    for (let i = 1; i <= 5; i += 1) chats = linkChat(chats, i, 'Me', `HP ${i}`, '2026-10-20');
    chats = linkChat(chats, 99, 'Dewi', 'Dewi', '2026-10-20');
    chats = linkChat(chats, 5, 'Me', 'HP 5 again', '2026-10-20'); // the same chat again: replaced, not added
    expect(chats.filter((c) => c.owner === 'Me').map((c) => c.label)).toEqual(['HP 5 again', 'HP 4', 'HP 3']);
    expect(chatOwner(chats, '99')).toBe('Dewi');
    expect(chatOwner(chats, 12345)).toBe('');
    expect(unlinkOwner(chats, 'Me').map((c) => c.owner)).toEqual(['Dewi']);
  });
  it('the one-time code survives a name with odd characters', () => {
    expect(parseNonce(makeNonce('abc', 1700000000000, 'Addin | X'))).toEqual({ code: 'abc', at: 1700000000000, name: 'Addin | X' });
    expect(parseNonce('')).toBeNull();
    expect(parseNonce('junk')).toBeNull();
  });
});

describe('what the bot does with an update', () => {
  const now = Date.UTC(2026, 9, 20, 3, 0, 0);
  const upd = (text, extra = {}) => ({ update_id: 7, message: { text, date: Math.floor(now / 1000), chat: { id: 111, type: 'private' }, from: { first_name: 'Dewi' }, ...extra } });
  const nonce = makeNonce('code123', now - 60000, 'Dewi');
  const saved = [];
  const addNotes = (who, p) => { saved.push([who, p]); return { added: 1, skipped: [], rows: [{ description: 'Kopi', amount: 28000, direction: 'out', stream: 'GoPay', category: 'Makan', status: 'approved' }] }; };
  const ctx = (extra = {}) => ({ chats: [], nonce, now, lang: 'id', addNotes, ...extra });

  it('linking: the right code from a private chat, within 30 minutes, links the chat to the person who asked', () => {
    const out = handleUpdate(upd('/start code123'), ctx());
    expect(out.chats).toEqual([{ chat: 111, owner: 'Dewi', label: 'Dewi', at: '2026-10-20T03:00:00.000Z' }]);
    expect(out.clearNonce).toBe(true);
    expect(out.replies[0]).toContain('Terhubung sebagai Dewi');
    for (const [text, n] of [['/start wrong', nonce], ['/start code123', makeNonce('code123', now - 31 * 60000, 'Dewi')], ['/start code123', '']]) {
      const bad = handleUpdate(upd(text), ctx({ nonce: n }));
      expect(bad.chats).toBeUndefined();
      expect(bad.replies[0]).toContain('Kode tidak dikenal');
    }
  });
  it('an unlinked chat can only be told how to link; a linked one logs, and the answer says what was saved', () => {
    saved.length = 0;
    expect(handleUpdate(upd('kopi 28rb gopay'), ctx()).replies[0]).toContain('belum terhubung');
    expect(saved).toEqual([]);
    const out = handleUpdate(upd('kopi 28rb gopay #pagi'), ctx({ chats: [{ chat: 111, owner: 'Dewi' }] }));
    expect(saved).toEqual([['Dewi', { gmailId: 'tg7', sentMs: now, notes: ['kopi 28rb gopay #pagi'] }]]);
    expect(out).toMatchObject({ added: 1, replies: ['✅ Kopi Rp28.000 · GoPay · Makan'] });
  });
  it('commands from a linked chat show the help; groups, channels and non-text are ignored', () => {
    const linked = ctx({ chats: [{ chat: 111, owner: 'Dewi' }] });
    expect(handleUpdate(upd('/bantuan'), linked).replies).toEqual([helpText('id')]);
    expect(handleUpdate(upd('/start'), linked).replies).toEqual([helpText('id')]);
    expect(handleUpdate(upd('kopi 5rb', { chat: { id: 111, type: 'group' } }), linked)).toEqual({ replies: [], added: 0 });
    expect(handleUpdate({ update_id: 1, message: { chat: { id: 111, type: 'private' }, photo: [] } }, linked)).toEqual({ replies: [], added: 0 });
    expect(handleUpdate({ update_id: 1 }, linked)).toEqual({ replies: [], added: 0 });
    expect(handleUpdate(upd('/start code123', { chat: { id: 111, type: 'channel' } }), ctx())).toEqual({ replies: [], added: 0 });
  });
  it('the answer for a waiting row, a missing amount, an income, and English', () => {
    const res = { added: 2, skipped: ['halo'], rows: [
      { description: 'Bensin', amount: 50000, direction: 'out', stream: '', category: '', status: 'pending' },
      { description: 'Gaji', amount: 8500000, direction: 'in', stream: 'BCA', category: 'Gaji', status: 'approved' },
    ] };
    expect(replyText(res, 'id').split('\n')).toEqual(['⏳ Bensin Rp50.000: menunggu di Cek (lengkapi kategori atau rekening)', '✅ Gaji +Rp8.500.000 · BCA · Gaji', '❓ Tidak ada jumlah di: "halo"']);
    expect(replyText(res, 'en').split('\n')[0]).toBe('⏳ Bensin Rp50.000: waiting in Review (add a category or account)');
    expect(replyText({ added: 0, skipped: [], rows: [] }, 'id')).toBe('Tidak ada yang bisa dicatat.');
  });
});

describe('the API', () => {
  function memoryStore() {
    const t = {
      [TABS.transactions]: [], [TABS.accounts]: [{ stream: 'GoPay', type: 'Spending', owner: 'Me', institution: 'GoPay', opening_balance: 0 }],
      [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [{ id: 'r1', field: 'description', pattern: 'KOPI', category: 'Makan', auto_approve: true }], [TABS.inboxLog]: [], [TABS.connections]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
    };
    const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28 };
    const slots = buildCategorySlots({ income: ['Gaji'], expense: ['Makan'] });
    return { t, cfg, read: (tab) => (t[tab] || []).map((r) => ({ ...r })), append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); }, update() {}, remove() {}, replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); }, config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {} };
  }
  const oct20 = () => new Date(2026, 9, 20, 10);
  it('the token is checked, the bot named, the link made with a one-time code kept 20 minutes', () => {
    const store = memoryStore();
    let configured = false;
    let n = 0;
    let clock = oct20();
    const telegram = { configured: () => configured, save: () => { configured = true; return { username: 'kasku_bot' }; }, remove: () => { configured = false; }, token: () => `code${n += 1}` };
    const api = createApi(store, { now: () => clock, telegram });
    expect(api.settings().telegram).toEqual({ configured: false, username: '', link: '', chats: [] });
    expect(() => api.saveTelegramToken({ token: 'not a token' })).toThrow(/does not look like a bot token/);
    expect(api.saveTelegramToken({ token: ` ${TOKEN} ` })).toEqual({ ok: true, username: 'kasku_bot' });
    expect(api.settings().telegram.link).toBe('https://t.me/kasku_bot?start=code1');
    clock = new Date(2026, 9, 20, 10, 15);
    expect(api.settings().telegram.link).toMatch(/start=code1$/);
    clock = new Date(2026, 9, 20, 10, 25);
    expect(api.settings().telegram.link).toMatch(/start=code2$/);
    store.cfg.telegram_chats = JSON.stringify([{ chat: 1, owner: 'Me', label: 'HP' }, { chat: 2, owner: 'Dewi', label: 'HP D' }]);
    expect(api.settings().telegram.chats.map((c) => [c.owner, c.mine])).toEqual([['Me', true], ['Dewi', false]]);
    api.telegramUnlink();
    expect(JSON.parse(store.cfg.telegram_chats).map((c) => c.owner)).toEqual(['Dewi']);
    api.telegramRemove();
    expect(store.cfg).toMatchObject({ telegram_chats: '', telegram_nonce: '', telegram_username: '' });
    expect(configured).toBe(false);
  });
  it('without Telegram in the environment there is nothing to show or save', () => {
    const api = createApi(memoryStore(), { now: oct20 });
    expect(api.settings().telegram).toBeNull();
    expect(() => api.saveTelegramToken({ token: TOKEN })).toThrow(/not available/);
  });
  it('a message logged through the API: the rule fills the category, GoPay the account, and it says what it saved', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct20, meName: 'Me', isOwner: true });
    const res = api.addNotes({ gmailId: 'tg9', sentMs: oct20().getTime(), notes: ['kopi 28rb gopay'] });
    expect(res.rows).toEqual([{ description: 'Kopi', amount: 28000, direction: 'out', stream: 'GoPay', category: 'Makan', status: 'approved' }]);
  });
});

describe('talking to Telegram (stand-ins for Google\'s services)', () => {
  const calls = [];
  let store;
  let answers;
  const install = () => {
    store = new Map();
    calls.length = 0;
    globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => store.get(k) ?? null, setProperty: (k, v) => store.set(k, v), setProperties: (o) => Object.entries(o).forEach(([k, v]) => store.set(k, v)), deleteProperty: (k) => store.delete(k) }) };
    globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
    globalThis.UrlFetchApp = { fetch: (url, opts) => { calls.push({ url, body: JSON.parse(opts.payload) }); const a = answers(url); if (a instanceof Error) throw a; return { getResponseCode: () => a.code ?? 200, getContentText: () => JSON.stringify(a.body) }; } };
  };
  it('nothing happens without a bot; saving a token asks Telegram who it is and keeps the token as a property', () => {
    install();
    expect(pollTelegram(() => { throw new Error('opened'); })).toEqual({ skipped: 'no bot' });
    answers = () => ({ body: { ok: true, result: { username: 'kasku_bot' } } });
    expect(saveToken(TOKEN)).toEqual({ username: 'kasku_bot' });
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/getMe`);
    expect(tokenSet()).toBe(true);
    expect(() => saveToken('nope')).toThrow(/does not look like/);
    removeToken();
    expect(tokenSet()).toBe(false);
  });
  it('with no messages waiting the spreadsheet is not opened, and it asks at most once in 45 seconds', () => {
    install();
    store.set('TELEGRAM_TOKEN', TOKEN);
    answers = () => ({ body: { ok: true, result: [] } });
    expect(pollTelegram(() => { throw new Error('opened'); })).toEqual({ handled: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ offset: 0, timeout: 0, allowed_updates: ['message'] });
    expect(pollTelegram(() => { throw new Error('opened'); })).toEqual({ skipped: 'asked a moment ago' });
    expect(calls).toHaveLength(1);
  });
  it('an error never carries the token', () => {
    install();
    store.set('TELEGRAM_TOKEN', TOKEN);
    answers = (url) => new Error(`DNS error: ${url}`);
    let message = '';
    try { pollTelegram(() => ({})); } catch (e) { message = e.message; }
    expect(message).toContain('Telegram:');
    expect(message).not.toContain(TOKEN);
    expect(message).toContain('•••');
    install();
    answers = () => ({ code: 401, body: { ok: false, description: 'Unauthorized' } });
    expect(() => saveToken(TOKEN)).toThrow('Telegram: Unauthorized');
  });
});
