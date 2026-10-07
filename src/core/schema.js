// Layout of the tabs the app owns, and the fixed coordinates of the template.
// Everything that touches a cell address goes through this file.

export const SETUP_VERSION = 13; // 10: formulas under en_US · 11: Goals tab, move_to_opening · 12: unmerge the ledger area · 13: salary, seed config

export const TABS = {
  transactions: 'Transactions',
  accounts: 'Accounts',
  rules: 'Rules',
  connections: 'Connections',
  config: 'Config',
  inboxLog: 'Inbox Log',
  preview: 'Preview',
  budgets: 'Budgets',
  goals: 'Goals',
  selfTest: 'Self-test',
};

export const BUDGET_HEADERS = ['category', 'monthly_budget'];

export const GOAL_HEADERS = ['stream', 'name', 'target', 'target_date'];

export const INBOX_LOG_HEADERS = ['gmail_id', 'received', 'from', 'subject', 'status', 'parser', 'reason', 'rows', 'gmail'];

// Column order matters: formulas reference these letters (see TX_COL).
export const TRANSACTION_HEADERS = [
  'id', 'date', 'time', 'owner', 'stream', 'direction', 'amount', 'category',
  'description', 'details', 'source', 'sender', 'gmail', 'gmail_id', 'ref_no',
  'status', 'transfer_id', 'rule_id', 'updated_by', 'updated_at',
];

export const ACCOUNT_HEADERS = ['stream', 'type', 'owner', 'institution', 'match_hint', 'opening_balance', 'notes'];

export const RULE_HEADERS = ['id', 'field', 'pattern', 'category', 'stream_override', 'auto_approve', 'hits', 'created_by', 'created_at'];

export const CONNECTION_HEADERS = ['gmail', 'owner', 'method', 'connected_at', 'last_sync', 'last_status', 'seen', 'parsed', 'skipped', 'errors', 'checkpoint'];

// Config tab: key in column A, value in column B. Row numbers are fixed so named ranges stay valid.
export const CONFIG_KEYS = [
  { key: 'start_date', name: 'CFG_START_DATE', note: 'First day the sync reads email from' },
  { key: 'payday_day', name: 'CFG_PAYDAY', note: 'Day of the month salary arrives (1-31)' },
  { key: 'owner_name', name: 'CFG_OWNER', note: 'Short name used as the owner of rows' },
  { key: 'setup_version', name: 'CFG_SETUP_VERSION', note: 'Written by setup; do not edit' },
  { key: 'last_selftest', name: 'CFG_LAST_SELFTEST', note: 'Result of the last self-test' },
  // Added in setup version 2 (rows are only ever appended, so named ranges stay valid).
  { key: 'owner_bank_names', name: 'CFG_OWNER_BANK_NAMES', note: 'Your name as banks print it (comma-separated); used to spot transfers between your own accounts' },
  { key: 'sync_mode', name: 'CFG_SYNC_MODE', note: 'live = write to Transactions; preview = write to the Preview tab only; empty = app default' },
  { key: 'cat_transfer', name: 'CFG_CAT_TRANSFER', note: 'Category for transfers between your own accounts' },
  { key: 'cat_fee', name: 'CFG_CAT_FEE', note: 'Category for bank fees' },
  { key: 'cat_dividend', name: 'CFG_CAT_DIVIDEND', note: 'Category for dividends' },
  { key: 'language', name: 'CFG_LANGUAGE', note: 'Web app language: id or en (empty = follow the phone)' },
  // Added in setup version 8.
  { key: 'weekly_email', name: 'CFG_WEEKLY_EMAIL', note: 'Weekly summary email on Mondays: on / off' },
  // Added in setup version 9.
  { key: 'monthly_email', name: 'CFG_MONTHLY_EMAIL', note: 'Monthly report email on the 1st: on / off' },
  { key: 'payday_email', name: 'CFG_PAYDAY_EMAIL', note: 'Balance-check reminder email on payday: on / off' },
  { key: 'archives', name: 'CFG_ARCHIVES', note: 'Copies of finished years ("2026 <link>", one per line); written at New Year' },
  { key: 'archived', name: 'CFG_ARCHIVED', note: 'Set in an archive copy (the year it holds); an archive never syncs' },
  // Added in setup version 13.
  { key: 'salary_stream', name: 'CFG_SALARY_STREAM', note: 'Account the salary is paid into (no email reports it, so the app asks on payday)' },
  { key: 'salary_amount', name: 'CFG_SALARY_AMOUNT', note: 'Usual salary, suggested on the salary card (the last one recorded)' },
  { key: 'salary_skipped', name: 'CFG_SALARY_SKIPPED', note: 'Months without salary (YYYY-MM, comma-separated)' },
  { key: 'opening_checks', name: 'CFG_OPENING_CHECKS', note: 'Date each opening balance was set from a balance check (JSON); written by the app' },
  { key: 'summary_period', name: 'CFG_SUMMARY_PERIOD', note: 'Summary per calendar month (month) or from payday to payday (payday)' },
  { key: 'recurring_hidden', name: 'CFG_RECURRING_HIDDEN', note: 'Payees marked "not a subscription" (one per line)' },
];

export const STATUS = ['pending', 'approved', 'ignored'];
export const DIRECTION = ['in', 'out'];
export const ACCOUNT_TYPES = ['Spending', 'Saving'];

/** Spreadsheet column letter for a 0-based index. */
export function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Letter of a Transactions column by header name. */
export const TX_COL = Object.fromEntries(TRANSACTION_HEADERS.map((h, i) => [h, colLetter(i)]));

// ---- Template coordinates (CASHFLOW and friends) -------------------------------------------

export const CF = {
  sheet: 'CASHFLOW',
  firstDataRow: 6, // ledger rows B6:H (the template's input area)
  monthCols: ['L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'],
  incomeRows: [5, 10], // K5:K10, sums Debit (G)
  expenseRows: [11, 38], // K11:K38, sums Credit (H)
  adjustmentRow: 39, // K39 "Penyesuaian", sums Credit
  transferRow: 40, // K40 "trf ke bank lain", sums Credit
  // Streams: per-stream IN/OUT blocks. Name row n = 67 + 4i, IN n+1, OUT n+2 (i = 0..15).
  streamBlockFirstRow: 67,
  streamBlockCount: 16,
  spendingStreamRows: [46, 53],
  savingStreamRows: [55, 62],
  payday: { today: 'Y50', payday: 'Y52', label: 'Y53', daysLeft: 'Y54', perDay: 'Y56' },
};

export const SLOTS = { income: 6, expense: 28, spending: 8, saving: 8 };

export const FIXED_CATEGORIES = { adjustment: 'Penyesuaian', transfer: 'trf ke bank lain' };

/** Placeholder written into unused category / stream slots so lookups never see blanks. */
export const EMPTY_SLOT = '-';
