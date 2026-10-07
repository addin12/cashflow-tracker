// After a deploy: fetch the live web app a few times (Google can serve the old version for about
// a minute) and fail if Google shows an error page instead of the app.
//   node scripts/check-live.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = JSON.parse(readFileSync('private/webapp.json', 'utf8')).url;
const cred = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
})).json();

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
const rounds = Number(process.env.CHECK_LIVE_ROUNDS || 4);
for (let i = 0; i < rounds; i += 1) {
  if (i) await wait(30000);
  const res = await fetch(url, { headers: { authorization: `Bearer ${tok.access_token}` }, redirect: 'follow' });
  const body = await res.text();
  const err = body.match(/(Exception|Error): [^<"\\]{0,200}/);
  if (res.status !== 200 || err) {
    console.error(`live page FAILED (try ${i + 1}): HTTP ${res.status} ${err ? err[0] : ''}`);
    process.exit(1);
  }
  if (!body.includes('Cashflow')) {
    console.error(`live page FAILED (try ${i + 1}): no "Cashflow" in the page (${body.length} chars)`);
    process.exit(1);
  }
  console.log(`live page ok (try ${i + 1}/${rounds}, ${body.length} chars)`);
}
