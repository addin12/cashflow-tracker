// Builds the web app page: src/ui/index.html with styles.css and the bundled app.js inlined
// (Apps Script's HtmlService serves a single HTML file).
//
// HtmlService rewrites inline scripts: it deletes "//" to the end of the line and /* … */,
// treating them as comments even inside template strings (a "https://…" link broke the whole
// app on 2026-10-06). So every "/" pair in the bundle is written as "\/\/" (the same text in
// strings, templates and regexes) and the build fails if a raw "//" or "/*" is left.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const p = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

export const INIT_PLACEHOLDER = 'window.__INIT__=null;';

export async function buildUiHtml() {
  const js = await build({
    entryPoints: [p('src/ui/app.js')], bundle: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none', minify: true,
  });
  let script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  if (/\\\/\//.test(script)) throw new Error('bundle contains "\\//", which the // escaping would change');
  script = script.replace(/\/\//g, '\\/\\/').replace(/\/\*/g, '\\/*');
  if (/(^|[^\\])\/\/|(^|[^\\])\/\*/.test(script)) throw new Error('bundle still contains // or /* that HtmlService would strip');
  const css = readFileSync(p('src/ui/styles.css'), 'utf8');
  const html = readFileSync(p('src/ui/index.html'), 'utf8');
  return html.replace('/*STYLES*/', () => css).replace('/*SCRIPT*/', () => script);
}

/** What HtmlService does to inline scripts (as observed): drop //… and /*…*\/ outside '…'/"…" strings. */
export function simulateHtmlServiceStripping(html) {
  return html.replace(/<script>([\s\S]*?)<\/script>/g, (whole, code) => {
    let out = '';
    let quote = null;
    for (let i = 0; i < code.length; i += 1) {
      const c = code[i];
      if (quote) {
        out += c;
        if (c === '\\') { out += code[i + 1] || ''; i += 1; } else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c; out += c;
      } else if (c === '/' && code[i + 1] === '/' && code[i - 1] !== '\\') {
        while (i < code.length && code[i] !== '\n') i += 1;
        out += '\n';
      } else if (c === '/' && code[i + 1] === '*' && code[i - 1] !== '\\') {
        const close = code.indexOf('*/', i + 2);
        i = close < 0 ? code.length : close + 1;
        out += ' ';
      } else {
        out += c;
      }
    }
    return `<script>${out}</script>`;
  });
}
