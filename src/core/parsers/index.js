// Routes an email to its bank parser. See common.js for the result shapes.
import { bodyToTokens } from '../text.js';
import { bca } from './bca.js';
import { livin } from './livin.js';
import { blu } from './blu.js';
import { jago, sekuritas, gopay } from './others.js';
import { fail, skip } from './common.js';

export const PARSERS = [bca, livin, blu, jago, sekuritas, gopay];

/** Gmail search for every sender a parser exists for. */
export const SENDERS = [
  'bca@bca.co.id', 'noreply.livin@bankmandiri.co.id', 'receipts@blubybcadigital.id', 'noreply@jago.com',
  'corporate_action@mandirisekuritas.co.id', 'no-reply@customers.go-pay.co.id',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {{id: string, from: string, subject: string, epochMs: number, body: string, isHtml: boolean}} email
 * @returns {{status: 'ok'|'skip'|'error', events?: object[], reason?: string, parser?: string}}
 */
export function parseEmail(email) {
  const from = String(email.from || '').replace(/^.*<([^>]+)>.*$/, '$1').trim().toLowerCase();
  const tokens = bodyToTokens(email.body || '', email.isHtml);
  const msg = { ...email, from, subject: String(email.subject || ''), tokens, text: tokens.join('\n') };
  const parser = PARSERS.find((p) => p.matches(msg));
  if (!parser) return skip(`no parser for ${from}`);
  let res;
  try {
    res = parser.parse(msg);
  } catch (e) {
    return { ...fail(e.message), parser: parser.id };
  }
  if (res.status === 'ok') {
    for (const ev of res.events) {
      if (!DATE.test(ev.date || '') || !(ev.amount >= 0) || !ev.account?.institution) {
        return { ...fail(`incomplete event ${JSON.stringify(ev)}`), parser: parser.id };
      }
      ev.parser = parser.id;
    }
  }
  return { ...res, parser: parser.id };
}
