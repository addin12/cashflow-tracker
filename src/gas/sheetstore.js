// The api.js store, backed by the spreadsheet. Every call to Google costs time on the phone,
// so within one request each tab is read once (writes invalidate it) and Config is read whole.
import {
  TABS, TRANSACTION_HEADERS, ACCOUNT_HEADERS, RULE_HEADERS, CONNECTION_HEADERS, INBOX_LOG_HEADERS, BUDGET_HEADERS, CF, CONFIG_KEYS,
} from '../core/schema.js';
import { readTable, appendRows, updateRows, deleteRowById } from './store.js';
import { setConfigValue, writeCategories } from './setup.js';

const HEADERS = {
  [TABS.transactions]: TRANSACTION_HEADERS,
  [TABS.accounts]: ACCOUNT_HEADERS,
  [TABS.rules]: RULE_HEADERS,
  [TABS.connections]: CONNECTION_HEADERS,
  [TABS.inboxLog]: INBOX_LOG_HEADERS,
  [TABS.budgets]: BUDGET_HEADERS,
};

const strip = (rows) => rows.map(({ _row, ...rest }) => rest);
const isoDay = (v) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;

export function sheetStore(ss) {
  const tables = new Map();
  let config = null;
  let slots = null;
  const forget = (tab) => tables.delete(tab);

  const loadConfig = () => {
    if (!config) {
      const sh = ss.getSheetByName(TABS.config);
      const values = sh ? sh.getRange(2, 1, CONFIG_KEYS.length, 2).getValues() : [];
      config = new Map(values.map(([k, v]) => [String(k), v instanceof Date ? isoDay(v) : v]));
    }
    return config;
  };

  return {
    read(tab) {
      if (!tables.has(tab)) tables.set(tab, ss.getSheetByName(tab) ? strip(readTable(ss, tab)) : []);
      return tables.get(tab).map((r) => ({ ...r }));
    },
    append: (tab, rows) => { forget(tab); appendRows(ss, tab, HEADERS[tab], rows); },
    update: (tab, updates) => { forget(tab); updateRows(ss, tab, HEADERS[tab], updates); },
    remove: (tab, id) => { forget(tab); return deleteRowById(ss, tab, id); },
    replace(tab, rows) {
      forget(tab);
      const sh = ss.getSheetByName(tab);
      const headers = HEADERS[tab];
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(headers.length, sh.getLastColumn())).clearContent();
      appendRows(ss, tab, headers, rows);
    },
    config: (key) => loadConfig().get(key) ?? '',
    setConfig: (key, value) => { setConfigValue(ss, key, value); config = null; },
    slots() {
      if (!slots) {
        const values = ss.getSheetByName(CF.sheet).getRange(`K${CF.incomeRows[0]}:K${CF.expenseRows[1]}`).getValues().map((r) => String(r[0]));
        const nIncome = CF.incomeRows[1] - CF.incomeRows[0] + 1;
        slots = { income: values.slice(0, nIncome), expense: values.slice(nIncome) };
      }
      return { income: [...slots.income], expense: [...slots.expense] };
    },
    setSlots: (s) => { writeCategories(ss, s); slots = null; },
  };
}
