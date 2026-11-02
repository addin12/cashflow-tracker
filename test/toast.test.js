// The message bar keeps a stack: a second message must not take the first one's Undo away.
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

let toast;
let dismissToast;
let host;

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><body><div id="toast" class="toasts"></div></body>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window) });
  ({ toast, dismissToast } = await import('../src/ui/render.js'));
  host = document.querySelector('#toast');
});

describe('messages', () => {
  it('stack with the newest first, and each Undo belongs to its own message', () => {
    const undoA = vi.fn();
    const undoB = vi.fn();
    toast('first', { undo: undoA });
    toast('second', { undo: undoB });
    const items = [...host.children];
    expect(items.map((i) => i.textContent.replace('Urungkan', '').trim())).toEqual(['second', 'first']);
    items[1].undo(); // what tapping the older message's Undo runs
    expect(undoA).toHaveBeenCalledTimes(1);
    expect(undoB).not.toHaveBeenCalled();
    items.forEach((i) => dismissToast(i, true));
    expect(host.children).toHaveLength(0);
  });
  it('keeps at most three, dropping the oldest', () => {
    ['a', 'b', 'c', 'd'].forEach((m) => toast(m));
    expect([...host.children].map((i) => i.textContent)).toEqual(['d', 'c', 'b']);
    [...host.children].forEach((i) => dismissToast(i, true));
  });
  it('removes a message after it has faded out', () => {
    vi.useFakeTimers();
    toast('gone soon');
    dismissToast(host.firstElementChild);
    expect(host.children).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(host.children).toHaveLength(0);
    vi.useRealTimers();
  });
});
