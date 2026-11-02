// Real-browser check of the motion (Edge or Chrome, demo data, real time): taps the Us / Me / name switch and samples
// where its thumb is on the way, with full motion and with reduced motion.
// Exits 1 when the thumb does not slide, or slides when motion is reduced.
//   node scripts/motion-check.mjs
import { openPage, pageFile, sleep } from './cdp.mjs';

async function session(reduced) {
  const page = await openPage(pageFile(10), { reduced });
  try {
    await page.run("document.querySelector('.nav [data-tab=dashboard]').click()");
    await sleep(700);
    const thumbX = () => page.run("(function(){var s=document.querySelector('.seg.who');return s?Math.round(parseFloat(getComputedStyle(s,'::before').transform.split(',')[4])||0):null})()");
    const before = await thumbX();
    await page.run("document.querySelectorAll('.seg.who button')[1].click()");
    const samples = [];
    for (const wait of [30, 40, 40, 60, 400]) { await sleep(wait); samples.push(await thumbX()); }
    return { before, samples };
  } finally {
    page.close();
  }
}

const full = await session(false);
const reduced = await session(true);
console.log('full motion    : thumb x', full.before, '->', JSON.stringify(full.samples), '(at 30, 70, 110, 170 and 570 ms after the tap)');
console.log('reduced motion : thumb x', reduced.before, '->', JSON.stringify(reduced.samples));
const end = full.samples[full.samples.length - 1];
const slides = end !== full.before && full.samples.slice(0, -1).some((x) => x !== full.before && x !== end);
const reducedEnd = reduced.samples[reduced.samples.length - 1];
const jumps = reducedEnd !== reduced.before && !reduced.samples.some((x) => x !== reduced.before && x !== reducedEnd); // never between the two places
console.log(slides ? 'ok: the thumb slides' : 'FAIL: the thumb does not slide on the way');
console.log(jumps ? 'ok: with reduced motion it is at the end at once' : 'FAIL: with reduced motion it still moves (or does not move at all)');
process.exit(slides && jumps ? 0 : 1);
