// Round 11: bank statement import, yearly report, top places, money flow, changing many rows.
import { describe, expect, it } from 'vitest';
import { parseCsv, parseAmount, parseDate, parseStatement, matchStatement } from '../src/core/statement.js';
import { topPlaces, biggestExpenses, moneyFlow } from '../src/core/insights.js';
import { createApi } from '../src/core/api.js';
import { buildCategorySlots } from '../src/core/categories.js';
import { TABS } from '../src/core/schema.js';

// A KlikBCA "mutasi rekening" export, made up (names and numbers are not real).
const KLIKBCA = [
  'No. rekening : 0123456789', 'Nama : BUDI SANTOSO', 'Periode : 01/09/2026 - 30/09/2026', 'Kode Mata Uang : Rp', '',
  'Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo',
  '\'01/09,TRSF E-BANKING CR 0109/FTSCY/WS95051 1500000.00 BUDI SANTOSO,\'0000,"1,500,000.00",CR,"11,500,000.00"',
  '\'02/09,KARTU DEBIT ALFAMART ,\'0000,"25,000.00",DB,"11,475,000.00"',
  'PEND,TRANSAKSI TERTUNDA,\'0000,"10,000.00",DB,"11,465,000.00"',
  '\'28/09,TRSF E-BANKING CR 2809/FTSCY/WS95031 GAJI PT CONTOH,\'0000,"12,204,471.00",CR,"23,669,471.00"',
  '\'30/09,BIAYA ADM,\'0000,"10,000.00",DB,"23,659,471.00"', '',
  'Saldo Awal,"10,000,000.00"', 'Mutasi Kredit,"13,704,471.00",2', 'Mutasi Debet,"35,000.00",2', 'Saldo Akhir,"23,659,471.00"',
].join('\r\n');

describe('reading a statement', () => {
  it('KlikBCA: DD/MM dates with the year from "Periode", DB/CR amounts, pending rows and totals left out', () => {
    const r = parseStatement(KLIKBCA);
    expect(r.format).toBe('klikbca');
    expect(r.skipped).toBe(1); // PEND
    expect(r.rows).toEqual([
      { date: '2026-09-01', description: 'TRSF E-BANKING CR 0109/FTSCY/WS95051 1500000.00 BUDI SANTOSO', amount: 1500000, direction: 'in' },
      { date: '2026-09-02', description: 'KARTU DEBIT ALFAMART', amount: 25000, direction: 'out' },
      { date: '2026-09-28', description: 'TRSF E-BANKING CR 2809/FTSCY/WS95031 GAJI PT CONTOH', amount: 12204471, direction: 'in' },
      { date: '2026-09-30', description: 'BIAYA ADM', amount: 10000, direction: 'out' },
    ]);
  });

  it('a statement over New Year puts December and January in the right years', () => {
    const text = 'Periode : 15/12/2026 - 14/01/2027\nTanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo\n\'20/12,A,\'0000,"1,000.00",DB,"0"\n\'05/01,B,\'0000,"2,000.00",CR,"0"';
    expect(parseStatement(text).rows.map((x) => x.date)).toEqual(['2026-12-20', '2027-01-05']);
  });

  it('other CSVs: debit/credit columns, a signed amount, or an amount with a type column; ; or , separated', () => {
    expect(parseStatement('Tanggal;Keterangan;Debit;Kredit\n01/10/2026;Kopi;25.000;\n02/10/2026;Refund;;150.000,50').rows).toEqual([
      { date: '2026-10-01', description: 'Kopi', amount: 25000, direction: 'out' },
      { date: '2026-10-02', description: 'Refund', amount: 150000.5, direction: 'in' },
    ]);
    expect(parseStatement('Date,Description,Amount\n2026-10-03,"Toko ""Baru""",-45000\n2026-10-04,Gaji,9000000').rows.map((x) => [x.description, x.direction, x.amount]))
      .toEqual([['Toko "Baru"', 'out', 45000], ['Gaji', 'in', 9000000]]);
    expect(parseStatement('Tanggal,Deskripsi,Jumlah,Tipe\n5 Okt 2026,Parkir,5000,Pengeluaran').rows[0]).toEqual({ date: '2026-10-05', description: 'Parkir', amount: 5000, direction: 'out' });
    expect(() => parseStatement('hello,world\n1,2')).toThrow(/no transaction table/);
  });

  it('amounts and dates in Indonesian and English styles', () => {
    expect([parseAmount('1,500,000.00'), parseAmount('1.500.000,00'), parseAmount('Rp 25.000'), parseAmount('25,50'), parseAmount('-1.250'), parseAmount('abc')])
      .toEqual([1500000, 1500000, 25000, 25.5, -1250, NaN]);
    expect([parseDate('\'01/09', 2026), parseDate('2026-9-1'), parseDate('31/12/26'), parseDate('7 Sep 2026'), parseDate('32/01/2026'), parseDate('PEND', 2026)])
      .toEqual(['2026-09-01', '2026-09-01', '2026-12-31', '2026-09-07', '', '']);
    expect(parseCsv('a,"b,c"\r\n"d ""e""",f')).toEqual([['a', 'b,c'], ['d "e"', 'f']]);
  });

  it('rows the app already has are found: same account and direction, same amount, within 2 days, each used once', () => {
    const existing = [
      { id: 's', stream: 'BCA', date: '2026-09-28', amount: 12204471, direction: 'in', status: 'approved' }, // salary typed in
      { id: 'a', stream: 'BCA', date: '2026-09-03', amount: 25000, direction: 'out', status: 'approved' }, // booked a day later
      { id: 'x', stream: 'Mandiri', date: '2026-09-30', amount: 10000, direction: 'out', status: 'approved' }, // other account
    ];
    const m = matchStatement(parseStatement(KLIKBCA).rows, existing, { stream: 'BCA' });
    expect(m.map((r) => r.matchId)).toEqual(['', 'a', 's', '']);
    const twice = matchStatement([{ date: '2026-09-02', amount: 25000, direction: 'out' }, { date: '2026-09-02', amount: 25000, direction: 'out' }], existing, { stream: 'BCA' });
    expect(twice.map((r) => r.matchId)).toEqual(['a', '']);
  });
});

