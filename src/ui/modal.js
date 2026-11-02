// The pop-up: opening it moves focus in and shuts the page behind it, Tab stays inside, closing puts focus back where it was.
import { $ } from './state.js';

/** The control that was last used to ask for something: focus goes back to it when the pop-up closes. */
export const trigger = { el: null };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const shell = () => document.querySelector('.shell');
const isOpen = () => $('#modal').classList.contains('open');
const focusable = () => [...$('#modal').querySelectorAll(FOCUSABLE)].filter((e) => !e.closest('[hidden]'));

/** Shows the pop-up whose content is already in #modal: the page behind it becomes inert and focus moves to the pop-up. */
export function openModal() {
  const modal = $('#modal');
  modal.classList.add('open');
  const page = shell();
  if (page) page.toggleAttribute('inert', true); // nothing behind the pop-up can be tabbed to, clicked or read out
  const sheet = $('.sheet', modal);
  if (sheet) {
    sheet.tabIndex = -1; // a phone gets the pop-up itself, not a field (that would open the keyboard)
    sheet.focus({ preventScroll: true });
  }
}

export function closeModal() {
  const modal = $('#modal');
  const wasOpen = isOpen();
  modal.classList.remove('open');
  modal.innerHTML = '';
  if (!wasOpen) return;
  const page = shell();
  if (page) page.toggleAttribute('inert', false);
  // back to where the person was; if that control is gone (the list was redrawn), to the page itself
  const back = trigger.el && document.contains(trigger.el) ? trigger.el : $('#view');
  if (back && back.focus) back.focus({ preventScroll: true });
}

/** Keeps Tab and Shift+Tab inside the open pop-up. */
export function trapTab(e) {
  const items = focusable();
  if (!items.length) { e.preventDefault(); return; }
  const modal = $('#modal');
  const active = document.activeElement;
  const outside = !modal.contains(active) || active === modal || active === $('.sheet', modal);
  if (e.shiftKey && (outside || active === items[0])) { e.preventDefault(); items[items.length - 1].focus(); }
  else if (!e.shiftKey && (outside || active === items[items.length - 1])) { e.preventDefault(); items[0].focus(); }
}
