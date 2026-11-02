// The sliding thumb of the segmented switches (Us / Me / name, Overview / Report, Monthly / Yearly).
// A screen is drawn again whenever its data changes, so the switch is a new element each time: this remembers where
// each thumb was and starts the new one there, then lets it slide to the active button. Only `transform` and `width`
// move, and a person who asked for less motion gets none (the global reduced-motion rule).
import { $$ } from './state.js';

const last = new Map(); // which switch -> where its thumb was { x, w }

const keyOf = (seg, i) => `${seg.className.replace(/\bthumb\b/, '').trim()}:${i}`;

/** Call after the view's HTML is in the page. */
export function placeThumbs() {
  const seen = new Map();
  $$('#view .seg:not(.wrap)').forEach((seg) => {
    const on = seg.querySelector('button.on');
    if (!on || !on.offsetWidth) return; // hidden, or nothing chosen
    const same = (seen.get(seg.className) || 0);
    seen.set(seg.className, same + 1);
    const key = keyOf(seg, same);
    const now = { x: on.offsetLeft, w: on.offsetWidth };
    const set = (p) => { seg.style.setProperty('--seg-x', `${p.x}px`); seg.style.setProperty('--seg-w', `${p.w}px`); };
    const from = last.get(key);
    if (from && (from.x !== now.x || from.w !== now.w)) {
      set(from);
      seg.classList.add('thumb');
      seg.getBoundingClientRect(); // draw it where it was, so the next change is a move
      set(now);
    } else {
      set(now);
      seg.classList.add('thumb');
    }
    last.set(key, now);
  });
}
