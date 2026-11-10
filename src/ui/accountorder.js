// Settings → Accounts: the person's own accounts are shown first, but the order the accounts are STORED in never changes (the spreadsheet's
// blocks follow the Accounts tab). Each account on screen remembers its place in storage (`_orig`); saving puts them back in that order.

const known = (a) => Number.isInteger(a._orig);

/** @returns the accounts in the order to show: own accounts first, each group in stored order; every account carries its stored place. */
export function shownOrder(list, me, defaultOwner = '') {
  const any = list.some(known);
  let next = any ? Math.max(...list.map((a) => (known(a) ? a._orig : -1))) + 1 : 0;
  const tagged = list.map((a, i) => ({ ...a, _orig: known(a) ? a._orig : (any ? next++ : i) })); // a new account goes last in storage
  const stored = [...tagged].sort((a, b) => a._orig - b._orig);
  const mine = (a) => (a.owner || defaultOwner) === me;
  return [...stored.filter(mine), ...stored.filter((a) => !mine(a))];
}

/** The accounts as they are written back: in their stored order (new ones last), without the bookkeeping. */
export function storedOrder(list) {
  return [...list].sort((a, b) => (known(a) ? a._orig : Infinity) - (known(b) ? b._orig : Infinity)).map(({ _orig, ...rest }) => rest);
}
