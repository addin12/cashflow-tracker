// Checks dist/index.html (or --file X) for anything HtmlService would treat as a comment inside
// inline scripts: a raw "//" or "/*" not preceded by a backslash.
import { readFileSync } from 'node:fs';
import { INIT_PLACEHOLDER } from './ui-build.mjs';

const fileArg = process.argv.indexOf('--file');
const html = readFileSync(fileArg > 0 ? process.argv[fileArg + 1] : 'dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const bad = [];
for (const s of scripts) {
  for (const m of s.matchAll(/(^|[^\\])(\/\/|\/\*)/g)) bad.push(s.slice(Math.max(0, m.index - 40), m.index + 40));
}
console.log(`scripts: ${scripts.length}, raw comment markers: ${bad.length}, INIT placeholder: ${html.includes(INIT_PLACEHOLDER)}`);
for (const b of bad.slice(0, 5)) console.log(`  …${b}…`);
process.exitCode = bad.length ? 1 : 0;
