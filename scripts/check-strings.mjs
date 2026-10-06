// Every T.key the web app uses must exist in both languages (and both languages have the same keys).
import { readFileSync } from 'node:fs';
import { STRINGS } from '../src/ui/i18n.js';

const app = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const used = new Set([
  ...[...app.matchAll(/\bT\.([a-zA-Z]+)/g)].map((m) => m[1]),
  ...[...html.matchAll(/data-t="([a-zA-Z]+)"/g)].map((m) => m[1]),
  ...['statusApproved', 'statusPending', 'statusIgnored', 'kindOut', 'kindIn', 'kindTransfer', 'kindAdjust'], // built as T[`status…`], T[`kind…`]
]);
const problems = [];
for (const lang of Object.keys(STRINGS)) {
  for (const k of used) if (!(k in STRINGS[lang])) problems.push(`${lang}: missing ${k}`);
}
const [a, b] = Object.values(STRINGS);
for (const k of Object.keys(a)) if (!(k in b)) problems.push(`only in id: ${k}`);
for (const k of Object.keys(b)) if (!(k in a)) problems.push(`only in en: ${k}`);
console.log(problems.length ? problems.join('\n') : `strings ok (${used.size} keys used)`);
process.exitCode = problems.length ? 1 : 0;
