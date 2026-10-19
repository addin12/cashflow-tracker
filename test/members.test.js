// Who is who: only the owner's account is the owner, only the partner's accounts are the partner,
// anyone else the spreadsheet happens to be shared with gets no name (and so no app).
import { describe, expect, it } from 'vitest';
import { memberName, isOwnerEmail, isPartner, whoAmI, roleKey } from '../src/gas/members.js';
import { CONFIG_KEYS } from '../src/core/schema.js';

function sheet(cfg) {
  const values = CONFIG_KEYS.map((k) => cfg[k.key] ?? '');
  return { getSheetByName: () => ({ getRange: (row) => ({ getValue: () => values[row - 2] }) }) };
}
const base = { owner_name: 'Me', partner_name: 'Dewi', partner_email: 'dewi@example.com, Dewi.Work@example.com' };

describe('members', () => {
  it('the owner, the partner (either account), and nobody else', () => {
    const ss = sheet({ ...base, owner_email: 'me@example.com' });
    expect(memberName(ss, 'ME@example.com')).toBe('Me');
    expect(memberName(ss, 'dewi.work@example.com')).toBe('Dewi');
    expect(isPartner(ss, 'dewi@example.com')).toBe(true);
    expect(memberName(ss, 'friend@example.com')).toBe('');
    expect(isOwnerEmail(ss, 'friend@example.com')).toBe(false);
    expect(memberName(ss, '')).toBe('Me'); // Google didn't say who: the owner, as before
  });
  it('before the owner email is known, anyone but the partner is the owner (as before)', () => {
    const ss = sheet(base);
    expect(memberName(ss, 'me@example.com')).toBe('Me');
    expect(memberName(ss, 'dewi@example.com')).toBe('Dewi');
  });
});

describe('who is using it', () => {
  const as = (session, profile = session) => {
    globalThis.CacheService = { getUserCache: () => ({ get: () => null, put() {} }) };
    globalThis.Session = { getActiveUser: () => ({ getEmail: () => session }) };
    globalThis.Gmail = { Users: { getProfile: () => ({ emailAddress: profile }) } };
  };
  it('the name, whether it is the owner, and which of the settings are theirs', () => {
    const ss = sheet({ ...base, owner_email: 'me@example.com' });
    as('Dewi.Work@example.com');
    expect(whoAmI(ss)).toMatchObject({ name: 'Dewi', owner: false, email: 'dewi.work@example.com' });
    expect(roleKey(ss, 'weekly_email')).toBe('partner_weekly_email');
    as('me@example.com');
    expect(whoAmI(ss)).toMatchObject({ name: 'Me', owner: true });
    expect(roleKey(ss, 'weekly_email')).toBe('weekly_email');
  });
  it('when the session is silent (a trigger), the Gmail profile says who; when both are, the owner as before', () => {
    const ss = sheet({ ...base, owner_email: 'me@example.com' });
    as('', 'dewi@example.com');
    expect(whoAmI(ss)).toMatchObject({ name: 'Dewi', owner: false });
    as('', '');
    expect(whoAmI(ss)).toMatchObject({ name: 'Me', owner: true });
  });
});
