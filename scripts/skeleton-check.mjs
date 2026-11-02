// How much the first screenful jumps when a skeleton is replaced by the real screen: the skeleton's blocks against the real
// screen's first blocks (top position and height), on a phone-sized window (real browser, demo data, a server that
// takes 1.5 s to answer). A skeleton cannot be as long as a 7,000px screen, so only the first screenful counts:
// the skeleton must fill it, and each of its blocks must sit where the real block will.
//   node scripts/skeleton-check.mjs [--max=20] [--width=390] [--list]   exits 1 when a block is off by more than the given percent of the window
import { openPage, pageFile, sleep } from './cdp.mjs';

const max = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=20').slice(6));
const WINDOW = 900;
const WIDTH = Number((process.argv.find((a) => a.startsWith('--width=')) || '--width=390').slice(8));
const SCREENS = [
  ['Transactions (first open)', "document.querySelector('.nav [data-tab=transactions]').click()"],
  ['Settings', "document.querySelector('.nav [data-tab=settings]').click()"],
  ['Summary, another person', "document.querySelector('.nav [data-tab=dashboard]').click(); setTimeout(function () { document.querySelectorAll('.seg.who button')[1].click(); }, 100)"],
];
const blocks = "JSON.stringify([...document.querySelector('#view').children].map(function (c) { var r = c.getBoundingClientRect(); return [c.className.split(' ')[0] || c.tagName.toLowerCase(), Math.round(r.top), Math.round(r.height)]; }))";

let worst = 0;
for (const [name, action] of SCREENS) {
  const page = await openPage(pageFile(1500), { width: WIDTH, height: WINDOW });
  try {
    await page.run(action);
    await sleep(600);
    const skeleton = JSON.parse(await page.run(`document.querySelector('#view .skeleton') ? ${blocks} : '[]'`));
    await sleep(1800);
    const real = JSON.parse(await page.run(blocks));
    if (!skeleton.length) { console.log(`${name}: no skeleton shown`); continue; }
    const covered = skeleton.length ? skeleton[skeleton.length - 1][1] + skeleton[skeleton.length - 1][2] : 0;
    const firstScreen = real.filter(([, top]) => top < WINDOW - 110);
    // the real block that each skeleton block stands for, in order
    let off = 0;
    skeleton.forEach(([, top], i) => { if (real[i]) off = Math.max(off, Math.abs(top - real[i][1])); });
    const pct = Math.round((off / WINDOW) * 100);
    const gap = Math.max(0, WINDOW - 110 - covered);
    worst = Math.max(worst, pct, Math.round((gap / WINDOW) * 100));
    console.log(`${name.padEnd(28)} skeleton ${skeleton.length} blocks, ends at ${covered}px (window ${WINDOW - 110}px)   real first screen: ${firstScreen.length} blocks   biggest block offset ${off}px (${pct}%)   empty at the bottom ${gap}px`);
    if (process.argv.includes('--list')) { console.log('  skeleton:', JSON.stringify(skeleton)); console.log('  real    :', JSON.stringify(real.slice(0, 12))); }
  } finally {
    page.close();
  }
}
console.log(worst > max ? `FAIL: the first screenful jumps by more than ${max}%` : `ok: the first screenful is within ${max}%`);
process.exit(worst > max ? 1 : 0);
