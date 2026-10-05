// Gmail access through the Gmail API advanced service with the read-only scope.
/* global Gmail, Utilities */

/** Message ids matching `query`, newest first, up to `max`. */
export function listMessageIds(query, max = 500) {
  const ids = [];
  let pageToken;
  do {
    const res = Gmail.Users.Messages.list('me', { q: query, maxResults: Math.min(100, max - ids.length), pageToken });
    (res.messages || []).forEach((m) => ids.push(m.id));
    pageToken = res.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

function header(payload, name) {
  const h = (payload.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function charsetOf(part) {
  const m = header(part, 'Content-Type').match(/charset="?([^";]+)"?/i);
  return m ? m[1] : 'UTF-8';
}

/** body.data arrives as web-safe base64 (string) or as a byte array, depending on the runtime. */
function decode(part) {
  const data = part.body && part.body.data;
  if (!data) return '';
  const padded = typeof data === 'string' ? data.replace(/\s/g, '') + '==='.slice((data.replace(/\s/g, '').length + 3) % 4) : data;
  const bytes = Array.isArray(data) ? data : Utilities.base64DecodeWebSafe(padded);
  try {
    return Utilities.newBlob(bytes).getDataAsString(charsetOf(part));
  } catch (e) {
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  }
}

/** Depth-first: the first text/html part, else the first text/plain part. */
function findBody(payload) {
  let html = null;
  let text = null;
  const walk = (p) => {
    if (!p) return;
    const type = String(p.mimeType || '').toLowerCase();
    if (type === 'text/html' && !html) html = p;
    else if (type === 'text/plain' && !text) text = p;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  if (html) return { body: decode(html), isHtml: true };
  if (text) return { body: decode(text), isHtml: false };
  return { body: '', isHtml: false };
}

/** One message as the parsers expect it. */
export function getEmail(id) {
  const m = Gmail.Users.Messages.get('me', id, { format: 'full' });
  const { body, isHtml } = findBody(m.payload);
  return {
    id: m.id,
    from: header(m.payload, 'From'),
    subject: header(m.payload, 'Subject'),
    epochMs: Number(m.internalDate),
    body,
    isHtml,
  };
}

export function myAddress() {
  return Gmail.Users.getProfile('me').emailAddress;
}
