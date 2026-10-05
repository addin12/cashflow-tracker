// Fails if a file that would be committed contains personal data (docs/DESIGN.md §13).
//   node scripts/check-secrets.mjs          scan staged files (pre-commit)
//   node scripts/check-secrets.mjs --all    scan every tracked file
// Terms come from private/secret-terms.txt (git-ignored, one per line). Digit-only terms match
// only as whole numbers, so hashes in package-lock.json don't trip them. Any @gmail.com address
// other than the placeholders also fails.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const all = process.argv.includes('--all');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = all ? git('ls-files') : git('diff', '--cached', '--name-only', '--diff-filter=ACMR');

const termsFile = 'private/secret-terms.txt';
const terms = existsSync(termsFile)
  ? readFileSync(termsFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = terms.map((t) => ({
  label: `private term #${terms.indexOf(t) + 1}`,
  re: new RegExp(`(?<![A-Za-z0-9])${escape(t)}(?![A-Za-z0-9])`, 'i'),
}));
const PLACEHOLDER_EMAILS = new Set(['you@gmail.com', 'partner@gmail.com']);
const EMAIL = /[A-Za-z0-9._%+-]+@gmail\.com/gi;

const problems = [];
for (const f of files) {
  if (!existsSync(f) || f.startsWith('private/')) {
    if (f.startsWith('private/')) problems.push(`${f}: files under private/ must never be committed`);
    continue;
  }
  const text = all ? readFileSync(f, 'utf8') : execFileSync('git', ['show', `:${f}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  text.split(/\r?\n/).forEach((line, i) => {
    for (const { label, re } of patterns) if (re.test(line)) problems.push(`${f}:${i + 1}: matches ${label}`);
    for (const m of line.match(EMAIL) || []) if (!PLACEHOLDER_EMAILS.has(m.toLowerCase())) problems.push(`${f}:${i + 1}: gmail address`);
  });
}

if (!terms.length) console.warn('check-secrets: private/secret-terms.txt not found, only the e-mail check ran.');
if (problems.length) {
  console.error(`check-secrets: personal data found, commit blocked:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-secrets: ${files.length} file(s) clean`);
