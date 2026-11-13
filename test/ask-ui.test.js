// "Tanya apa saja" on the screen: the card on Ikhtisar, the four buttons, a typed question, an answer with its button to the rows, and a question nobody understands.
import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildUiHtml } from '../scripts/ui-build.mjs';
import { createApi } from '../src/core/api.js';
import { TABS } from '../src/core/schema.js';
import { buildCategorySlots } from '../src/core/categories.js';

function memoryStore() {
  const t = {
    [TABS.transactions]: [
      { id: 't1', date: '2026-11-04', time: '09:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 25000, category: '', description: 'WARUNG BU SITI', details: 'QRIS', status: 'pending', source: 'email' },
      { id: 't2', date: '2026-11-05', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 50000, category: 'fnb', description: 'BAKSO', details: '', status: 'approved', source: 'manual' },
      { id: 't3', date: '2026-11-06', time: '10:00:00', owner: 'Me', stream: 'BCA', direction: 'out', amount: 30000, category: 'Transport', description: 'GOJEK', details: '', status: 'approved', source: 'manual' },
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

let dom; let doc;
async function until(fn, what, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end;) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); }
  if (!fn()) throw new Error(`timed out waiting for ${what}`);
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const ask = async (text) => {
  const input = doc.querySelector('#askIn');
  input.value = text;
  input.form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelector('#askOut .ask-ans'), `answer to "${text}"`);
};

beforeAll(async () => {
  const api = createApi(memoryStore(), { now: () => new Date(2026, 10, 10, 10, 0, 0), sync: () => ({ added: 0 }), sheetUrl: 'https://example.invalid/sheet', meName: 'Me' });
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
  click(doc.querySelector('.nav [data-tab=dashboard]'));
  await until(() => doc.querySelector('#view .ask'), 'the question card on Ikhtisar');
}, 20000);

describe('the question card', () => {
  it('has a label above the box, the four buttons, and nothing answered yet', () => {
    const card = doc.querySelector('.ask');
    expect(card.querySelector('label[for=askIn]').textContent).toBe('Tanya apa saja');
    expect(card.querySelector('#askIn').getAttribute('placeholder')).toMatch(/bulan ini/);
    expect([...card.querySelectorAll('.ask-chips .chip')].map((b) => b.textContent)).toEqual(['Tinjau minggu ini', 'Ke mana uangnya?', 'Cek langganan', 'Tagihan minggu ini']);
    expect(card.querySelector('#askOut').children.length).toBe(0);
    expect(card.querySelector('#askOut').getAttribute('aria-live')).toBe('polite');
  });

  it('a typed question is answered from the rows, with a button to the transactions behind it', async () => {
    await ask('berapa pengeluaran bulan ini');
    const out = doc.querySelector('#askOut');
    expect(out.querySelector('.ask-head').textContent).toBe('Pengeluaran');
    expect(out.querySelector('.ask-big').textContent).toContain('80.000'); // BAKSO 50.000 + GOJEK 30.000; the pending row is not counted
    expect(out.textContent).toContain('2 transaksi');
    expect(out.querySelector('[data-action=askdrill]')).not.toBeNull();
  });

  it('a button asks its own sentence and shows it in the box', async () => {
    click([...doc.querySelectorAll('.ask-chips .chip')].find((b) => b.textContent === 'Ke mana uangnya?'));
    await until(() => /Ke mana uangnya/.test(doc.querySelector('#askOut .ask-head')?.textContent || ''), 'the where-did-it-go answer');
    expect(doc.querySelector('#askIn').value).toBe('Ke mana uangnya?');
    expect(doc.querySelector('#askOut').textContent).toContain('fnb');
    expect(doc.querySelector('#askOut').textContent).toContain('63%'); // 50.000 of 80.000 is 62.5%
  });

  it('a question nobody understands says so and offers examples that can be tapped', async () => {
    await ask('ceritakan lelucon');
    const out = doc.querySelector('#askOut');
    expect(out.textContent).toContain('belum paham');
    const examples = out.querySelectorAll('.chip');
    expect(examples).toHaveLength(3);
    click(examples[1]);
    await until(() => /Grab/.test(doc.querySelector('#askIn').value) && doc.querySelector('#askOut .ask-head'), 'the example answered');
    expect(doc.querySelector('#askOut .ask-head').textContent).toBe('Pengeluaran');
  });

  it('"Lihat transaksi" opens Transaksi with the same period and kind', async () => {
    await ask('berapa pengeluaran bulan ini');
    click(doc.querySelector('[data-action=askdrill]'));
    await until(() => doc.querySelector('#view .trow'), 'the transactions list');
    expect(doc.querySelector('#view h1').textContent).toBe('Transaksi');
    expect(doc.querySelectorAll('#view .trow').length).toBeGreaterThanOrEqual(2);
  });

  it('is also there in English', async () => {
    const { STRINGS } = await import('../src/ui/i18n.js');
    expect(STRINGS.en.askTitle).toBe('Ask anything');
    expect(STRINGS.en.askUp('Rp1', 5)).toContain('more');
    expect(STRINGS.id.askUp('Rp1', 5)).toContain('lebih banyak');
  });
});
