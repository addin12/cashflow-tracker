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
  if (errors.length) throw new Error(`Invalid seed:\n${errors.join('\n')}`);
  return { ...seed, slots };
}