function memoryStore(cfgExtra = {}) {
  const t = {
    [TABS.transactions]: [
      { id: 'a', date: '2026-09-05', time: '10:00', direction: 'out', amount: 4200000, stream: 'blu', category: 'Hobi', status: 'approved', description: 'Toko Dadu' },
      { id: 'b', date: '2026-09-06', time: '09:00', direction: 'out', amount: 21500, stream: 'BCA', category: 'Makan', status: 'approved', description: 'CIRCLEKA INDONESIA' },
      { id: 'c', date: '2026-10-07', time: '09:00', direction: 'out', amount: 19000, stream: 'BCA', category: 'Makan', status: 'approved', description: 'CIRCLEKA INDONESIA 2' },
      { id: 'g', date: '2026-09-28', time: '', direction: 'in', amount: 12000000, stream: 'BCA', category: 'Gaji', status: 'approved', description: 'Gaji' },
      { id: 't1', date: '2026-09-29', time: '', direction: 'out', amount: 5000000, stream: 'BCA', category: 'Transfer ke Bank Lain', transfer_id: 'x1', status: 'approved', description: 'Ke Jago' },
      { id: 't2', date: '2026-09-29', time: '', direction: 'in', amount: 5000000, stream: 'Jago', category: 'Transfer ke Bank Lain', transfer_id: 'x1', status: 'approved', description: 'Dari BCA' },
      { id: 'p', date: '2026-10-08', time: '', direction: 'out', amount: 15000, stream: 'BCA', category: '', status: 'pending', description: 'PARKIR' },
    ],
    [TABS.accounts]: [
      { stream: 'BCA', type: 'Spending', owner: 'Me', opening_balance: -1167446 },
      { stream: 'blu', type: 'Spending', owner: 'Me', opening_balance: 5000000 },
      { stream: 'Jago', type: 'Saving', owner: 'Me', opening_balance: 0 },
    ],
    [TABS.goals]: [], [TABS.budgets]: [], [TABS.rules]: [], [TABS.inboxLog]: [], [TABS.connections]: [],
  };
  const cfg = { owner_name: 'Me', start_date: '2026-09-01', payday_day: 28, cat_transfer: 'Transfer ke Bank Lain', opening_checks: '{"BCA":"2026-10-06"}', ...cfgExtra };
  const slots = buildCategorySlots({ income: ['Gaji', 'Pemasukan Lainnya'], expense: ['Makan', 'Hobi', 'Biaya Admin'] }, ['Penyesuaian', 'Transfer ke Bank Lain']);
  return {
    t, cfg,
    read: (tab) => (t[tab] || []).map((r) => ({ ...r })),
    append: (tab, r) => { t[tab].push(...r.map((x) => ({ ...x }))); },
    update: (tab, list) => list.forEach(({ id, changes }) => Object.assign(t[tab].find((r) => r.id === id) || {}, changes)),
    remove: (tab, id) => { t[tab] = t[tab].filter((r) => r.id !== id); },
    replace: (tab, r) => { t[tab] = r.map((x) => ({ ...x })); },
    config: (k) => cfg[k] ?? '', setConfig: (k, v) => { cfg[k] = v; }, slots: () => slots, setSlots() {},
  };
}
const oct9 = () => new Date(2026, 9, 9, 16, 0);

