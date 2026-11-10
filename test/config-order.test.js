// The Config tab is read by position (row = place in CONFIG_KEYS + 2). A key put in the middle moves every later key onto the
// wrong row: after one such change the sync read "archived" from another row and every run ended at once. New keys go at the END.
import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS } from '../src/core/schema.js';

// The rows of the live Config tab as of setup version 42, in order. This list only ever grows at its end.
const FIXED = [
  'start_date', 'payday_day', 'owner_name', 'setup_version', 'last_selftest', 'owner_bank_names', 'sync_mode', 'cat_transfer', 'cat_fee', 'cat_dividend',
  'language', 'weekly_email', 'monthly_email', 'payday_email', 'archives', 'archived', 'salary_stream', 'salary_amount', 'salary_skipped',
  'opening_checks', 'summary_period', 'recurring_hidden', 'balance_checks', 'big_amount', 'imports', 'recurring_marks', 'price_status',
  'tag_budgets', 'closed_days', 'bill_email', 'close_email', 'cards', 'yearly_subs', 'yearly_scan', 'calendar_sync', 'calendar_id',
  'calendar_status', 'push_devices', 'push_events', 'push_nonce', 'partner_email', 'partner_name', 'partner_bank_names', 'owner_email',
  'claims', 'claim_days', 'partner_payday_day', 'partner_salary_stream', 'partner_salary_amount', 'partner_salary_skipped',
  'partner_closed_days', 'partner_calendar_sync', 'partner_calendar_id', 'partner_calendar_status', 'partner_yearly_scan', 'partner_push_events',
  'partner_weekly_email', 'partner_monthly_email', 'partner_payday_email', 'partner_bill_email', 'partner_close_email',
  'shared_split', 'settlements', 'telegram_chats', 'telegram_nonce', 'telegram_username',
];

describe('the order of the Config keys', () => {
  it('starts with the rows the live sheet already has, unchanged', () => {
    expect(CONFIG_KEYS.slice(0, FIXED.length).map((k) => k.key)).toEqual(FIXED);
  });
  it('has no key twice', () => {
    const keys = CONFIG_KEYS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('puts the cash category after all of them', () => {
    expect(CONFIG_KEYS[FIXED.length].key).toBe('cat_cash');
  });
});
