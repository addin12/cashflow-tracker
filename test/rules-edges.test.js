// Edges of the categorisation rules that a mutation run (Stryker, 2026-11-09) showed nothing was checking.
import { describe, expect, it } from 'vitest';
import { compileRule, literalPattern, matchRule, ruleUpdates } from '../src/core/rules.js';

const rule = (o) => ({ id: 'r1', pattern: 'kopi', category: 'Makan', ...o });

describe('compileRule', () => {
  it('keeps the rule, and says what is wrong with a pattern that is not a regular expression', () => {
    const c = compileRule(rule({ pattern: '(' }));
    expect(c.re).toBeNull();
    expect(c.error).toMatch(/^invalid pattern: /);
    expect(c).toMatchObject({ id: 'r1', category: 'Makan' });
    expect(compileRule(rule()).re.test('KOPI')).toBe(true); // case does not matter
  });
});

describe('matchRule: which field is tested', () => {
  const row = { description: 'warung', details: 'kopi susu' };
  it('the description unless the rule says otherwise (also when the field is empty)', () => {
    expect(matchRule(row, [rule()])).toBeNull();
    expect(matchRule(row, [rule({ field: '' })])).toBeNull();
    expect(matchRule({ description: 'kopi', details: '' }, [rule({ field: '' })])).not.toBeNull();
  });
  it('the details alone ("details", any letter case)', () => {
    expect(matchRule(row, [rule({ field: 'details' })])).not.toBeNull();
    expect(matchRule(row, [rule({ field: 'DETAILS' })])).not.toBeNull();
    expect(matchRule({ description: 'kopi', details: 'x' }, [rule({ field: 'details' })])).toBeNull();
  });
  it('both ("any"), and a missing field is nothing, not the word "undefined"', () => {
    expect(matchRule(row, [rule({ field: 'any' })])).not.toBeNull();
    expect(matchRule({ description: 'kopi' }, [rule({ field: 'any' })])).not.toBeNull();
    expect(matchRule({ description: 'x' }, [rule({ pattern: 'undefined', field: 'details' })])).toBeNull();
  });
  it('skips a rule with a broken pattern or no category, uses a rule that is already compiled, first match wins', () => {
    const rules = [rule({ id: 'bad', pattern: '(' }), rule({ id: 'nocat', category: '' }), rule({ id: 'first', category: 'A' }), rule({ id: 'second', category: 'B' })];
    expect(matchRule({ description: 'kopi' }, rules).id).toBe('first');
    expect(matchRule({ description: 'kopi' }, [{ ...rule(), re: null }])).toBeNull(); // compiled already, and broken
  });
});

describe('matchRule: autoApprove', () => {
  const approves = (v) => matchRule({ description: 'kopi' }, [rule({ auto_approve: v })]).autoApprove;
  it('true for true, ya, yes, 1 and the tick, in any case and with spaces around', () => {
    for (const v of [true, 'true', ' TRUE ', 'ya', 'Yes', '1', '✓']) expect(approves(v), String(v)).toBe(true);
  });
  it('false for anything else, including words that merely contain one of them', () => {
    for (const v of [false, '', 'no', 'xtrue', 'truex', 'yes please', '11', undefined]) expect(approves(v), String(v)).toBe(false);
  });
});

describe('literalPattern', () => {
  it('trims, and escapes everything that means something in a regular expression', () => {
    expect(literalPattern('  CIRCLE K (JKT) ')).toBe('CIRCLE K \\(JKT\\)');
    expect(literalPattern('a.b*c?')).toBe('a\\.b\\*c\\?');
    expect(literalPattern(5)).toBe('5');
    expect(new RegExp(literalPattern('a.b')).test('axb')).toBe(false);
  });
});

describe('ruleUpdates', () => {
  const pending = (o) => ({ id: 'x1', status: 'pending', stream: 'BCA', category: '', description: 'kopi', details: '', rule_id: '', ...o });
  it('an uncategorised row takes the category and the rule id; it is approved only when the rule auto-approves', () => {
    expect(ruleUpdates([pending()], [rule({ auto_approve: 'ya' })])).toEqual([{ id: 'x1', changes: { category: 'Makan', rule_id: 'r1', status: 'approved' } }]);
    expect(ruleUpdates([pending()], [rule({ auto_approve: 'no' })])).toEqual([{ id: 'x1', changes: { category: 'Makan', rule_id: 'r1' } }]);
  });
  it('a categorised row is approved by the rule it came from, and by nothing else', () => {
    const rules = [rule({ id: 7, auto_approve: 'ya' })];
    expect(ruleUpdates([pending({ category: 'Makan', rule_id: '7' })], rules)).toEqual([{ id: 'x1', changes: { status: 'approved' } }]);
    expect(ruleUpdates([pending({ category: 'Makan', rule_id: 'other' })], rules)).toEqual([]);
    expect(ruleUpdates([pending({ category: 'Makan', rule_id: '7' })], [rule({ id: 7, auto_approve: 'no' })])).toEqual([]);
  });
  it('the fee row of a payment, made with its category, is approved without a rule', () => {
    expect(ruleUpdates([pending({ id: 'm1_fee', category: 'Biaya Admin' })], [])).toEqual([{ id: 'm1_fee', changes: { status: 'approved' } }]);
    expect(ruleUpdates([pending({ id: 'm1', category: 'Biaya Admin' })], [])).toEqual([]);
  });
  it('leaves alone rows that are not pending, have no account, or match nothing', () => {
    const rules = [rule({ auto_approve: 'ya' })];
    expect(ruleUpdates([pending({ status: 'approved' }), pending({ stream: '' }), pending({ description: 'bensin' })], rules)).toEqual([]);
  });
});
