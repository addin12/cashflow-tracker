// Auto-categorization rules (Rules tab). A rule's pattern is a case-insensitive regular
// expression tested against the row's description (field "description"), details ("details")
// or both ("any"). Rules are checked top-down; the first match wins.

export function compileRule(rule) {
  try {
    return { ...rule, re: new RegExp(rule.pattern, 'i') };
  } catch (e) {
    return { ...rule, re: null, error: `invalid pattern: ${e.message}` };
  }
}

const truthy = (v) => v === true || /^(true|ya|yes|1|✓)$/i.test(String(v).trim());

/** @returns {object|null} the first matching rule (with `autoApprove` as a boolean) */
export function matchRule(row, rules) {
  for (const r of rules) {
    const c = r.re !== undefined ? r : compileRule(r);
    if (!c.re || !c.category) continue;
    const field = String(c.field || 'description').toLowerCase();
    const text = field === 'details' ? row.details : field === 'any' ? `${row.description} ${row.details}` : row.description;
    if (c.re.test(String(text || ''))) return { ...c, autoApprove: truthy(c.auto_approve) };
  }
  return null;
}

/** Escapes text so a rule made from "CIRCLE K (JKT)" matches it literally. */
export function literalPattern(text) {
  return String(text).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
