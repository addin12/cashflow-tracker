// The api.js store, backed by the spreadsheet.
import {
  TABS, TRANSACTION_HEADERS, ACCOUNT_HEADERS, RULE_HEADERS, CONNECTION_HEADERS, INBOX_LOG_HEADERS, BUDGET_HEADERS, CF,
} from '../core/schema.js';
import { readTable, appendRows, updateRows, deleteRowById } from './store.js';
import { configValue, setConfigValue, writeCategories } from './setup.js';

const HEADERS = {
  [TABS.transactions]: TRANSACTION_HEADERS,
  [TABS.accounts]: ACCOUNT_HEADERS,
  [TABS.rules]: RULE_HEADERS,
  [TABS.connections]: CONNECTION_HEADERS,
  [TABS.inboxLog]: INBOX_LOG_HEADERS,
  [TABS.budgets]: BUDGET_HEADERS,
};

const strip = (rows) => rows.map(({ _row, ...rest }) => rest);

export function sheetStore(ss) {
  return {
    read: (tab) => (ss.getSheetByName(tab) ? strip(readTable(ss, tab)) : []),
    append: (tab, rows) => appendRows(ss, tab, HEADERS[tab], rows),
    update: (tab, updates) => updateRows(ss, tab, HEADERS[tab], updates),
    remove: (tab, id) => deleteRowById(ss, tab, id),
    replace(tab, rows) {
      const sh = ss.getSheetByName(tab);
      const headers = HEADERS[tab];
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(headers.length, sh.getLastColumn())).clearContent();
      appendRows(ss, tab, headers, rows);
    },
    config: (key) => {
      const v = configValue(ss, key);
      if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
      return v;
    },
    setConfig: (key, value) => setConfigValue(ss, key, value),
    slots() {
      const cf = ss.getSheetByName(CF.sheet);
      const col = (a, b) => cf.getRange(`K${a}:K${b}`).getValues().map((r) => String(r[0]));
      return { income: col(CF.incomeRows[0], CF.incomeRows[1]), expense: col(CF.expenseRows[0], CF.expenseRows[1]) };
    },
    setSlots: (slots) => writeCategories(ss, slots),
  };
}
