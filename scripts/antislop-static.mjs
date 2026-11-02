// Static part of the Anti-Slop audit (rules from miqdadbadjuber/anti-slop and b4r7x/agent-skills anti-slop):
// copy (em dashes, buzzwords, generic CTAs, exclamations), CSS decoration inventory, controls that render but have no
// handler, and code slop (narrating comments, empty catches, unused exports, AI-voice names).
//   node scripts/antislop-static.mjs [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir, ok) => readdirSync(join(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(root, p)).isDirectory() ? (f === 'node_modules' ? [] : walk(p, ok)) : ok(p) ? [p] : [];
});
const out = {};
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const hits = (file, re, pick = 0) => { const t = read(file); return [...t.matchAll(re)].map((m) => ({ file, line: lineOf(t, m.index), text: (m[pick] || m[0]).trim().slice(0, 90) })); };

// ---- copy: the strings people read (i18n.js holds Indonesian and English)
const i18n = read('src/ui/i18n.js');
const strings = [...i18n.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => ({ text: m[1] ?? m[2], line: lineOf(i18n, m.index) })).filter((s) => /[A-Za-z]{3}/.test(s.text));
const copy = (re) => strings.filter((s) => re.test(s.text)).map((s) => `i18n.js:${s.line} ${s.text.slice(0, 80)}`);
out.copy = {
  stringsRead: strings.length,
  emDash: copy(/—/),
  buzzwords: copy(/\b(seamless|seamlessly|revolutionary|effortless|robust|powerful|leverage|unlock|supercharge|elevate|streamline|cutting-edge|game-changing|next-level|smart|magic|intelligent|ai-powered|best-in-class)\b/i),
  genericCtas: copy(/^(get started|learn more|click here|submit|continue|next|ok|yes|no)$/i),
  exclamations: copy(/!$/),
  apologetic: copy(/\b(oops|sorry|whoops|uh-oh)\b/i),
};

