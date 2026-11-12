// The everyday polish: swipe on Cek, the Add button, looks (accent, text size, theme by time), the status ring and sentence, the tour, and charts that answer a tap.
import { describe, expect, it, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildUiHtml } from '../scripts/ui-build.mjs';
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { pickLanguage } from '../src/ui/i18n.js';

function memoryStore() {
  const t = {
    [TABS.transactions]: [
      { id: 't1', date: '2026-11-04', time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: '', description: 'WARUNG BU SITI', details: 'QRIS', status: 'pending', source: 'email', sender: '', gmail: '', gmail_id: 'g1', ref_no: '', transfer_id: '', rule_id: '', updated_by: '', updated_at: '' },
      { id: 't2', date: '2026-11-05', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 50000, category: 'fnb', description: 'BAKSO', details: '', status: 'approved', source: 'manual', sender: '', gmail: '', gmail_id: '', ref_no: '', transfer_id: '', rule_id: '', updated_by: '', updated_at: '' },
      { id: 't3', date: '2026-11-06', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 30000, category: 'Transport', description: 'GOJEK', details: '', status: 'approved', source: 'manual', sender: '', gmail: '', gmail_id: '', ref_no: '', transfer_id: '', rule_id: '', updated_by: '', updated_at: '' },
    ],
    [TABS.accounts]: [{ stream: 'BCA', type: 'Spending', owner: 'Me', institution: 'BCA', match_hint: '56', opening_balance: 1000000 }],
    [TABS.rules]: [], [TABS.connections]: [{ gmail: 'you@gmail.com', last_sync: '2026-11-10T03:00:00.000Z', last_status: 'live ok' }],
    [TABS.inboxLog]: [], [TABS.budgets]: [{ category: 'fnb', monthly_budget: 20000, scope: '' }], [TABS.goals]: [], [TABS.owed]: [], [TABS.plans]: [], [TABS.assets]: [],
  };
  const cfg = { owner_name: 'Me', partner_name: 'Dewi', partner_email: 'dewi@example.com', start_date: '2026-09-01', payday_day: 28, language: '' };
  const slots = buildCategorySlots({ income: ['gaji'], expense: ['fnb', 'Transport'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, rows) => { t[tab].push(...rows.map((r) => ({ ...r }))); },
    update: (tab, updates) => updates.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, rows) => { t[tab] = rows.map((r) => ({ ...r })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}

let dom; let store; let doc;
async function until(fn, what, ms = 2500) {
  for (const end = Date.now() + ms; Date.now() < end;) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!fn()) throw new Error(`timed out waiting for ${what}`);
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
const pointer = (type, el, x, y = 0) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
const tab = async (name, selector) => { click(doc.querySelector(`.nav [data-tab=${name}]`)); await until(() => doc.querySelector(selector), `${name} screen`); };

beforeAll(async () => {
  store = memoryStore();
  const api = createApi(store, { now: () => new Date(2026, 10, 10, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
  dom = new JSDOM(await buildUiHtml(), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
    beforeParse(window) {
      window.confirm = () => true;
      const runner = () => {
        let ok;
        const r = {
          withSuccessHandler(f) { ok = f; return r; }, withFailureHandler() { return r; },
          api(name, json) { setTimeout(() => { try { ok(JSON.stringify({ data: api[name](JSON.parse(json)) })); } catch (e) { ok(JSON.stringify({ error: e.message })); } }, 0); },
        };
        return r;
      };
      window.google = { script: { get run() { return runner(); } } };
      Object.defineProperty(window.navigator, 'language', { value: 'id-ID' });
    },
  });
  doc = dom.window.document;
  await until(() => doc.querySelector('.txcard[data-id="t1"]'), 'review cards');
}, 20000);

describe('swipe on Cek', () => {
  it('a short swipe does nothing; a long swipe right presses Approve (a card without a category snaps back and says why)', () => {
    const card = doc.querySelector('.txcard[data-id="t1"]');
    pointer('pointerdown', card.querySelector('.top'), 200);
    pointer('pointermove', card, 230);
    pointer('pointerup', card, 230);
    expect(card.classList.contains('swiping')).toBe(false);
    expect(doc.querySelector('.field.invalid')).toBeNull();
    pointer('pointerdown', card.querySelector('.top'), 100);
    pointer('pointermove', card, 160);
    expect(card.classList.contains('swipe-ok')).toBe(true);
    expect(card.style.transform).toContain('60px');
    pointer('pointermove', card, 260);
    expect(card.classList.contains('swipe-go')).toBe(true);
    pointer('pointerup', card, 260);
    expect(card.style.transform).toBe('');
    expect(card.querySelector('.field.invalid')).not.toBeNull(); // no category: it asked for one instead of approving
  });
  it('a swipe that starts on a field is left alone, and a swipe left ignores the transaction', async () => {
    const card = doc.querySelector('.txcard[data-id="t1"]');
    pointer('pointerdown', card.querySelector('select'), 300);
    pointer('pointermove', card, 100);
    expect(card.classList.contains('swiping')).toBe(false);
    pointer('pointerup', card, 100);
    pointer('pointerdown', card.querySelector('.top'), 300);
    pointer('pointermove', card, 150);
    pointer('pointerup', card, 150);
    await until(() => store.t[TABS.transactions].find((r) => r.id === 't1').status === 'ignored', 'ignored by swipe');
  });
});

describe('the Add button, and looks', () => {
  it('is on Ringkasan and Transaksi, off where it would cover buttons (Cek, Tambah, Pengaturan), and opens Add', async () => {
    const fab = doc.querySelector('#fab');
    expect(fab.hidden).toBe(true); // Cek is the first screen: Simpan and Abaikan are at the right
    await tab('transactions', '.day-head, .trow, .empty');
    expect(fab.hidden).toBe(false);
    expect(fab.textContent).toContain('Tambah');
    await tab('settings', '.set-row');
    expect(fab.hidden).toBe(true);
    await tab('transactions', '.day-head, .trow, .empty');
    click(fab);
    await until(() => doc.querySelector('form[data-form=add]'), 'add form');
    expect(fab.hidden).toBe(true);
  });
  it('accent colour, text size and theme by time apply at once and are remembered on this device', async () => {
    await tab('settings', '[data-section=prefs]');
    click(doc.querySelector('[data-action=setsection][data-section=prefs]'));
    await until(() => doc.querySelector('select[name=accent]'), 'preferences');
    const set = (name, value) => { const el = doc.querySelector(`select[name=${name}]`); el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
    set('accent', 'green');
    expect(doc.documentElement.getAttribute('data-accent')).toBe('green');
    set('size', 'large');
    expect(doc.documentElement.style.zoom).toBe('1.12');
    set('theme', 'time');
    expect(['light', 'dark']).toContain(doc.documentElement.getAttribute('data-theme'));
    expect(dom.window.localStorage.getItem('cashflow.look.v1')).toContain('green');
    set('accent', 'blue');
    set('size', 'normal');
    expect(doc.documentElement.hasAttribute('data-accent')).toBe(false);
    expect(doc.documentElement.style.zoom).toBe('');
    set('theme', 'auto');
  });
});

describe('the summary', () => {
  it('shows the budget ring and the one sentence that matters, and a first visit gets the tour', async () => {
    await tab('dashboard', '.monthcard');
    expect(doc.querySelector('.monthcard .ring')).not.toBeNull();
    expect(doc.querySelector('.monthcard .ring-fg').getAttribute('stroke-dasharray')).toBe('100 100'); // Rp50.000 of a Rp20.000 budget
    expect(doc.querySelector('.ring-fg').classList.contains('over')).toBe(true);
    expect(doc.querySelector('.monthcard .insight').textContent).toBe('fnb sudah melewati budget Rp30.000.');
    expect(doc.querySelector('#view').dataset.anim).toBe('1');
    expect(doc.querySelector('.monthcard .big-num[data-v]').dataset.v).toBe('80000');
    await until(() => doc.querySelector('#modal.open .tour'), 'the tour');
    expect(doc.querySelector('.tour h2').textContent).toBe('Ringkasan');
    click(doc.querySelector('[data-action=tourstep]'));
    expect(doc.querySelector('.tour h2').textContent).toBe('Perlu perhatian');
    for (let i = 0; i < 3; i += 1) click(doc.querySelector('[data-action=tourstep]:last-child'));
    expect(doc.querySelector('.tour h2').textContent).toBe('Tampilan');
    click(doc.querySelector('#modal [data-action=close]'));
    expect(doc.querySelector('#modal').classList.contains('open')).toBe(false);
  });
  it('the tour does not come back by itself, and a quiet repaint of the same month does not replay the motion', async () => {
    await tab('transactions', '.day-head, .trow, .empty');
    await tab('dashboard', '.monthcard');
    expect(doc.querySelector('#modal').classList.contains('open')).toBe(false);
    expect(doc.querySelector('#view').dataset.anim).toBeUndefined();
  });
});

describe('the app bar and the language button', () => {
  it('runs bell, eye, moon, language from left to right', () => {
    expect([...doc.querySelectorAll('.appbar-actions > button')].map((b) => b.id)).toEqual(['bellBtn', 'hideBtn', 'themeBtn', 'langBtn']);
  });
  it('Indonesian is the default whatever the browser speaks', () => {
    expect(pickLanguage('', 'en-US')).toBe('id');
    expect(pickLanguage(undefined, 'en-GB')).toBe('id');
    expect(pickLanguage('en', 'id-ID')).toBe('en');
  });
  it('one tap switches the whole app to English and back, and the choice is kept on this device', async () => {
    const btn = doc.querySelector('#langBtn');
    expect(btn.textContent).toBe('ID');
    expect(doc.documentElement.lang).toBe('id');
    click(btn);
    await until(() => doc.querySelector('.nav [data-tab=review] b').textContent === 'Review', 'english tabs');
    expect(btn.textContent).toBe('EN');
    expect(btn.getAttribute('aria-label')).toBe('EN · Switch language to Indonesian'); // starts with what is written on the button
    expect(doc.documentElement.lang).toBe('en');
    expect(dom.window.localStorage.getItem('cashflow.lang.v1')).toBe('en');
    click(btn);
    await until(() => doc.querySelector('.nav [data-tab=review] b').textContent === 'Cek', 'indonesian tabs');
    expect(btn.textContent).toBe('ID');
    expect(btn.getAttribute('aria-label')).toBe('ID · Ganti bahasa ke English');
  });
});

describe('charts answer a tap', () => {
  it('the running total says the day and both months; a slice of the donut says its category', async () => {
    click(doc.querySelector('[data-action=dashview][data-view=report]'));
    await until(() => doc.querySelector('.line-wrap'), 'report');
    const wrap = doc.querySelector('.line-wrap');
    expect(JSON.parse(wrap.dataset.line).n).toBeGreaterThan(20);
    click(wrap.querySelector('svg'));
    const tip = wrap.querySelector('.chart-tip');
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toMatch(/^Tgl \d+/);
    const donut = doc.querySelector('.donut');
    const before = donut.firstElementChild.innerHTML;
    donut.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: -50 }));
    expect(donut.firstElementChild.innerHTML).not.toBe(before);
    expect(donut.firstElementChild.querySelector('b')).not.toBeNull();
  });
});

describe('the app opens the way it was left', () => {
  /** A second app on the same device: the saved choices are put in its browser storage before the page starts. */
  async function reopen(saved) {
    const api2 = createApi(store, { now: () => new Date(2026, 10, 10, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
    const second = new JSDOM(await buildUiHtml(), {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
      beforeParse(window) {
        window.localStorage.setItem('cashflow.view.v1', saved);
        window.localStorage.setItem('cashflow.tour.v1', '1');
        const runner = () => {
          let ok;
          const r = {
            withSuccessHandler(f) { ok = f; return r; }, withFailureHandler() { return r; },
            api(name, json) { setTimeout(() => { try { ok(JSON.stringify({ data: api2[name](JSON.parse(json)) })); } catch (e) { ok(JSON.stringify({ error: e.message })); } }, 0); },
          };
          return r;
        };
        window.google = { script: { get run() { return runner(); } } };
        Object.defineProperty(window.navigator, 'language', { value: 'id-ID' });
      },
    });
    const d2 = second.window.document;
    await until(() => d2.querySelector('#view h1') && !d2.querySelector('#view .skeleton'), 'second app first screen'); // the loading text also has class empty, so wait for a real screen
    return { dom2: second, d2 };
  }

  it('remembers whose numbers, Ikhtisar or Laporan, Bulanan or Tahunan, and Transaksi\'s period and kind', async () => {
    click(doc.querySelector('.nav [data-tab=dashboard]'));
    await until(() => doc.querySelector('.seg.who'), 'summary');
    click(doc.querySelector('[data-action=who][data-who="Me"]'));
    await until(() => doc.querySelector('.seg.who button.on')?.textContent === 'Aku', 'Aku');
    click(doc.querySelector('[data-action=dashview][data-view=report]'));
    await until(() => doc.querySelector('.mode-seg'), 'report');
    click(doc.querySelector('[data-action=reportmode][data-mode=year]'));
    await until(() => doc.querySelector('.mode-seg button.on')?.textContent === 'Tahunan', 'Tahunan');
    click(doc.querySelector('.nav [data-tab=transactions]'));
    await until(() => doc.querySelector('.pchips'), 'Transaksi');
    click(doc.querySelector('[data-action=preset][data-p="30"]'));
    await until(() => doc.querySelector('.pchips button.on')?.textContent === '30 hari', '30 hari');
    click(doc.querySelector('[data-action=kindchip][data-k=out]'));
    await until(() => [...doc.querySelectorAll('.pchips button.on')].some((b) => b.textContent === 'Pengeluaran'), 'Pengeluaran');
    const saved = dom.window.localStorage.getItem('cashflow.view.v1');
    expect(JSON.parse(saved)).toMatchObject({ who: 'me', view: 'report', yearly: true, preset: '30', kind: 'out' });

    const { dom2, d2 } = await reopen(saved);
    const click2 = (el) => el.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true }));
    const until2 = async (fn, what) => { for (const end = Date.now() + 2500; Date.now() < end;) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); } throw new Error(`timed out waiting for ${what}`); };
    click2(d2.querySelector('.nav [data-tab=dashboard]'));
    await until2(() => d2.querySelector('.seg.who'), 'summary in the second app');
    expect(d2.querySelector('.seg.who button.on').textContent).toBe('Aku');
    await until2(() => d2.querySelector('.mode-seg'), 'the report in the second app'); // it opens on Laporan
    expect(d2.querySelector('.mode-seg button.on').textContent).toBe('Tahunan');
    click2(d2.querySelector('.nav [data-tab=transactions]'));
    await until2(() => d2.querySelector('.pchips'), 'Transaksi in the second app');
    expect([...d2.querySelectorAll('.pchips button.on')].map((b) => b.textContent)).toEqual(['30 hari', 'Pengeluaran']);
  });

  it('ignores what makes no sense (a person who is not there, an unknown period) and opens on the defaults', async () => {
    const { dom2, d2 } = await reopen(JSON.stringify({ who: 'other', view: 'nonsense', preset: 'forever', kind: 'weird' }));
    const click2 = (el) => el.dispatchEvent(new dom2.window.MouseEvent('click', { bubbles: true }));
    click2(d2.querySelector('.nav [data-tab=transactions]'));
    for (const end = Date.now() + 2500; Date.now() < end && !d2.querySelector('.pchips');) await new Promise((r) => setTimeout(r, 5));
    expect([...d2.querySelectorAll('.pchips button.on')].map((b) => b.textContent)).toEqual(['Periode ini', 'Masuk & keluar']);
  });
});
