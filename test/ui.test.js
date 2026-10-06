// Smoke test of the real web app page: built HTML + bundled script in jsdom, with
// google.script.run answered by the real API (core/api.js) on an in-memory store.
import { describe, expect, it, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildUiHtml } from '../scripts/ui-build.mjs';
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { buildCategorySlots } from '../src/core/categories.js';

function memoryStore() {
  const t = {
    [TABS.transactions]: [
      { id: 't1', date: '2026-10-04', time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: '', description: 'WARUNG BU SITI', details: 'QRIS', status: 'pending', gmail_id: 'g1', updated_by: 'sync' },
      { id: 't2', date: '2026-10-04', time: '12:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 30000, category: '', description: 'WARUNG BU SITI', details: '', status: 'pending', gmail_id: 'g2', updated_by: 'sync' },
      { id: 't3', date: '2026-10-03', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 300000, category: 'Belanja Online', description: 'Tokopedia', details: '', status: 'approved', gmail_id: 'g3', rule_id: 'r1', updated_by: 'sync' },
      { id: 't4', date: '2026-09-28', time: '08:00:00', owner: 'Me', stream: 'BCA', direction: 'in', amount: 8000000, category: 'gaji', description: 'Gaji', details: '', status: 'approved', gmail_id: '', updated_by: 'Me' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', institution: 'BCA', match_hint: '56', opening_balance: 1000000 },
      { stream: 'Cash', type: 'Spending', owner: 'Me', institution: '', match_hint: 'manual', opening_balance: 50000 },
      { stream: 'Tabungan', type: 'Saving', owner: 'Me', institution: 'Jago', match_hint: 'Kantong X', opening_balance: 0 },
    ],
    [TABS.rules]: [{ id: 'r1', field: 'description', pattern: 'TOKOPEDIA', category: 'Belanja Online', auto_approve: true, hits: 3 }],
    [TABS.connections]: [{ gmail: 'you@gmail.com', last_sync: '2026-10-05T03:00:00.000Z', last_status: 'live ok: +3 rows, 0 errors' }],
    [TABS.inboxLog]: [{ gmail_id: 'g9', subject: 'Pembayaran Berhasil!', from: 'bank', status: 'error', reason: 'no amount found' }],
    [TABS.budgets]: [{ category: 'Belanja Online', monthly_budget: 200000 }],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, language: '', cat_transfer: 'trf ke bank lain', last_selftest: 'PASS' };
  let slots = buildCategorySlots({ income: ['gaji'], expense: ['fnb', 'Belanja Online'] });
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, rows) => { t[tab].push(...rows.map((r) => ({ ...r }))); },
    update: (tab, updates) => updates.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, rows) => { t[tab] = rows.map((r) => ({ ...r })); },
    config: (k) => cfg[k] ?? '',
    setConfig: (k, v) => { cfg[k] = v; },
    slots: () => slots,
    setSlots: (s) => { slots = s; },
  };
}

