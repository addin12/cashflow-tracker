// Dev helper: from the fetched web app page (private/webapp-page.html), extract the app HTML
// exactly as Google embeds it (goog.script.init(...).userHtml) and compare with dist/index.html.
import { readFileSync, writeFileSync } from 'node:fs';

const page = readFileSync('private/webapp-page.html', 'utf8');
const marker = 'goog.script.init("';
const start = page.indexOf(marker) + marker.length;
let end = start;
while (end < page.length && !(page[end] === '"' && page[end - 1] !== '\\')) end += 1;
// Undo the JavaScript string escapes (\xNN, \uNNNN, \n, \t, \<char>).
const unescape = (s) => s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (m, e) => {
  if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
  if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
  return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[e] ?? e;
});
const config = JSON.parse(unescape(page.slice(start, end)));
const html = config.userHtml || '';
writeFileSync('private/served-user.html', html);
const dist = readFileSync('dist/index.html', 'utf8');
console.log('config keys:', Object.keys(config).join(', '));
console.log(`served userHtml ${html.length} chars, dist ${dist.length} chars, identical: ${html === dist}`);
console.log('INIT injected:', /window\.__INIT__=/.test(html));
if (html !== dist) {
  let i = 0;
  while (i < html.length && html[i] === dist[i]) i += 1;
  console.log(`first difference at ${i}:\n served: ${JSON.stringify(html.slice(i - 80, i + 160))}\n dist:   ${JSON.stringify(dist.slice(i - 80, i + 160))}`);
}
