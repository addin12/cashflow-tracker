// Builds the web app page: src/ui/index.html with styles.css and the bundled app.js inlined
// (Apps Script's HtmlService serves a single HTML file).
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const p = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

export async function buildUiHtml() {
  const js = await build({
    entryPoints: [p('src/ui/app.js')], bundle: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none', minify: true,
  });
  const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(p('src/ui/styles.css'), 'utf8');
  const html = readFileSync(p('src/ui/index.html'), 'utf8');
  return html.replace('/*STYLES*/', () => css).replace('/*SCRIPT*/', () => script);
}
