// Menu: which senders in the mailbox look financial but have no reader. Shows domains and counts only; nothing is written anywhere.
/* global Gmail */

import { listMessageIds } from './gmail.js';
import { coverageReport } from '../core/coverage.js';
import { hasReader } from '../core/parsers/index.js';

const QUERY = 'newer_than:90d subject:(transfer OR pembayaran OR payment OR transaksi OR struk OR receipt OR invoice OR tagihan OR "bukti") -in:spam';

/** @returns {{checked: number, uncovered: {domain: string, count: number}[]}} the last 90 days, up to 200 messages */
export function mailCoverage() {
  const mails = listMessageIds(QUERY, 200).map((id) => {
    const m = Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ['From', 'Subject'] });
    const header = (n) => ((m.payload.headers || []).find((h) => h.name.toLowerCase() === n) || {}).value || '';
    return { from: header('from'), subject: header('subject') };
  });
  return { checked: mails.length, uncovered: coverageReport(mails, hasReader) };
}
