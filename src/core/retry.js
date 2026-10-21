// Which emails the sync tries again. "error" (a parser fix may read it later) is tried again for ever;
// "waiting" (a receipt whose charge isn't in the account yet) only while it is recent, so an order
// that never gets charged stops being fetched on every run.

export const WAITING_DAYS = 14;

/** @param {string} status  latest Inbox Log status of the email
 *  @param {number} receivedMs  when the email arrived (0 = unknown: still tried)
 *  @param {number} nowMs */
export const retryable = (status, receivedMs, nowMs) => status === 'error'
  || (status === 'waiting' && !(receivedMs > 0 && nowMs - receivedMs > WAITING_DAYS * 86400000));
