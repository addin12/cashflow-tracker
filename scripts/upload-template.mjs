// One-time: upload your copy of the template to Google Drive as a Google Sheet, then bind a new
// Apps Script project to it (writes .clasp.json). Uses the login from `npx clasp login`
// (~/.clasprc.json), whose drive.file scope allows creating this one file.
//   node scripts/upload-template.mjs ["template/<file>.xlsx"] ["Sheet title"]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const xlsx = process.argv[2] || join('template', readdirSync('template').find((f) => f.endsWith('.xlsx')) || '');
const title = process.argv[3] || 'Cashflow 2026';
if (!existsSync(xlsx) || !xlsx.endsWith('.xlsx')) throw new Error(`template .xlsx not found (${xlsx})`);
if (existsSync('.clasp.json')) throw new Error('.clasp.json already exists: this project is already bound to a script. Delete it only if you really want a new spreadsheet.');

const rc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
const cred = rc.tokens?.default || rc.token || rc;
async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cred.client_id, client_secret: cred.client_secret,
      refresh_token: cred.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`could not refresh the clasp login: ${JSON.stringify(j)}`);
  return j.access_token;
}

const token = await accessToken();
const boundary = `ct${Date.now()}`;
const meta = JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.spreadsheet' });
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
  Buffer.from(`--${boundary}\r\ncontent-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
  readFileSync(xlsx),
  Buffer.from(`\r\n--${boundary}--`),
]);
const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
  body,
});
const file = await up.json();
if (!file.id) throw new Error(`upload failed: ${JSON.stringify(file)}`);
console.log(`uploaded "${file.name}" as a Google Sheet: ${file.webViewLink}`);

bindScript(file.id, title);

/** Creates an Apps Script project bound to the sheet. No shell, so the title's spaces stay intact. */
export function bindScript(sheetId, sheetTitle) {
  const claspBin = join('node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
  // No --type: with --type sheets, clasp 3 creates a *new* spreadsheet and ignores --parentId.
  execFileSync(process.execPath, [claspBin, 'create-script', '--title', 'Cashflow Tracker', '--parentId', sheetId, '--rootDir', 'dist'],
    { stdio: 'inherit' });
  if (!existsSync('.clasp.json')) throw new Error('clasp did not write .clasp.json; the script was not bound');
  console.log('bound a new Apps Script project to it (.clasp.json written). Next: npm run push');
}
