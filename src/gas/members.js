// Who may use the app: the owner and the partner (Config partner_email). The web app runs as the
// person opening it, so the spreadsheet's sharing is the real lock (someone it isn't shared with
// can't open it); MEMBERS (script property) lets the cheap calls that skip the spreadsheet check too.
/* global Session, PropertiesService, CacheService, Gmail */

import { configValue } from './setup.js';

const MEMBERS = 'MEMBERS';
const norm = (e) => String(e || '').trim().toLowerCase();

/**
 * The Google account of the person using the app. Session.getActiveUser() answers '' without the
 * userinfo.email scope, so the Gmail profile (gmail.readonly, already granted) is asked instead,
 * and kept for 6 hours in that person's own cache.
 */
export function activeEmail() {
  let cache = null;
  try { cache = CacheService.getUserCache(); } catch (e) { /* a trigger has no user cache: the profile is asked every time */ }
  const known = cache && cache.get('ME');
  if (known) return known;
  // each source on its own: in a trigger Session.getActiveUser() can throw, and the profile must still be asked
  let email = '';
  try { email = norm(Session.getActiveUser().getEmail()); } catch (e) { /* the profile is next */ }
  if (!email) { try { email = norm(Gmail.Users.getProfile('me').emailAddress); } catch (e) { /* unknown: the owner, as before */ } }
  if (email && cache) cache.put('ME', email, 21600);
  return email;
}
const listOf = (ss, key) => String(configValue(ss, key) || '').split(',').map(norm).filter(Boolean);
/** Each person's Google addresses (Config owner_email / partner_email, comma-separated: one person may use two). */
export const ownerEmails = (ss) => listOf(ss, 'owner_email');
const partnerEmails = (ss) => listOf(ss, 'partner_email');
/** Every Google address of the person this one belongs to (the owner's or the partner's), or just the address itself. */
export function addressesOfPerson(ss, email) {
  const e = norm(email);
  if (ownerEmails(ss).includes(e)) return ownerEmails(ss);
  if (partnerEmails(ss).includes(e)) return partnerEmails(ss);
  return e ? [e] : [];
}
export const isPartner = (ss, email) => !!email && partnerEmails(ss).includes(norm(email));
/** Is this the owner? Unknown (''): yes, as only people the spreadsheet is shared with get this far. Until an owner address is known, anyone who isn't the partner. */
export const isOwnerEmail = (ss, email) => !norm(email) || (ownerEmails(ss).length ? ownerEmails(ss).includes(norm(email)) : !isPartner(ss, email));

/** Who is using the app (or whose trigger is running), as the API wants to know. */
export function whoAmI(ss) {
  const email = activeEmail();
  return { email, name: memberName(ss, email), owner: isOwnerEmail(ss, email) };
}
/** A setting that each of the two has: the owner's key, or the partner's twin behind "partner_". */
export const roleKey = (ss, base) => (isOwnerEmail(ss, activeEmail()) ? base : `partner_${base}`);

/**
 * The short name rows of this person carry (owner_name or partner_name); '' for anyone else.
 * When Google doesn't say who it is (''), the owner, as before: only people the spreadsheet is
 * shared with get this far.
 */
export function memberName(ss, email) {
  if (!norm(email)) return String(configValue(ss, 'owner_name') || '');
  if (isPartner(ss, email)) return String(configValue(ss, 'partner_name') || 'Partner');
  return isOwnerEmail(ss, email) ? String(configValue(ss, 'owner_name') || '') : '';
}

/** Both people's names as their banks print them (a transfer between the two is not spending). */
export function bankNames(ss) {
  return ['owner_bank_names', 'partner_bank_names'].flatMap((k) => String(configValue(ss, k) || '').split(',')).map((s) => s.trim()).filter(Boolean);
}

export function isMember(email) {
  try { return !!email && JSON.parse(PropertiesService.getScriptProperties().getProperty(MEMBERS) || '[]').includes(norm(email)); } catch (e) { return false; }
}
/** Remembers someone who just opened the spreadsheet (so they are a member). */
export function rememberMember(email) {
  if (!email || isMember(email)) return;
  const props = PropertiesService.getScriptProperties();
  let list = [];
  try { list = JSON.parse(props.getProperty(MEMBERS) || '[]'); } catch (e) { list = []; }
  props.setProperty(MEMBERS, JSON.stringify([...new Set([...list, norm(email)])].slice(-10)));
}

/** Everyone listed can open the spreadsheet (and so the app). No email is sent by Google. */
export function sharePartner(ss) {
  const editors = new Set(ss.getEditors().map((u) => norm(u.getEmail())));
  const add = [...ownerEmails(ss), ...partnerEmails(ss)].filter((e) => !editors.has(e));
  add.forEach((e) => ss.addEditor(e));
  return { shared: add.length };
}
