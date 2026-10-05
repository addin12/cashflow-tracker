import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { categoryCellFormula, ledgerFormula, setupSlotFormulas, templatePatches, isOpenEnded } from '../src/core/formulas.js';

const patches = templatePatches();
const byCell = (sheet, cell) => patches.find((p) => p.op === 'formula' && p.sheet === sheet && p.cell === cell);

/** "L5:W10" -> { rows: 6, cols: 12 } */
function size(range) {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const n = (s) => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
  return { rows: Number(m[4]) - Number(m[2]) + 1, cols: n(m[3]) - n(m[1]) + 1 };
}

describe('generated formulas', () => {
  it('sums a category by real date range, not TEXT(date,"mmm")', () => {
    const f = categoryCellFormula(5, 'L', 'G');
    expect(f).toBe('=IF(OR($K5="",$K5="-"),0,LET(m,MATCH(L$1,{"JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"},0),SUMIFS($G$6:$G,$C$6:$C,$K5,$B$6:$B,">="&DATE(Setup!$D$3,m,1),$B$6:$B,"<"&DATE(Setup!$D$3,m+1,1))))');
    expect(f).not.toMatch(/TEXT\(/);
  });

  it('every SUMIFS uses fully anchored, open-ended columns', () => {
    for (const p of templatePatches().filter((x) => x.op === 'formulas')) {
      for (const f of p.formulas.flat().filter((x) => x.includes('SUMIFS('))) {
        expect(f).toMatch(/SUMIFS\(\$[GH]\$6:\$[GH],\$[CD]\$6:\$[CD],/);
      }
    }
  });

  it('ledger keeps only approved rows of the Setup year and maps in/out to Debit/Credit', () => {
    const f = ledgerFormula();
    expect(f).toContain('(Transactions!P2:P="approved")*(YEAR(Transactions!B2:B)=Setup!$D$3)');
    expect(f).toContain('IF(Transactions!F2:F="in",Transactions!G2:G,"")');
    expect(f).toContain('IF(Transactions!F2:F="out",Transactions!G2:G,"")');
    expect(f.match(/\{/g)).toHaveLength(1);
  });

  it('fills 8 account slots for spending and saving', () => {
    const rows = setupSlotFormulas();
    expect(rows).toHaveLength(8);
    expect(rows[7][2]).toBe('=IFERROR(INDEX(FILTER(Accounts!$A$2:$A,Accounts!$B$2:$B="Saving"),8),"-")');
  });
});

describe('template patches', () => {
  it('2-D formulas/values match their range size', () => {
    for (const p of patches.filter((x) => x.op === 'formulas' || x.op === 'values')) {
      const data = p.formulas || p.values;
      const { rows, cols } = size(p.range);
      expect([p.range, data.length, data[0].length]).toEqual([p.range, rows, cols]);
    }
  });

  it('only clears ranges that are explicitly listed', () => {
    const cleared = patches.filter((p) => p.op === 'clear').map((p) => `${p.sheet}!${p.range}`);
    expect(cleared).toEqual(['CASHFLOW!B5:B5', 'CASHFLOW!B6:H', 'rawdata!S1:W']);
    expect(isOpenEnded('B6:H')).toBe(true);
    expect(isOpenEnded('B6:H10')).toBe(false);
  });

  it('fixes the totals that skipped rows', () => {
    expect(byCell('BUDGET TRACKER', 'E35').formula).toBe('=SUM(E29:E34)');
    expect(byCell('BUDGET TRACKER', 'J37').formula).toBe('=SUM(J29:J36)');
    expect(byCell('BUDGET TRACKER', 'L37').formula).toBe('=SUM(L29:L36)');
    expect(byCell('BUDGET TRACKER', 'H57').formula).toBe('=SUM(H29:H56)');
    expect(byCell('FINAL STATEMENT', 'S14').formula).toBe('=SUM(S6:S13)');
    expect(byCell('FINAL STATEMENT', 'U14').formula).toBe('=SUM(U6:U13)');
  });

  it('fixes Q3/Q4 income rows that read one row too low, and every quarter income total', () => {
    expect(byCell('QUARTER REPORT', 'AA11').formula).toBe('=SUM(CASHFLOW!R7:T7)');
    expect(byCell('QUARTER REPORT', 'AA14').formula).toBe('=SUM(CASHFLOW!R10:T10)');
    expect(byCell('QUARTER REPORT', 'AL11').formula).toBe('=SUM(CASHFLOW!U7:W7)');
    expect(byCell('QUARTER REPORT', 'AL14').formula).toBe('=SUM(CASHFLOW!U10:W10)');
    for (const c of ['E', 'P', 'AA', 'AL']) expect(byCell('QUARTER REPORT', `${c}15`).formula).toBe(`=SUM(${c}9:${c}14)`);
  });

  it('replaces the hard-coded payday', () => {
    expect(byCell('CASHFLOW', 'Y52').formula).toMatch(/CFG_PAYDAY/);
  });
});

// Checks against the real template file, when it is present locally (it is git-ignored).
const TEMPLATE = new URL('../template/Template Cashflow 2025, V.1.xlsx', import.meta.url);
describe.skipIf(!existsSync(TEMPLATE))('patches against the template file', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(decodeURIComponent(TEMPLATE.pathname.replace(/^\/([A-Za-z]:)/, '$1')));

  const cells = [];
  for (const p of patches) {
    if (p.op === 'formula') cells.push([p.sheet, p.cell, p]);
    if (p.op === 'listValidation') p.cells.forEach((c) => cells.push([p.sheet, c, p]));
    if (p.op === 'formulas' || p.op === 'values') cells.push([p.sheet, p.range.split(':')[0], p]);
  }

  it('every patched sheet exists', () => {
    for (const [sheet] of cells) expect(wb.getWorksheet(sheet), sheet).toBeTruthy();
  });

  it('no patch writes into the hidden part of a merged cell', () => {
    for (const [sheet, cell] of cells) {
      const c = wb.getWorksheet(sheet).getCell(cell);
      expect(!c.isMerged || c.master === c, `${sheet}!${cell} is inside a merge`).toBe(true);
    }
  });

  it('single-cell formula fixes replace an existing formula, never a label', () => {
    for (const [sheet, cell, p] of cells.filter(([, , x]) => x.op === 'formula' && !x.replacesValue)) {
      const v = wb.getWorksheet(sheet).getCell(cell).value;
      expect(v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v), `${sheet}!${cell} (${p.why})`).toBe(true);
    }
  });

  it('only the two marked cells replace a plain value', () => {
    expect(patches.filter((p) => p.replacesValue).map((p) => `${p.sheet}!${p.cell}`)).toEqual(['CASHFLOW!B6', 'CASHFLOW!Y52']);
  });

  it('month headers are JAN..DEC in L1:W1, as the formulas expect', () => {
    const ws = wb.getWorksheet('CASHFLOW');
    const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    ['L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'].forEach((col, i) => expect(ws.getCell(`${col}1`).value).toBe(names[i]));
  });

  it('category formulas sum the right amount column (income G, expense H) like the originals', () => {
    const ws = wb.getWorksheet('CASHFLOW');
    const orig = (r) => { const v = ws.getCell(`L${r}`).value; return v.formula || ''; };
    for (let r = 5; r <= 10; r += 1) expect(orig(r)).toMatch(/\$G\$6/);
    for (let r = 11; r <= 40; r += 1) expect(orig(r)).toMatch(/\$H\$6/);
  });
});
