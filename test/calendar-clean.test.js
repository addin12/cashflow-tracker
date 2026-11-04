// The Cashflow calendar: leftover copies made by earlier versions are removed, nothing a person made is touched.
import { afterEach, describe, expect, it } from 'vitest';
import { removeStrayCalendars } from '../src/gas/calendar.js';

const SUMMARY = 'Tagihan, langganan dan gajian dari aplikasi Cashflow';
const calendar = (id, events, description = SUMMARY) => ({
  id, deleted: false, getId() { return id; }, getDescription() { return description; }, getEvents() { return events.map((d) => ({ getDescription: () => d })); },
  deleteCalendar() { this.deleted = true; },
});

afterEach(() => { delete globalThis.CalendarApp; });

describe('removeStrayCalendars', () => {
  it('keeps the calendar in use and removes the app\'s other copies', () => {
    const keep = calendar('keep', ['[cashflow] Cashflow']);
    const copies = [calendar('a', ['[cashflow] Cashflow', '[cashflow] Cashflow']), calendar('b', [])];
    globalThis.CalendarApp = { getOwnedCalendarsByName: () => [keep, ...copies] };
    expect(removeStrayCalendars('keep')).toBe(2);
    expect([keep.deleted, ...copies.map((c) => c.deleted)]).toEqual([false, true, true]);
  });
  it('also recognises a copy by its events when its description is not the app\'s', () => {
    const copy = calendar('copy', ['[cashflow] Cashflow'], '');
    globalThis.CalendarApp = { getOwnedCalendarsByName: () => [copy] };
    expect(removeStrayCalendars('other')).toBe(1);
  });
  it('keeps a copy that holds an event someone added by hand', () => {
    const mixed = calendar('mixed', ['[cashflow] Cashflow', 'dinner with Andi']);
    globalThis.CalendarApp = { getOwnedCalendarsByName: () => [mixed] };
    expect(removeStrayCalendars('other')).toBe(0);
    expect(mixed.deleted).toBe(false);
  });
  it('never touches a calendar that is merely named Cashflow but is not the app\'s', () => {
    const theirs = calendar('theirs', [], 'my own budget');
    globalThis.CalendarApp = { getOwnedCalendarsByName: () => [theirs] };
    expect(removeStrayCalendars('other')).toBe(0);
    expect(theirs.deleted).toBe(false);
  });
});
