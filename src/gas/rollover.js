// New year: the spreadsheet's reports show one year (Setup!D3). On the first sync of a new year
// the finished year is kept as an archive copy (which never syncs) and the live spreadsheet moves
// on to the new year. Opening balances carry over by themselves (see setupSlotFormulas).
/* global SpreadsheetApp */

import { rolloverTarget } from '../core/notices.js';
import { configValue, setConfigValue } from './setup.js';

/** @returns {{year, target, url}|null} what was done, or null when nothing had to be done */
export function rolloverYear(ss, today = new Date()) {
  const setup = ss.getSheetByName('Setup');
  const year = Number(setup.getRange('D3').getValue());
  const target = rolloverTarget(year, today);
  if (!target) return null;
  const name = ss.getName();
  const archive = ss.copy(name.includes(String(year)) ? `${name} (arsip)` : `${name} ${year} (arsip)`);
  setConfigValue(archive, 'archived', String(year)); // the copy never syncs or rolls over
  setup.getRange('D3').setValue(target);
  if (name.includes(String(year))) ss.rename(name.replace(String(year), String(target)));
  const list = String(configValue(ss, 'archives') || '').split('\n').filter(Boolean);
  setConfigValue(ss, 'archives', [...list, `${year} ${archive.getUrl()}`].join('\n'));
  SpreadsheetApp.flush();
  return { year, target, url: archive.getUrl() };
}
