// Real-browser check (Edge or Chrome, demo data, real time) of the small details in test/polish.test.js:
// a pop-up eases in (and is at its end at once with reduced motion), a switch is touchable and slides, figures are tabular,
// and in Windows High Contrast the switch, bars and chips keep an outline.
//   node scripts/polish-check.mjs     exits 1 when one of them fails
import { openPage, pageFile, sleep } from './cdp.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); };

async function sheet(reduced) {
  const page = await openPage(pageFile(10), { reduced });
  try {
    await page.run("document.querySelector('.nav [data-tab=transactions]').click()");
    await sleep(900);
    await page.run("document.querySelector('#view [data-action=edit]').click()");
    const ty = "(function(){var s=document.querySelector('#modal .sheet');if(!s)return null;var t=getComputedStyle(s).transform;return t==='none'?0:Math.round(parseFloat(t.split(',')[5])||0)})()";
    const op = "(function(){var m=document.querySelector('#modal');return Math.round(parseFloat(getComputedStyle(m).opacity)*100)})()";
    const samples = [];
    for (const wait of [10, 60, 60, 400]) { await sleep(wait); samples.push([await page.run(ty), await page.run(op)]); }
    return samples;
  } finally { page.close(); }
}
const full = await sheet(false);
check('the pop-up rises and fades in', full[0][0] > 0 || full[0][1] < 100 || full[1][0] > 0 || full[1][1] < 100, JSON.stringify(full));
check('and is in place after 500 ms', full[3][0] === 0 && full[3][1] === 100);
const reduced = await sheet(true);
check('with reduced motion it is in place within a frame or two (no 200 ms glide)', reduced[1][0] === 0 && reduced[1][1] === 100, JSON.stringify(reduced));

async function settings(opts) {
  const page = await openPage(pageFile(10), opts);
  try {
    await page.run("document.querySelector('.nav [data-tab=settings]').click()");
    await sleep(900);
    await page.run("document.querySelector('[data-action=setsection][data-section=emails]').click()");
    await sleep(500);
    return page;
  } catch (e) { page.close(); throw e; }
}

{
  const page = await settings({});
  try {
    const q = "(function(){var i=document.querySelector('.switch input');var l=i.closest('label').getBoundingClientRect();var r=i.getBoundingClientRect();return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),row:Math.round(l.height),checked:i.checked,x:Math.round(parseFloat(getComputedStyle(i,'::before').transform.split(',')[4])||0),fig:getComputedStyle(document.body).fontVariantNumeric})})()";
    const before = JSON.parse(await page.run(q));
    check('the switch is 48x28 and its row is at least 44px tall', before.w === 48 && before.h === 28 && before.row >= 44, JSON.stringify(before));
    check('figures are tabular everywhere', before.fig.includes('tabular-nums'), before.fig);
    await page.run("document.querySelector('.switch input').click()");
    await sleep(500);
    const after = JSON.parse(await page.run(q));
    check('tapping flips it and the thumb moves', after.checked !== before.checked && after.x !== before.x, `${before.x} -> ${after.x}`);
  } finally { page.close(); }
}

{
  const page = await settings({ forced: true });
  try {
    const border = await page.run("parseFloat(getComputedStyle(document.querySelector('.switch input')).borderTopWidth)");
    check('High Contrast: the switch has an outline', border >= 2, `${border}px`);
    await page.run("document.querySelector('.nav [data-tab=dashboard]').click()");
    await sleep(900);
    const seg = await page.run("(function(){var s=document.querySelector('.seg.thumb');return s?parseFloat(getComputedStyle(s,'::before').borderTopWidth):-1})()");
    check('High Contrast: the sliding thumb has an outline', seg >= 2, `${seg}px`);
    const bar = await page.run("(function(){var b=document.querySelector('.bar');return b?parseFloat(getComputedStyle(b).borderTopWidth):-1})()");
    check('High Contrast: a bar has an outline', bar >= 1, `${bar}px`);
  } finally { page.close(); }
}

process.exit(results.every(Boolean) ? 0 : 1);
