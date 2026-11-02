// A browser driven in real time through the DevTools protocol (Edge or Chrome, headless), for the checks that need
// real animation time and real layout: motion-check.mjs, skeleton-check.mjs. Demo data, no network.
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { answers } from './demo-data.mjs';
import { INIT_PLACEHOLDER } from './ui-build.mjs';

const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((b) => existsSync(b));
if (!browser) throw new Error('no Edge/Chrome found');
const dir = mkdtempSync(join(tmpdir(), 'ct-cdp-'));
let ports = 9300;

export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** The built page with the demo data behind it; `delay` is how long the fake server takes to answer, in ms. */
export function pageFile(delay = 10) {
  const harness = `<script>
window.google = { script: { get run() { var ok; var r = { withSuccessHandler: function (f) { ok = f; return r; }, withFailureHandler: function () { return r; },
  api: function (name, json) { var p = JSON.parse(json || '{}'); var A = ${JSON.stringify(answers).replace(/</g, '\\u003c')};
    var data = name === 'dashboard' ? (A['dashboard:' + p.month] || A.init.dashboard) : name === 'init' ? A.init : A[name] || { ok: true };
    setTimeout(function () { ok(JSON.stringify({ data: data })); }, ${Number(delay)}); } }; return r; } } };
</script>`;
  const html = readFileSync('dist/index.html', 'utf8').replace(INIT_PLACEHOLDER, () => `window.__INIT__=${JSON.stringify(answers.init).replace(/</g, '\\u003c')};`).replace('<head>', `<head>${harness}`);
  const file = join(dir, `app-${delay}.html`);
  writeFileSync(file, html);
  return file;
}

/** Opens the page and returns { run(js), close() }. `reduced` emulates prefers-reduced-motion; `width` sets a phone-sized window. */
export async function openPage(file, { reduced = false, width = 500, height = 900 } = {}) {
  ports += 1;
  const port = ports;
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, `profile-${port}`)}`, `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i += 1) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error('the browser did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const send = (method, params = {}) => new Promise((ok) => { id += 1; waiting.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: pathToFileURL(file).href });
  await sleep(1500);
  return {
    run: async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.result.value,
    close: () => { ws.close(); proc.kill(); },
  };
}
