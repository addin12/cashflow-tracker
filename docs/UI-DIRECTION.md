# UI direction (adopted 2026-11-02)

The direction the Anti-Slop method asks for before UI ships (R-37). Each decision has a one-line reason (R-31). Items marked "to do" are not yet true in the app; the rest is checked by `scripts/antislop-browser.mjs` and `scripts/antislop-static.mjs` (see `anti-slop/audit-001-2026-11-02.md`).

## Design read

Reading this as: a personal money app for two adults, used every day on a phone, in a calm utilitarian style (white cards on a soft grey page, one blue accent, system fonts), ENERGY 1, RHYTHM 2, MOTION 1.

- ENERGY 1: people open it to check a number, not to be entertained.
- RHYTHM 2: list screens repeat on purpose (a ledger should look like a ledger); the overview has one hero card for variety.
- MOTION 1: press and hover feedback, nothing that moves on its own. Durations and easing are tokens (`--dur-quick` 120 ms, `--dur-base` 200 ms, `--ease-out`); nothing transitions "all"; a person who asks for less motion gets none, for every transition and animation (`test/motion.test.js`, `scripts/motion-check.mjs`).

## Decisions and reasons

| Area | Decision | Reason |
|---|---|---|
| Type | System font stack, 17px body, large numbers for the one figure that matters on a screen | Fast, familiar, readable in Indonesian and English, no font download |
| Colour | Neutrals plus one accent (light `#0066cc`, dark `#2997ff`; button fill `--accent-btn`, deeper, so white text passes 4.5:1). Semantic only: green money in, red money out or over budget, amber needs attention | Colour carries meaning; one accent keeps focus on actions |
| Category colours | Eight hues, each in three intensities (tag background, tag text, chart series); used only behind category tags, icons and chart series | Colour-coding that never competes with the money figures |
| Radius | Pill for what you tap to act (buttons, chips, switches, count badges); 12 for fields and small panels; 18 for cards and sheets; 6 for tags | One scale: the shape tells you whether it is a control, a field or a container |
| Icons | One drawn set (`src/ui/icons.js`, 45 icons, 24px grid, 1.8 stroke, round ends, text colour), each named for what it stands for; a plain dot when a category has no match; bank logos stay as logos | Emoji look different on every phone; one set looks like one product |
| Targets | 44px minimum for every control (`--hit`); the yearly chart scrolls sideways so each month keeps a 44px target | Thumb use, and the owner's rule |
| Contrast | WCAG AA in light and dark, checked by axe on 48 screens | People read amounts in sunlight and at night |
| Themes | Follow the system, with a manual toggle; every screen works in both | Daily-use app |
| Copy | Plain Indonesian first, English second; verbs for actions ("Simpan rekening", "Terapkan aturan"); no buzzwords, no exclamation marks, no em dashes | Real people, real money: say what happens |
| Claims | No statistic, tax rule or verdict without a source or a "rule of thumb" label (done for the interest calculator and the health check) | A wrong number about money is worse than none |
| Gradient | One soft accent tint on the overview greeting card and the payday card | The focal point of the screen; carries no information, so it can never mislead |
| Badges | Only for state (waiting, first time, problem); a category is shown by its icon and a word | A chip on every row is noise |
| Pop-ups | Opening one makes the page behind it inert, moves focus into it (the pop-up itself on a phone, so no keyboard opens), keeps Tab inside, and Escape or the backdrop closes it and puts focus back on what opened it (`src/ui/modal.js`) | A keyboard or screen-reader user must not wander into a page they cannot see |
| Messages | They stack (three at most, the newest at the bottom); each keeps its own Undo until it fades | A second message must never take the first one's Undo away |
| Switches | The white thumb of the Us / Me / name and similar switches slides to the active choice (`transform` only, 120 ms) and is placed where it was across redraws (`src/ui/seg.js`) | The one visible motion: it shows what changed, and is gone when motion is reduced |
| On / off settings | Drawn as a switch (48x28, the whole 44px row is the target); it is still a checkbox underneath, so keyboard, label and screen reader work. The off track is the muted grey so it shows on a white card | A pale track is invisible; a custom control must not lose what the native one gives |
| Press feedback | Rows dim or tint, chips, tabs and link buttons shrink to 96% for 120 ms, and `touch-action: manipulation` removes the double-tap delay | A thumb on a row must see it was heard |
| Pop-ups opening | The pop-up fades in and rises 24px in 200 ms (`@starting-style`; a browser without it just shows it). It closes at once, and scrolling past its end stays inside it | It shows where the pop-up came from; the page behind is already waiting when it closes |
| Windows High Contrast | What only a background showed (the sliding thumb, bars, chips, badges, switches) gets an outline or a system colour under `forced-colors: active` | High Contrast removes background colours |
| Figures and titles | Tabular figures everywhere (not only on amounts); titles use `text-wrap: balance`, paragraphs `pretty` | Columns line up; no title ends on one lonely word |
| Loading | Each screen has a skeleton shaped like its first blocks (`scripts/skeleton-check.mjs` keeps the first screenful within 20%) | The page should not jump when the data arrives |

