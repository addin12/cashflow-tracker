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
  try {
    const cache = CacheService.getUserCache();
    const known = cache.get('ME');
    if (known) return known;
    const email = norm(Session.getActiveUser().getEmail()) || norm(Gmail.Users.getProfile('me').emailAddress);
    if (email) cache.put('ME', email, 21600);
    return email;
  } catch (e) { return ''; }
}
/** The partner's Google addresses (Config partner_email, comma-separated: one person may use two). */
export const partnerEmails = (ss) => String(configValue(ss, 'partner_email') || '').split(',').map(norm).filter(Boolean);
export const isPartner = (ss, email) => !!email && partnerEmails(ss).includes(norm(email));

/** The owner's Google account (Config owner_email, written by the owner's own sync). */
export const ownerEmail = (ss) => norm(configValue(ss, 'owner_email'));
/** Is this the owner? Until owner_email is known, anyone who isn't the partner (as before it existed). */
export const isOwnerEmail = (ss, email) => (ownerEmail(ss) ? norm(email) === ownerEmail(ss) : !isPartner(ss, email));

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

/** Owner only: the partner can open the spreadsheet (and so the app). No email is sent by Google. */
export function sharePartner(ss) {
  const editors = new Set(ss.getEditors().map((u) => norm(u.getEmail())));
  const add = partnerEmails(ss).filter((e) => !editors.has(e));
  add.forEach((e) => ss.addEditor(e));
  return { shared: add.length };
}
