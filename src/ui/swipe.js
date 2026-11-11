// Swipe a waiting transaction on Cek: right approves it, left ignores it. The buttons stay; this is the quick way on a phone.
// The swipe presses the card's own button, so the same checks, undo and saving apply (a card without a category snaps back and says why).
import { T } from './state.js';

const THRESHOLD = 90;
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, details';
let drag = null;

function finish(commit) {
  if (!drag) return;
  const { card, dx, active } = drag;
  drag = null;
  if (!active) return;
  card.classList.remove('swiping', 'swipe-ok', 'swipe-no', 'swipe-go');
  card.style.transform = '';
  delete card.dataset.swipeLabel;
  if (commit && Math.abs(dx) > THRESHOLD) {
    const button = card.querySelector(dx > 0 ? '[data-action=approve]' : '[data-action=ignore]');
    if (button) button.click();
  }
}

export function initSwipe() {
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest && e.target.closest('.txcard[data-id]:not(.salary-card)');
    if (!card || e.target.closest(INTERACTIVE)) return;
    drag = { card, x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // it is a scroll
      if (Math.abs(dx) < 10) return;
      drag.active = true;
      drag.card.classList.add('swiping');
      try { drag.card.setPointerCapture(e.pointerId); } catch (err) { /* the move events still arrive */ }
    }
    drag.dx = dx;
    const c = drag.card;
    c.style.transform = `translateX(${Math.round(dx)}px)`;
    c.classList.toggle('swipe-ok', dx > 20);
    c.classList.toggle('swipe-no', dx < -20);
    c.classList.toggle('swipe-go', Math.abs(dx) > THRESHOLD);
    c.dataset.swipeLabel = dx > 0 ? T.swipeOk : T.swipeNo;
  });
  document.addEventListener('pointerup', () => finish(true));
  document.addEventListener('pointercancel', () => finish(false));
}