## Tokens

The values every screen is built from. `test/tokens.test.js` checks this table against `src/ui/styles.css` (both themes, and that the two copies of the dark palette are identical), so the two cannot drift apart: change a value in the stylesheet and the test names the line to change here. A new token needs a row.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#000000` | Page background |
| `--card` | `#ffffff` | `#1c1c1e` | Cards, pop-ups and the active switch thumb |
| `--ink` | `#1d1d1f` | `#f5f5f7` | Main text |
| `--ink-2` | `#424245` | `#d1d1d6` | Secondary text and icons |
| `--muted` | `#66666b` | `#a1a1a6` | Hints and captions (4.5:1 on cards) |
| `--line` | `#e3e3e6` | `#38383a` | Borders |
| `--line-soft` | `#f0f0f2` | `#2c2c2e` | Row dividers and the switch track |
| `--accent` | `#0066cc` | `#2997ff` | Links, selected state, the focus ring |
| `--accent-press` | `#0057ad` | `#4aa8ff` | Accent while pressed |
| `--accent-soft` | `#e8f1fb` | `#10263f` | Accent tint: selected rows, the greeting card |
| `--on-accent` | `#ffffff` | same | Text on an accent fill |
| `--accent-btn` | `#0066cc` | `#0a67cf` | Fill of primary buttons (deeper than the accent, so white text passes 4.5:1) |
| `--accent-btn-press` | `#0057ad` | `#0a58b0` | Primary button while pressed |
| `--success` | `#1a7f37` | `#4cc76c` | Money in, done |
| `--success-soft` | `#e4f4e8` | `#11301b` | Background of success states |
| `--warning` | `#8a5300` | `#f0b44c` | Needs attention (text) |
| `--warning-soft` | `#fff3d6` | `#3a2a0c` | Background of attention states |
| `--critical` | `#c9252c` | `#ff6b6b` | Money out over budget, errors |
| `--critical-soft` | `#fdecec` | `#3d1414` | Background of error states |
| `--field` | `#ffffff` | `#2c2c2e` | Input background |
| `--field-line` | `#c8c8cd` | `#48484a` | Input border |
| `--zebra` | `#fafafb` | `#222224` | Alternate row tint |
| `--bar` | `#f5f5f7` | `#161618` | The top and bottom bars (opaque on purpose: contrast cannot depend on what scrolls underneath) |
| `--shadow-modal` | `0 16px 48px -8px rgba(0, 0, 0, .25)` | same | Elevation of pop-ups and messages |
| `--r-card` | `18px` | same | Cards and sheets |
| `--r-field` | `12px` | same | Fields and small panels |
| `--r-tag` | `6px` | same | Tags |
| `--r-pill` | `999px` | same | What you tap to act: buttons, chips, switches, count badges |
| `--nav-w` | `248px` | same | Width of the sidebar on a PC |
| `--toast` | `#1d1d1f` | same | Message bar (dark in both themes) |
| `--on-toast` | `#f5f5f7` | same | Text on the message bar |
| `--hit` | `44px` | same | The smallest a tappable thing may be, in height and width |
| `--dur-quick` | `120ms` | same | Press, hover, a chevron turning |
| `--dur-base` | `200ms` | same | Something entering or leaving: messages, a card sliding away |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | same | The one easing curve |

Category hues: eight, `--t0` to `--t7` (the tint behind a tag or icon) with `--t0i` to `--t7i` (the text or icon on it), and `--ch0` to `--ch7` (the same hues as chart series). A category always gets the same hue (a hash of its name), in both themes.

## Per screen

- Overview: one focal figure (today, then the month), then what needs attention, then where the money went.
- Review: the next waiting transaction, one decision per card.
- Transactions: a plain list grouped by day, filters as chips.
- Settings: one section at a time, labels above fields.

## Third-party requests

Bank and wallet logos load from Google's favicon service when a screen is drawn, so that service can see which banks are used. No logo artwork lives in the repo on purpose. A logo that fails to load falls back to the drawn icon. Nothing else is requested from outside the page.

## Code layout

One file per screen or purpose in `src/ui/`: `app.js` starts the page; `router.js` moves between screens; `review.js`, `dashboard.js` (and `cards.js`), `transactions.js`, `add.js`, `settings.js` (and `forms.js`) are the screens; `editor.js` and `split.js` are pop-ups; `render.js`, `format.js`, `visuals.js`, `icons.js` are what screens are built from; `server.js`, `data.js`, `cache.js` talk to Google and keep data; `events.js` handles taps, submits and changes; `theme.js`, `language.js`, `notifications.js`, `state.js` are the rest. `test/structure.test.js` keeps it that way (no file over 650 lines, small entry, no banners).

## Identity

The wallet mark and the round category icons. Nothing else is decorative.
