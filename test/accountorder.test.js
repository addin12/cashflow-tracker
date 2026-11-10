// Your own accounts first on screen; the stored order of the Accounts tab never moves.
import { describe, expect, it } from 'vitest';
import { shownOrder, storedOrder } from '../src/ui/accountorder.js';

const accounts = [{ stream: 'A', owner: 'Me' }, { stream: 'B', owner: 'Dewi' }, { stream: 'C', owner: 'Me' }, { stream: 'D', owner: 'Dewi' }, { stream: 'E' }];
const names = (l) => l.map((a) => a.stream).join('');

describe('shownOrder', () => {
  it('puts the person\'s own accounts first, each group in stored order; an account without an owner belongs to the first member', () => {
    expect(names(shownOrder(accounts, 'Me', 'Me'))).toBe('ACEBD');
    expect(names(shownOrder(accounts, 'Dewi', 'Me'))).toBe('BDACE');
  });
  it('tags every account with its place in storage', () => {
    expect(shownOrder(accounts, 'Dewi', 'Me').map((a) => `${a.stream}${a._orig}`).join(' ')).toBe('B1 D3 A0 C2 E4');
  });
  it('shows a single-owner list as it is', () => {
    expect(names(shownOrder([{ stream: 'X', owner: 'Me' }, { stream: 'Y', owner: 'Me' }], 'Me', 'Me'))).toBe('XY');
  });
});

describe('storedOrder', () => {
  it('writes the accounts back in their stored order, whatever order they were shown in, without the bookkeeping', () => {
    const back = storedOrder(shownOrder(accounts, 'Dewi', 'Me'));
    expect(names(back)).toBe('ABCDE');
    expect(back.every((a) => !('_orig' in a))).toBe(true);
    expect(back[1]).toEqual({ stream: 'B', owner: 'Dewi' });
  });
  it('an account added on screen goes last, and a second round trip keeps everything where it is', () => {
    const shown = shownOrder(accounts, 'Dewi', 'Me');
    const edited = [...shown, { stream: 'NEW', owner: 'Dewi' }]; // what the form returns after "add account"
    expect(names(storedOrder(edited))).toBe('ABCDENEW');
    const again = shownOrder(edited, 'Dewi', 'Me'); // the screen is drawn again from that list
    expect(names(again)).toBe('BDNEWACE');
    expect(names(storedOrder(again))).toBe('ABCDENEW');
  });
  it('removing a blank row leaves the others in place', () => {
    const shown = shownOrder([...accounts, { stream: '' }], 'Dewi', 'Me').filter((a) => a.stream);
    expect(names(storedOrder(shown))).toBe('ABCDE');
  });
});
