// The seed is the first-run data: year, start date, payday, categories, accounts.
// The real one lives in private/seed.json (git-ignored); config/seed.example.json is the public sample.

import { buildCategorySlots, validateAccounts } from './categories.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws with every problem found; returns the seed with padded category slots. */
export function validateSeed(seed) {
  const errors = [];
  if (!seed || typeof seed !== 'object') throw new Error('seed must be an object');
  if (!Number.isInteger(seed.year) || seed.year < 2000 || seed.year > 2100) errors.push('year must be a 4-digit year');
  if (!DATE.test(seed.start_date || '')) errors.push('start_date must be YYYY-MM-DD');
  else if (Number(seed.start_date.slice(0, 4)) !== seed.year) errors.push('start_date must be in the seed year');
  if (!Number.isInteger(seed.payday_day) || seed.payday_day < 1 || seed.payday_day > 31) errors.push('payday_day must be 1..31');
  if (!seed.owner_name || typeof seed.owner_name !== 'string') errors.push('owner_name is required');
  let slots;
  try { slots = buildCategorySlots(seed.categories); } catch (e) { errors.push(e.message); }
  try { validateAccounts(seed.accounts); } catch (e) { errors.push(e.message); }
  const known = new Set([...(seed.categories?.income || []), ...(seed.categories?.expense || []), 'Penyesuaian', 'trf ke bank lain']);
  const defaults = { transfer: 'trf ke bank lain', fee: 'Biaya Admin', dividend: 'Dividen & Bunga', ...(seed.default_categories || {}) };
  for (const [k, v] of Object.entries(defaults)) if (!known.has(v)) errors.push(`default_categories.${k} "${v}" is not a category`);
  const rules = seed.rules || [];
  rules.forEach((r, i) => {
    if (!known.has(r.category)) errors.push(`rules[${i}]: category "${r.category}" is not a category`);
    try { new RegExp(r.pattern, 'i'); } catch (e) { errors.push(`rules[${i}]: invalid pattern (${e.message})`); }
  });
  if (seed.owner_bank_names && !Array.isArray(seed.owner_bank_names)) errors.push('owner_bank_names must be a list');
  if (errors.length) throw new Error(`Invalid seed:\n${errors.join('\n')}`);
  return { ...seed, slots, defaults, rules, owner_bank_names: seed.owner_bank_names || [] };
}