// ---- CSS decoration inventory
const css = read('src/ui/styles.css');
const count = (re) => (css.match(re) || []).length;
out.css = {
  lines: css.split('\n').length,
  gradients: hits('src/ui/styles.css', /(linear|radial|conic)-gradient\([^)]*\)/g).map((h) => `styles.css:${h.line} ${h.text}`),
  shadows: count(/box-shadow\s*:/g),
  blurs: hits('src/ui/styles.css', /(backdrop-)?filter\s*:[^;]*blur[^;]*/g).map((h) => `styles.css:${h.line} ${h.text}`),
  pillRadius: hits('src/ui/styles.css', /border-radius\s*:\s*(999px|9999px|50%)[^;]*/g).map((h) => `styles.css:${h.line}`),
  uppercaseTracking: hits('src/ui/styles.css', /text-transform\s*:\s*uppercase/g).map((h) => `styles.css:${h.line}`),
  transitions: count(/transition\s*:/g),
  animations: count(/@keyframes/g),
  reducedMotion: /prefers-reduced-motion/.test(css),
  focusVisible: count(/:focus-visible/g),
  colorTokens: [...new Set([...css.matchAll(/--([a-z0-9-]+)\s*:\s*#[0-9a-f]{3,8}/gi)].map((m) => m[1]))].length,
  hardcodedColors: hits('src/ui/styles.css', /(?<!--[a-z0-9-]+\s*:\s*)#[0-9a-f]{6}\b/gi).length,
  minTapRule: /min-height\s*:\s*44px/.test(css),
};

// ---- controls that are rendered but have no handler (R-26)
const app = walk('src/ui', (p) => p.endsWith('.js') && !p.endsWith('i18n.js')).map(read).join('\n');
const rendered = new Set([...app.matchAll(/data-action=\\?"([a-z0-9_-]+)\\?"/gi)].map((m) => m[1]));
const handled = new Set([...app.matchAll(/(?:a|action|act)\s*===?\s*'([a-z0-9_-]+)'/gi)].map((m) => m[1]));
const handledMore = new Set([...app.matchAll(/case\s+'([a-z0-9_-]+)'/gi)].map((m) => m[1]));
out.controls = {
  actionsRendered: rendered.size,
  noHandlerFound: [...rendered].filter((a) => !handled.has(a) && !handledMore.has(a) && !new RegExp(`'${a}'`).test(app.replace(new RegExp(`data-action=\\\\?"${a}\\\\?"`, 'g'), ''))).sort(),
};

// ---- code slop (b4r7x categories)
const src = walk('src', (p) => p.endsWith('.js'));
const tests = walk('test', (p) => p.endsWith('.js'));
const code = {};
for (const f of src) {
  const t = read(f);
  const lines = t.split('\n');
  const comments = lines.filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).length;
  const narrate = hits(f, /\/\/\s*(this|here we|now we|first,? we|then we|loop (through|over)|iterate|call the|set the|get the|return the|check if|initialize|define|create a|increment)\b[^\n]*/gi).map((h) => `${relative(root, join(root, f)).replace(/\\/g, '/')}:${h.line} ${h.text}`);
  const section = hits(f, /\/\/\s*[-=*#]{3,}[^\n]*/g).length;
  const emptyCatch = hits(f, /catch\s*(\([^)]*\))?\s*\{\s*(\/\*[^*]*\*\/|\/\/[^\n]*)?\s*\}/g);
  const todo = hits(f, /\b(TODO|FIXME|HACK|XXX)\b[^\n]*/g);
  const aiVoice = hits(f, /\b(enhanced|optimized|improved|robust|seamless|ensures?\s+that|gracefully|comprehensive|leverag(e|ing)|utilize)\b[^\n]*/gi).filter((h) => /\/\/|\/\*|\*/.test(read(f).split('\n')[h.line - 1]));
  code[f] = { lines: lines.length, commentLines: comments, narrating: narrate, sectionDividers: section, emptyCatches: emptyCatch.length, todo: todo.map((h) => `${f}:${h.line}`), aiVoice: aiVoice.map((h) => `${f}:${h.line} ${h.text}`) };
}
const totals = Object.values(code).reduce((a, c) => ({ lines: a.lines + c.lines, comments: a.comments + c.commentLines, emptyCatches: a.emptyCatches + c.emptyCatches }), { lines: 0, comments: 0, emptyCatches: 0 });
out.code = {
  files: src.length, ...totals, commentRatio: Math.round((totals.comments / totals.lines) * 1000) / 10,
  narrating: Object.values(code).flatMap((c) => c.narrating).slice(0, 25),
  aiVoice: Object.values(code).flatMap((c) => c.aiVoice).slice(0, 20),
  todo: Object.values(code).flatMap((c) => c.todo),
  emptyCatchByFile: Object.fromEntries(Object.entries(code).filter(([, c]) => c.emptyCatches).map(([f, c]) => [f, c.emptyCatches])),
  biggestFiles: Object.entries(code).sort((a, b) => b[1].lines - a[1].lines).slice(0, 5).map(([f, c]) => `${f} ${c.lines}`),
};

// unused exports: exported from src, referenced nowhere else in src or test
const everything = [...src, ...tests, ...walk('scripts', (p) => p.endsWith('.mjs'))].map((f) => ({ f, t: read(f) }));
const unused = [];
for (const f of src) {
  const t = read(f);
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) {
    const name = m[1];
    const uses = everything.filter((o) => o.f !== f && new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(o.t)).length;
    const inside = (t.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length;
    if (!uses) unused.push(`${f}: ${name}${inside > 1 ? ' (used only inside its own file)' : ' (not used at all)'}`);
  }
}
out.code.unusedExports = unused;
// single-line wrappers that only forward (over-engineering heuristic)
out.code.forwarders = src.flatMap((f) => hits(f, /(?:const|function)\s+([A-Za-z0-9_$]+)\s*=?\s*\(([^)]*)\)\s*(?:=>)?\s*\{?\s*(?:return\s+)?([A-Za-z0-9_$.]+)\(\2\)\s*;?\s*\}?\s*$/gm).map((h) => `${h.file}:${h.line} ${h.text}`)).slice(0, 15);

if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  const show = (title, v) => console.log(`\n## ${title}\n${typeof v === 'string' ? v : JSON.stringify(v, null, 1)}`);
  show('copy', out.copy); show('css', out.css); show('controls', out.controls); show('code', out.code);
}
