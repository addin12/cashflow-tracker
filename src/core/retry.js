// Which emails the sync tries again. "error" (a parser fix may read it later) is tried again for ever;
// "waiting" (a receipt whose charge isn't in the account yet) only while it is recent, so an order
// that never gets charged stops being fetched on every run. When all mail is read again (a new reader), an email that was only skipped
// because no parser matched it is tried again too: that reader may be the one it was waiting for.

const WAITING_DAYS = 14;

/** @param {string} status  latest Inbox Log status of the email
 *  @param {number} receivedMs  when the email arrived (0 = unknown: still tried)
 *  @param {number} nowMs
 *  @param {{rescan?: boolean, reason?: string}} [again]  `rescan`: all mail is being read again; `reason`: the log line's reason */
export const retryable = (status, receivedMs, nowMs, { rescan = false, reason = '' } = {}) => status === 'error'
  || (status === 'waiting' && !(receivedMs > 0 && nowMs - receivedMs > WAITING_DAYS * 86400000))
  || (rescan && status === 'skip' && /^no parser/i.test(String(reason)));
