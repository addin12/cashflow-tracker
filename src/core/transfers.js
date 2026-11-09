// A transfer between a person's own accounts has two sides. When only one side carries the transfer's id and exactly one
// other row looks like the other side, the person is asked to link them (never done on its own: it changes what counts as spending).

const DAY = 86400000;
const dayNumber = (date) => { const [y, m, d] = String(date).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };

/**
 * @param {object[]} rows  every transaction row
 * @returns {{id: string, withId: string, amount: number, date: string, stream: string, withStream: string}[]}
 *   one entry per transfer side that has exactly one matching row on another account of the same owner, opposite direction,
 *   same amount, within a day, not yet linked and not ignored
 */
export function linkableTransfers(rows) {
  const sides = new Map();
  for (const r of rows) if (r.transfer_id) sides.set(r.transfer_id, (sides.get(r.transfer_id) || 0) + 1);
  const free = rows.filter((r) => !r.transfer_id && r.status !== 'ignored' && r.status !== 'waiting');
  const out = [];
  for (const lone of rows) {
    if (!lone.transfer_id || sides.get(lone.transfer_id) !== 1 || lone.status === 'ignored') continue;
    const candidates = free.filter((c) => c.direction !== lone.direction && Number(c.amount) === Number(lone.amount) && c.owner === lone.owner
      && c.stream !== lone.stream && Math.abs(dayNumber(c.date) - dayNumber(lone.date)) <= 1);
    if (candidates.length === 1) out.push({ id: lone.id, withId: candidates[0].id, amount: Number(lone.amount), date: String(lone.date).slice(0, 10), stream: lone.stream, withStream: candidates[0].stream });
  }
  return out;
}