describe('importing a statement', () => {
  it('adds the new rows, keeps today\'s balance for rows before the first check, and can be undone', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const before = api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance;
    const r = api.importStatement({ stream: 'BCA', file: 'mutasi.csv', rows: [
      { date: '2026-09-01', description: 'TRSF CR TEMAN', amount: 1500000, direction: 'in', category: 'Pemasukan Lainnya' },
      { date: '2026-09-30', description: 'BIAYA ADM', amount: 10000, direction: 'out', category: 'Biaya Admin' },
      { date: '2026-10-08', description: 'TRSF CR LAIN', amount: 200000, direction: 'in', category: '' }, // after the check, no category
    ] });
    expect(r).toMatchObject({ added: 3, pending: 1, openingChange: -1490000 });
    expect(store.t[TABS.accounts][0].opening_balance).toBe(-1167446 - 1490000);
    // Before the check: balance unchanged; the row after it counts once approved.
    expect(api.dashboard({}).balances.find((b) => b.stream === 'BCA').balance).toBe(before);
    expect(api.dashboard({ month: '2026-09' }).summary.income).toBe(12000000 + 1500000);
    expect(store.t[TABS.transactions].filter((x) => x.source === 'import').map((x) => x.status)).toEqual(['approved', 'approved', 'pending']);
    const [h] = api.settings().imports;
    expect(h).toMatchObject({ stream: 'BCA', file: 'mutasi.csv', count: 3, openingChange: -1490000 });
    api.undoImport({ batch: h.batch });
    expect(store.t[TABS.transactions].some((x) => x.source === 'import')).toBe(false);
    expect(store.t[TABS.accounts][0].opening_balance).toBe(-1167446);
    expect(api.settings().imports).toEqual([]);
  });

  it('bad rows stop the import before anything is saved', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const n = store.t[TABS.transactions].length;
    expect(() => api.importStatement({ stream: 'BCA', rows: [{ date: '2026-09-01', amount: 5, direction: 'in' }, { date: '1/9/26', amount: 5, direction: 'in' }] })).toThrow(/row 2: date/);
    expect(() => api.importStatement({ stream: 'BCA', rows: [{ date: '2026-09-01', amount: 5, direction: 'in', category: 'Nope' }] })).toThrow(/unknown category/);
    expect(() => api.importStatement({ stream: 'Nope', rows: [{ date: '2026-09-01', amount: 5, direction: 'in' }] })).toThrow(/choose an account/);
    expect(store.t[TABS.transactions]).toHaveLength(n);
  });
});

describe('reports', () => {
  it('top places group the same name; biggest expenses; the money flow', () => {
    const store = memoryStore();
    const rows = store.read(TABS.transactions);
    const cats = { income: ['Gaji'], expense: ['Makan', 'Hobi'] };
    const all = { from: '2026-09-01', to: '2026-10-31' };
    expect(topPlaces(rows, cats, all)).toEqual([
      { name: 'Toko Dadu', count: 1, total: 4200000, category: 'Hobi' },
      { name: 'CIRCLEKA INDONESIA', count: 2, total: 40500, category: 'Makan' },
    ]);
    expect(biggestExpenses(rows, cats, all, 1)[0]).toMatchObject({ id: 'a', amount: 4200000 });
    expect(moneyFlow(rows, cats, all, 'Transfer ke Bank Lain')).toEqual({
      income: [{ stream: 'BCA', amount: 12000000 }],
      spent: [{ stream: 'blu', amount: 4200000 }, { stream: 'BCA', amount: 40500 }],
      transfers: [{ from: 'BCA', to: 'Jago', amount: 5000000 }],
    });
  });

  it('the year month by month, and the month report carries places, biggest and flow', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    const y = api.yearly({ year: 2026 });
    expect(y.months).toHaveLength(12);
    expect(y.months[8]).toMatchObject({ month: '2026-09', income: 12000000, expense: 4221500, byCategory: { Hobi: 4200000, Makan: 21500 } });
    expect(y.places[0].name).toBe('Toko Dadu');
    const d = api.dashboard({ month: '2026-09' });
    expect(d.flow.transfers).toEqual([{ from: 'BCA', to: 'Jago', amount: 5000000 }]);
    expect(d.places.map((p) => p.name)).toEqual(['Toko Dadu', 'CIRCLEKA INDONESIA']);
  });
});

describe('changing many rows at once', () => {
  it('one category for all (approved), or ignore them; unknown ids stop it', () => {
    const store = memoryStore();
    const api = createApi(store, { now: oct9 });
    expect(api.updateMany({ ids: ['b', 'p'], category: 'Hobi' })).toEqual({ ok: true, changed: 2 });
    expect(store.t[TABS.transactions].filter((x) => ['b', 'p'].includes(x.id)).map((x) => [x.category, x.status])).toEqual([['Hobi', 'approved'], ['Hobi', 'approved']]);
    api.updateMany({ ids: ['c'], status: 'ignored' });
    expect(store.t[TABS.transactions].find((x) => x.id === 'c').status).toBe('ignored');
    expect(() => api.updateMany({ ids: ['zz'], category: 'Hobi' })).toThrow(/not found/);
    expect(() => api.updateMany({ ids: ['b'], category: 'Nope' })).toThrow(/unknown category/);
    expect(() => api.updateMany({ ids: [] })).toThrow(/at least one/);
  });
});
