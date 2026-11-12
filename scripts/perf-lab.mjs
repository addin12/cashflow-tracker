// Lab numbers for the page in a real browser (Edge or Chrome, headless, demo data, no network): how long the page takes to start,
// how long the main thread is blocked, and what a tab switch costs. A desktop is faster than a phone: multiply by about 4 for a mid-range one.
//   npm run build && node scripts/perf-lab.mjs
import { openPage, pageFile, sleep } from './cdp.mjs';

const page = await openPage(pageFile(10), { width: 390, height: 844 });
try {
  const nav = JSON.parse(await page.run(`JSON.stringify((function(){
    var n = performance.getEntriesByType('navigation')[0], p = performance.getEntriesByType('paint');
    var fcp = (p.find(function (e) { return e.name === 'first-contentful-paint'; }) || {}).startTime;
    return { responseEnd: Math.round(n.responseEnd), domInteractive: Math.round(n.domInteractive), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp || 0),
      nodes: document.getElementsByTagName('*').length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null };
  })())`));
  console.log(`start-up   : first paint ${nav.fcp} ms, DOM interactive ${nav.domInteractive} ms, DOMContentLoaded ${nav.domContentLoaded} ms, load ${nav.load} ms`);
  console.log(`page       : ${nav.nodes} elements on the first screen (Cek), JS heap ${nav.heapMB} MB`);

  await page.run(`window.__long = []; try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { window.__long.push(Math.round(e.duration)); }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}`);
  const tab = async (name, ready) => {
    await page.run(`window.__t0 = performance.now(); document.querySelector('.nav [data-tab=${name}]').click()`);
    for (let i = 0; i < 100; i += 1) {
      await sleep(10);
      if (await page.run(`!!document.querySelector('${ready}')`)) break;
    }
    return Math.round(await page.run('performance.now() - window.__t0'));
  };
  const rows = [];
  for (const [name, ready] of [['dashboard', '.monthcard'], ['transactions', '.trow, .day-head'], ['add', 'form[data-form=add]'], ['settings', '.set-row'], ['review', '.txcard, .empty']]) rows.push([name, await tab(name, ready)]);
  console.log(`tab switch : ${rows.map(([n, ms]) => `${n} ${ms} ms`).join(', ')} (includes the fake server's 10 ms answer)`);
  const nodes = JSON.parse(await page.run(`JSON.stringify({ report: (function(){ document.querySelector('.nav [data-tab=dashboard]').click(); return 0; })() })`));
  await sleep(300);
  await page.run(`document.querySelector('[data-action=dashview][data-view=report]').click()`);
  await sleep(500);
  const dash = JSON.parse(await page.run(`JSON.stringify({ nodes: document.getElementsByTagName('*').length, long: window.__long })`));
  console.log(`Laporan    : ${dash.nodes} elements`);
  console.log(`main thread: long tasks (over 50 ms) during all of that: ${dash.long.length ? dash.long.join(', ') + ' ms' : 'none'}`);
  void nodes;
} finally {
  page.close();
}