let dom; let store; let doc; let api; let html;
const calls = [];
const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(fn, what) {
  for (let i = 0; i < 200; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error(`timed out waiting for ${what}\n${doc.querySelector('#view').innerHTML.slice(0, 500)}`);
}
const view = () => doc.querySelector('#view').textContent;
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const tab = async (name, text) => { click(doc.querySelector(`.nav [data-tab=${name}]`)); await until(() => view().includes(text), `${name} tab`); };
const status = (id) => store.t[TABS.transactions].find((r) => r.id === id).status;

beforeAll(async () => {
  store = memoryStore();
  api = createApi(store, { now: () => new Date(2026, 9, 5, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet' });
  html = await buildUiHtml();
  dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
    beforeParse(window) {
      window.confirm = () => true;
      const runner = () => {
        let ok; let fail;
        const r = {
          withSuccessHandler(f) { ok = f; return r; },
          withFailureHandler(f) { fail = f; return r; },
          api(name, json) {
            calls.push(name);
            setTimeout(() => {
              try { ok(JSON.stringify({ data: api[name](JSON.parse(json)) })); } catch (e) { ok(JSON.stringify({ error: e.message })); }
              void fail;
            }, 0);
          },
        };
        return r;
      };
      window.google = { script: { get run() { return runner(); } } };
      Object.defineProperty(window.navigator, 'language', { value: 'id-ID' });
    },
  });
  doc = dom.window.document;
  await until(() => view().includes('WARUNG BU SITI'), 'review screen');
});

describe('web app', () => {
  it('starts with a single server call', () => {
    expect(calls).toEqual(['init']);
  });

  it('opens on Review when something waits, with the unread email and recent automatic rows', () => {
    expect(view()).toContain('Perlu dicek');
    expect(doc.querySelectorAll('.txcard[data-id]')).toHaveLength(2);
    expect(doc.querySelector('#reviewCount').textContent).toBe('2');
    expect(view()).toContain('Email yang belum terbaca');
  });

  it('the bell counts what needs attention, lists it, and clears once seen', () => {
    // 2 rows to review (one notice), 1 unreadable email, Belanja Online 300k of a 200k budget
    expect(doc.querySelector('#bellCount').textContent).toBe('3');
    click(doc.querySelector('#bellBtn'));
    const items = [...doc.querySelectorAll('#modal .notif')];
    expect(items.map((n) => n.querySelector('b').textContent)).toEqual([
      '2 transaksi menunggu dicek', 'Email bank belum terbaca', 'Budget Belanja Online terlampaui',
    ]);
    expect(items.every((n) => n.classList.contains('new'))).toBe(true);
    expect(doc.querySelector('#bellCount').hidden).toBe(true);
    click(doc.querySelector('#modal [data-action=close]'));
    click(doc.querySelector('#bellBtn'));
    expect(doc.querySelectorAll('#modal .notif.new')).toHaveLength(0); // seen now
    click(doc.querySelector('#modal [data-action=close]'));
  });

  it('the theme button switches between light and dark and remembers it', () => {
    const html = doc.documentElement;
    click(doc.querySelector('#themeBtn'));
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(dom.window.localStorage.getItem('cashflow.theme.v1')).toBe('dark');
    expect(doc.querySelector('#themeBtn').getAttribute('aria-label')).toBe('Ganti ke mode terang');
    click(doc.querySelector('#themeBtn'));
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(view()).toContain('no amount found');
    expect(view()).toContain('Tokopedia');
  });

  it('saving without a category shows the problem under the field and sends nothing', () => {
    const card = doc.querySelector('.txcard[data-id="t1"]');
    const before = calls.length;
    click(card.querySelector('[data-action=approve]'));
    expect(card.querySelector('.field .msg').textContent).toBe('Pilih kategori dulu.');
    expect(calls.length).toBe(before);
  });

  it('approving with "always" leaves the screen at once, then saves the row, the rule and the other row of that merchant', async () => {
    const card = doc.querySelector('.txcard[data-id="t1"]');
    card.querySelector('[data-field=category]').value = 'fnb';
    click(card.querySelector('[data-action=approve]'));
    // On screen right away, before Google answers: both cards of that merchant go.
    expect(card.classList.contains('leaving')).toBe(true);
    expect(doc.querySelector('.txcard[data-id="t2"]').classList.contains('leaving')).toBe(true);
    expect(doc.querySelector('#reviewCount').hidden).toBe(true);
    expect(doc.querySelector('#toast').textContent).toContain('plus 1 transaksi lain');
    await until(() => status('t2') === 'approved', 'approval');
    expect(store.t[TABS.transactions].find((r) => r.id === 't1')).toMatchObject({ status: 'approved', category: 'fnb' });
    expect(store.t[TABS.rules].at(-1)).toMatchObject({ pattern: 'WARUNG BU SITI', category: 'fnb' });
    await until(() => view().includes('Semua sudah dicek'), 'empty review');
  });

  it('undo puts both rows back, and approving again files them again', async () => {
    click(doc.querySelector('#toast [data-toast=undo]'));
    await until(() => doc.querySelectorAll('.txcard[data-id]').length === 2, 'cards back');
    await until(() => status('t1') === 'pending' && status('t2') === 'pending', 'restored on the server');
    const card = doc.querySelector('.txcard[data-id="t1"]');
    card.querySelector('[data-field=category]').value = 'fnb';
    click(card.querySelector('[data-action=approve]'));
    await until(() => status('t1') === 'approved' && status('t2') === 'approved', 'approved again');
    await until(() => view().includes('Semua sudah dicek'), 'empty review again');
  });

  it('dashboard shows the month, budget per day and budgets', async () => {
    await tab('dashboard', 'Budget per hari');
    expect(view()).toMatch(/Oktober 2026/);
    expect(view()).toContain('23 hari lagi');
    expect(view()).toContain('Belanja Online');
    expect(doc.querySelector('.bar i.over')).not.toBeNull(); // 300k of a 200k budget
    expect(view()).toContain('Lebih Rp100.000 dari budget Rp200.000'); // said in words, not only red
    expect(doc.querySelectorAll('.chart .m')).toHaveLength(2); // Sep and Oct (starts 1 Sep)
  });

  it('tapping a category opens its transactions, filtered', async () => {
    click(doc.querySelector('[data-action=drill][data-category="Belanja Online"]'));
    await until(() => view().includes('Tokopedia') && !view().includes('WARUNG'), 'drill-down');
    expect([...doc.querySelectorAll('.chip')].map((c) => c.textContent.trim())).toEqual(['Oktober 2026 ✕', 'Belanja Online ✕']);
  });

  it('transactions list filters by search', async () => {
    click(doc.querySelector('[data-action=resetfilters]'));
    await until(() => view().includes('WARUNG'), 'all transactions');
    const lists = calls.filter((c) => c === 'list').length;
    const q = doc.querySelector('[data-filter=q]');
    q.value = 'tokopedia';
    q.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await until(() => view().includes('Tokopedia') && !view().includes('WARUNG'), 'filtered list');
    expect(view()).toContain('1 transaksi');
    expect(calls.filter((c) => c === 'list').length).toBe(lists); // filtered here, no server call
  });

  it('editing a row changes it on screen at once and on the server', async () => {
    click(doc.querySelector('.trow[data-id="t3"]'));
    const form = doc.querySelector('form[data-form=edit]');
    form.querySelector('[name=amount]').value = '320000';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(doc.querySelector('#modal').classList.contains('open')).toBe(false);
    expect(view()).toContain('Rp320.000');
    await until(() => store.t[TABS.transactions].find((r) => r.id === 't3').amount === 320000, 'update saved');
  });

  it('splits a transaction into two categories, then joins it back', async () => {
    await until(() => calls.filter((c) => c === 'update').length && !doc.querySelector('#stale.show:not(.done)'), 'queue empty');
    click(doc.querySelector('.trow[data-id="t3"]'));
    click(doc.querySelector('[data-action=splitopen]'));
    const rows = doc.querySelectorAll('.split-row');
    expect(rows).toHaveLength(2);
    rows[0].querySelector('[data-s=amount]').value = '200000';
    rows[1].querySelector('[data-s=amount]').value = '100000';
    rows[1].querySelector('[data-s=category]').value = 'fnb';
    rows[1].querySelector('[data-s=amount]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(doc.querySelector('#splitLeft').textContent).toBe('Masih Rp20.000 belum dibagi'); // 320.000 - 300.000, said in words
    const form = doc.querySelector('form[data-form=split]');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(store.t[TABS.transactions].some((r) => r.id === 't3_s1')).toBe(false); // nothing sent while it doesn't add up
    rows[1].querySelector('[data-s=amount]').value = '120000';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    expect(doc.querySelector('#modal').classList.contains('open')).toBe(false);
    await until(() => store.t[TABS.transactions].some((r) => r.id === 't3_s1'), 'split saved');
    expect(store.t[TABS.transactions].find((r) => r.id === 't3')).toMatchObject({ amount: 200000, category: 'Belanja Online' });
    expect(store.t[TABS.transactions].find((r) => r.id === 't3_s1')).toMatchObject({ amount: 120000, category: 'fnb', ref_no: 'split:t3' });
    await until(() => view().includes('Rp120.000'), 'part on screen');

    click(doc.querySelector('.trow[data-id="t3"]'));
    expect(doc.querySelector('#splitBox').textContent).toContain('Dibagi menjadi 2 bagian');
    click(doc.querySelector('[data-action=unsplit]'));
    await until(() => !store.t[TABS.transactions].some((r) => r.id === 't3_s1'), 'joined back');
    expect(store.t[TABS.transactions].find((r) => r.id === 't3').amount).toBe(320000);
  });

  it('a category filter shows that category\'s monthly trend', async () => {
    const sel = doc.querySelector('[data-filter=category]');
    sel.value = 'Belanja Online';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await until(() => view().includes('Tren 6 bulan: Belanja Online'), 'trend');
    expect(doc.querySelectorAll('.hbar-row')).toHaveLength(2); // Sep and Oct (starts 1 Sep)
    expect(doc.querySelector('.trend-card').textContent).toContain('Rp320.000');
  });

  it('adds a cash expense', async () => {
    await tab('add', 'Simpan transaksi');
    const form = doc.querySelector('form[data-form=add]');
    form.querySelector('[name=amount]').value = '15000';
    form.querySelector('[name=category]').value = 'fnb';
    form.querySelector('[name=stream]').value = 'Cash';
    form.querySelector('[name=description]').value = 'kopi';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.t[TABS.transactions].some((r) => r.description === 'kopi'), 'manual row');
    expect(store.t[TABS.transactions].find((r) => r.description === 'kopi')).toMatchObject({ amount: 15000, stream: 'Cash', category: 'fnb', source: 'manual', status: 'approved' });
  });

  it('warns before saving what looks recorded already, and saves only when asked', async () => {
    await until(() => calls.filter((c) => c === 'add').length === 1 && !doc.querySelector('#stale.show:not(.done)'), 'first add done');
    const lists = calls.filter((c) => c === 'list').length;
    await tab('add', 'Simpan transaksi'); // the Add screen refreshes the list (now with the cash expense) for this check
    await until(() => calls.filter((c) => c === 'list').length > lists, 'list refreshed');
    await tick(); await tick();
    const form = doc.querySelector('form[data-form=add]');
    const fill = (stream, name) => {
      form.querySelector('[name=amount]').value = '15000';
      form.querySelector('[name=category]').value = 'fnb';
      form.querySelector('[name=stream]').value = stream;
      form.querySelector('[name=description]').value = name;
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    };
    fill('Cash', 'kopi lagi');
    expect(doc.querySelector('.dup-warning').textContent).toContain('Mungkin sudah tercatat');
    expect(doc.querySelector('.dup-warning').textContent).toContain('kopi');
    click(doc.querySelector('[data-action=dupcancel]'));
    expect(doc.querySelector('.dup-warning')).toBeNull();
    fill('BCA', 'parkir');
    expect(doc.querySelector('.dup-warning')).not.toBeNull();
    click(doc.querySelector('[data-action=dupsave]'));
    await until(() => store.t[TABS.transactions].some((r) => r.description === 'parkir'), 'saved anyway');
    expect(store.t[TABS.transactions].some((r) => r.description === 'kopi lagi')).toBe(false);
  });

  it('settings: month-end check posts an adjustment', async () => {
    await tab('settings', 'Cek saldo akhir bulan');
    const form = doc.querySelector('form[data-form=monthend]');
    form.querySelector('[name=stream]').value = 'Cash';
    form.querySelector('[name=actual]').value = '20000'; // app: 50000 - 15000 = 35000
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.t[TABS.transactions].some((r) => r.category === 'Penyesuaian'), 'adjustment');
    expect(store.t[TABS.transactions].find((r) => r.category === 'Penyesuaian')).toMatchObject({ stream: 'Cash', direction: 'out', amount: 15000 });
  });

  it('rules can be edited and show which transactions they match', async () => {
    await until(() => doc.querySelector('.rule .rule-preview') && /Cocok dengan/.test(doc.querySelector('.rule .rule-preview').textContent), 'rule preview');
    expect(doc.querySelector('.rule .rule-preview').textContent).toContain('Tokopedia');
    click(doc.querySelector('[data-action=addrule]'));
    const rules = doc.querySelectorAll('.rule');
    const added = rules[rules.length - 1];
    const pattern = added.querySelector('[data-r=pattern]');
    pattern.value = 'kopi';
    pattern.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    // The list may still be refreshing (the cash expense was just added): the preview redraws when it arrives.
    await until(() => added.querySelector('.rule-preview').textContent === 'Cocok dengan 1 transaksi, misalnya: kopi', 'kopi preview');
    added.querySelector('[data-r=category]').value = 'fnb';
    added.closest('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.t[TABS.rules].some((r) => r.pattern === 'kopi'), 'rule saved');
    expect(store.t[TABS.rules].find((r) => r.pattern === 'kopi')).toMatchObject({ category: 'fnb', auto_approve: true });
    expect(store.t[TABS.rules].find((r) => r.id === 'r1')).toMatchObject({ pattern: 'TOKOPEDIA', hits: 3 }); // the others keep their counts
  });

  it('the weekly summary can be switched off', async () => {
    const form = doc.querySelector('form[data-form=weekly]');
    expect(form.querySelector('[name=weekly_email]').checked).toBe(true);
    form.querySelector('[name=weekly_email]').checked = false;
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => store.cfg.weekly_email === 'off', 'weekly off');
  });

  it('switching the language to English relabels the app', async () => {
    const form = doc.querySelector('form[data-form=config]');
    form.querySelector('[name=language]').value = 'en';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => doc.querySelector('.nav [data-tab=review] b').textContent === 'Review', 'english tabs');
    expect(store.cfg.language).toBe('en');
    await until(() => view().includes('Month-end balance check'), 'english settings');
  });

  it('a second visit paints from the phone cache before the server answers', async () => {
    const cached = dom.window.localStorage.getItem('cashflow.init.v1');
    expect(cached).toBeTruthy();
    let answer;
    const second = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
      beforeParse(window) {
        window.localStorage.setItem('cashflow.init.v1', cached);
        const r = { withSuccessHandler(f) { answer = f; return r; }, withFailureHandler() { return r; }, api() { /* server is slow: never answers in this test */ } };
        window.google = { script: { get run() { return r; } } };
      },
    });
    const d2 = second.window.document;
    for (let i = 0; i < 200 && !d2.querySelector('#view .card, #view .kpis'); i += 1) await new Promise((res) => setTimeout(res, 5));
    expect(d2.querySelector('#view .card, #view .kpis')).not.toBeNull(); // painted from cache
    expect(d2.querySelector('#stale').className).toContain('show'); // and says it is updating
    for (let i = 0; i < 200 && typeof answer !== 'function'; i += 1) await new Promise((res) => setTimeout(res, 5));
    expect(typeof answer).toBe('function'); // and still asks the server for fresh data
    second.window.close();
  });

  it('a first visit paints from the snapshot built into the page, without waiting for the server', async () => {
    const withInit = html.replace('window.__INIT__=null;', () => `window.__INIT__=${JSON.stringify(api.init()).replace(/</g, '\\u003c')};`);
    const third = new JSDOM(withInit, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
      beforeParse(window) {
        const r = { withSuccessHandler() { return r; }, withFailureHandler() { return r; }, api() { /* never answers */ } };
        window.google = { script: { get run() { return r; } } };
      },
    });
    const d3 = third.window.document;
    for (let i = 0; i < 200 && !d3.querySelector('#view .card, #view .kpis'); i += 1) await new Promise((res) => setTimeout(res, 5));
    expect(d3.querySelector('#view .card, #view .kpis')).not.toBeNull();
    third.window.close();
  });

  it('without any data it counts the seconds instead of sitting on "Loading"', async () => {
    const fourth = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.invalid/',
      beforeParse(window) {
        const r = { withSuccessHandler() { return r; }, withFailureHandler() { return r; }, api() { /* never answers */ } };
        window.google = { script: { get run() { return r; } } };
      },
    });
    const d4 = fourth.window.document;
    for (let i = 0; i < 200 && !/\d+s/.test(d4.querySelector('#view').textContent); i += 1) await new Promise((res) => setTimeout(res, 5));
    expect(d4.querySelector('#view').textContent).toMatch(/Memuat… \d+s/);
    fourth.window.close();
  });

  it('the page has no references to outside scripts or styles', async () => {
    const html = await buildUiHtml();
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    await tick();
  });
});
