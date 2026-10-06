// Dev helper: fetch the deployed web app page with the clasp login, to see what Google serves.
//   node scripts/fetch-webapp.mjs [url]
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] || JSON.parse(readFileSync('private/webapp.json', 'utf8')).url;
const cred = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8')).tokens.default;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: cred.client_id, client_secret: cred.client_secret, refresh_token: cred.refresh_token, grant_type: 'refresh_token' }),
})).json();
const res = await fetch(url, { headers: { authorization: `Bearer ${tok.access_token}` }, redirect: 'follow' });
const body = await res.text();
const out = join('private', 'webapp-page.html');
writeFileSync(out, body);
console.log(`HTTP ${res.status} ${res.url.slice(0, 80)}… ${body.length} chars -> ${out}`);
