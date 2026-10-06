// Screenshots of the page Google actually serves (private/served-user.html, with its built-in
// snapshot of real data) at phone and PC size. Output stays in private/screens/ (git-ignored).
//   node scripts/fetch-webapp.mjs && node scripts/served-html.mjs && node scripts/screens-served.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
const served = readFileSync('private/served-user.html', 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'ct-served-'));
mkdirSync('private/screens', { recursive: true });
const tabs = (process.argv.find((a) => a.startsWith('--tabs=')) || '--tabs=review,dashboard').slice(7).split(',');
for (const tab of tabs) {
  // The server never answers here, so the screen shows the snapshot built into the page.
  const harness = `<script>
window.google = { script: { get run() { var r = { withSuccessHandler: function () { return r; }, withFailureHandler: function () { return r; }, api: function () {} }; return r; } } };
setTimeout(function () { var b = document.querySelector('.nav [data-tab=${tab}]'); if (b) b.click(); }, 300);
</script>`;
  writeFileSync(join(dir, `${tab}-app.html`), served.replace('<head>', `<head>${harness}`));
  for (const [size, w, h] of [['phone', 390, 1400], ['pc', 1440, 1000]]) {
    const file = join(dir, `${size}-${tab}.html`);
    writeFileSync(file, size === 'phone'
      ? `<!doctype html><body style="margin:0;background:#888"><iframe src="${tab}-app.html" style="border:0;width:${w}px;height:${h}px;display:block"></iframe></body>`
      : served.replace('<head>', `<head>${harness}`));
    const out = join(process.cwd(), 'private', 'screens', `served-${size}-${tab}.png`);
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${join(dir, 'profile')}`,
      `--window-size=${size === 'phone' ? 600 : w},${h}`, '--virtual-time-budget=3000', '--blink-settings=preferredColorScheme=1', `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 60000 });
    console.log(`private/screens/served-${size}-${tab}.png`);
  }
}
