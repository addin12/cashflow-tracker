// Who may use the app: the owner and the partner (Config partner_email). The web app runs as the
// person opening it, so the spreadsheet's sharing is the real lock (someone it isn't shared with
// can't open it); MEMBERS (script property) lets the cheap calls that skip the spreadsheet check too.
/* global Session, PropertiesService */

import { configValue } from './setup.js';

const MEMBERS = 'MEMBERS';
const norm = (e) => String(e || '').trim().toLowerCase();

export const activeEmail = () => { try { return norm(Session.getActiveUser().getEmail()); } catch (e) { return ''; } };
export const partnerEmail = (ss) => norm(configValue(ss, 'partner_email'));
export const isPartner = (ss, email) => !!email && norm(email) === partnerEmail(ss);

/** The short name rows of this person carry (owner_name or partner_name). */
export function memberName(ss, email) {
  return isPartner(ss, email) ? String(configValue(ss, 'partner_name') || 'Partner') : String(configValue(ss, 'owner_name') || '');
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
  const email = partnerEmail(ss);
  if (!email) return { shared: false };
  if (ss.getEditors().some((u) => norm(u.getEmail()) === email)) return { shared: true, already: true };
  ss.addEditor(email);
  return { shared: true };
}
