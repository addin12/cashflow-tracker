// Work that must happen once for each person after a deploy (their calendar, their triggers), not once for the whole sheet.
// The setup version cannot do this: it is shared, so whichever account syncs first does the upgrade and the others never see it.
/* global PropertiesService */

/**
 * Runs `task` the first time this person's sync reaches it, then never again. It is marked done BEFORE it runs, so a task that
 * fails (or is cut off by the time limit) is not retried every minute; its own status line says what happened.
 * To run it again for everyone, give it a new name.
 *
 * @param {string} name  e.g. 'calendar-tidy-1'
 * @param {() => any} task
 * @param {{getProperty: Function, setProperty: Function}} [props]  this person's own properties
 * @returns {{ran: boolean, result?: any, error?: string}}
 */
export function runOnce(name, task, props = PropertiesService.getUserProperties()) {
  const key = `ONCE_${name}`;
  if (props.getProperty(key)) return { ran: false };
  props.setProperty(key, String(Date.now()));
  try { return { ran: true, result: task() }; } catch (e) { return { ran: true, error: e.message }; }
}
