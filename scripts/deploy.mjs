// Pushes the build and points the web app deployment at it, so its URL always serves the
// latest code. The deployment id lives in private/webapp.json (created on first deploy).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const clasp = (...args) => execFileSync(process.execPath, [join('node_modules', '@google', 'clasp', 'build', 'src', 'index.js'), ...args], { encoding: 'utf8', timeout: 180000 }); // a hung clasp fails instead of waiting forever
const file = 'private/webapp.json';

console.log(clasp('push', '--force').trim().split('\n')[0]);
const known = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
const out = known
  ? clasp('update-deployment', known.deploymentId, '--description', 'Cashflow web app')
  : clasp('create-deployment', '--description', 'Cashflow web app');
const m = out.match(/(?:Re)?[Dd]eployed (\S+) @(\d+)/);
if (!m) throw new Error(`unexpected clasp output: ${out}`);
const info = { deploymentId: m[1], version: Number(m[2]), url: `https://script.google.com/macros/s/${m[1]}/exec` };
writeFileSync(file, JSON.stringify(info, null, 2));
console.log(`web app version ${info.version}: ${info.url}`);

// Google can keep serving the previous version for about a minute, then the new page must be the app,
// not an error page (a disallowed meta tag once broke the whole page while every test passed).
await new Promise((r) => { setTimeout(r, 75000); });
execFileSync(process.execPath, [join('scripts', 'check-live.mjs')], { stdio: 'inherit', env: { ...process.env, CHECK_LIVE_ROUNDS: '3' } });
