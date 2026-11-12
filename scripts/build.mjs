// Builds the page the Worker serves (and the screenshot and browser-check scripts read): dist/index.html, the app's screens and styles as one file.
// The Cloudflare Worker builds its own copy the same way (cashflow-worker: npm run build:ui). The Google Apps Script build that used to live here was removed on 2026-11-12.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildUiHtml } from './ui-build.mjs';

const dist = new URL('../dist/', import.meta.url);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const html = await buildUiHtml();
writeFileSync(new URL('index.html', dist), html);
console.log(`built dist/index.html (${html.length} characters)`);
