// Next payday: the configured day of this month if it is still ahead, otherwise next month's.
// A day that doesn't exist in a month (e.g. 31 in February) falls back to that month's last day.
// Payday itself counts as "already paid", so on the 28th the next payday is next month's 28th.

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function paydayIn(year, monthIndex, day) {
  return new Date(year, monthIndex, Math.min(day, lastDayOfMonth(year, monthIndex)));
}

/** @param {Date} today local date (time ignored) @param {number} day 1..31 */
export function nextPayday(today, day) {
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error(`payday day must be 1..31, got ${day}`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisMonth = paydayIn(t.getFullYear(), t.getMonth(), day);
  if (t < thisMonth) return thisMonth;
  return paydayIn(t.getFullYear(), t.getMonth() + 1, day);
}

/** Is today payday (the configured day, or the month's last day when the month is shorter)? */
export function isPayday(today, day) {
  const p = paydayIn(today.getFullYear(), today.getMonth(), day);
  return p.getDate() === today.getDate();
}

/** Whole days from today until the next payday (always >= 1). */
export function daysUntilPayday(today, day) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((nextPayday(t, day) - t) / 86400000);
}

/** Same rule as a Google Sheets formula. `dayRef` is a cell or named range holding the day. */
export function nextPaydayFormula(dayRef, todayRef = 'TODAY()') {
  const thisMonth = `DATE(YEAR(t),MONTH(t),MIN(p,DAY(EOMONTH(t,0))))`;
  const nextMonth = `DATE(YEAR(t),MONTH(t)+1,MIN(p,DAY(EOMONTH(t,1))))`;
  return `=LET(t,${todayRef},p,${dayRef},IF(t<${thisMonth},${thisMonth},${nextMonth}))`;
}
