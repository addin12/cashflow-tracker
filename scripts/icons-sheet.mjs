// A picture of every icon of src/ui/icons.js, large and at real size, light and dark, to check them by eye.
//   node scripts/icons-sheet.mjs   -> private/icons.png
import { writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ICON_NAMES, svgIcon } from '../src/ui/icons.js';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');
const cell = (name, dark) => `<figure style="margin:0;text-align:center;color:${dark ? '#f5f5f7' : '#1d1d1f'}"><div style="width:72px;height:72px;margin:auto">${svgIcon(name).replace('width="24" height="24"', 'width="72" height="72"')}</div><div style="display:flex;gap:10px;justify-content:center;align-items:center;margin:6px 0"><span style="width:24px;height:24px;display:inline-block">${svgIcon(name)}</span></div><figcaption style="font:12px sans-serif;opacity:.7">${name}</figcaption></figure>`;
const grid = (dark) => `<div style="background:${dark ? '#1c1c1e' : '#fff'};padding:16px;display:grid;grid-template-columns:repeat(8,1fr);gap:14px">${ICON_NAMES.map((n) => cell(n, dark)).join('')}</div>`;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0">${grid(false)}${grid(true)}</body>`;
mkdirSync('private', { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'ct-icons-'));
const file = join(dir, 'icons.html');
writeFileSync(file, html);
const rows = Math.ceil(ICON_NAMES.length / 8);
execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${join(dir, 'profile')}`, `--window-size=900,${rows * 150 * 2 + 80}`, `--screenshot=${join(process.cwd(), 'private', 'icons.png')}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 60000 });
console.log(`private/icons.png (${ICON_NAMES.length} icons)`);
