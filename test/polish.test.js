// Small interface details of docs/UI-DIRECTION.md kept true in the stylesheet (the real-browser side is scripts/polish-check.mjs).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/ui/settings.js', import.meta.url), 'utf8');
const rule = (selector) => { const m = css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[2] : ''; };

describe('interface details', () => {
  it('lines figures up everywhere, and a tap is a tap', () => {
    const body = rule('body');
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(body).toMatch(/touch-action:\s*manipulation/);
  });
  it('balances titles and tidies the ends of paragraphs', () => {
    expect(css).toMatch(/h1,\s*h2,\s*h3\s*\{\s*text-wrap:\s*balance/);
    expect(css).toMatch(/\.lead,\s*\.hint\s*\{\s*text-wrap:\s*pretty/);
  });
  it('gives rows, chips and tabs press feedback', () => {
    for (const sel of ['button.rowi:active', '.chip:active', '.chip-btn:active', '.nav button:active', 'button.lrow:active']) expect(css, sel).toContain(sel);
  });
  it('eases a pop-up in and keeps its scrolling inside it', () => {
    expect(css).toMatch(/@starting-style\s*\{\s*\.modal\.open\s*\{\s*opacity:\s*0/);
    expect(css).toMatch(/@starting-style\s*\{\s*\.modal\.open \.sheet\s*\{\s*transform:\s*translateY/);
    expect(rule('.sheet')).toMatch(/overscroll-behavior:\s*contain/);
    expect(css).toMatch(/\.modal \{[^}]*overscroll-behavior:\s*contain/);
  });
  it('keeps what only a background showed visible in Windows High Contrast', () => {
    const block = css.slice(css.indexOf('@media (forced-colors: active)'));
    for (const part of ['.seg.thumb::before', '.bar', '.bar i', '.chip', '.badge', '.switch input', '.switch input:checked']) expect(block, part).toContain(part);
  });
  it('draws every on / off setting as a switch, and only those', () => {
    const switches = settings.match(/<label class="check switch">/g) || [];
    expect(switches.length).toBe(8); // six email and calendar options, the push events, auto-approve of a rule
    expect(settings).not.toMatch(/<label class="check"><input type="checkbox" name="(weekly|monthly|payday|bill|close)_email"/);
  });
  it('keeps the switch big enough to touch and the off track dark enough to see', () => {
    const track = rule('.switch input');
    expect(track).toMatch(/width:\s*48px/);
    expect(track).toMatch(/background:\s*var\(--muted\)/);
    expect(rule('.check')).toMatch(/min-height:\s*44px/);
  });
});
