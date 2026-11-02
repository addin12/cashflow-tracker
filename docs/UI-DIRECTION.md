# UI direction (proposed, 2026-11-02)

The direction the Anti-Slop method asks for before UI ships (R-37). Each decision has a one-line reason (R-31). Items marked "to do" are not yet true in the app; see `anti-slop/audit-001-2026-11-02.md`.

## Design read

Reading this as: a personal money app for two adults, used every day on a phone, in a calm utilitarian style (white cards on a soft grey page, one blue accent, system fonts), ENERGY 1, RHYTHM 2, MOTION 1.

- ENERGY 1: people open it to check a number, not to be entertained.
- RHYTHM 2: list screens repeat on purpose (a ledger should look like a ledger); the overview has one hero card for variety.
- MOTION 1: press and hover feedback, 120-200 ms transitions, nothing that moves on its own; `prefers-reduced-motion` is honoured.

## Decisions and reasons

| Area | Decision | Reason |
|---|---|---|
| Type | System font stack, 17px body, large numbers for the one figure that matters on a screen | Fast, familiar, readable in Indonesian and English, no font download |
| Colour | Neutrals plus one accent (light `#0066cc`, dark `#2997ff`; button fill `--accent-btn`, deeper, so white text passes 4.5:1). Semantic only: green money in, red money out or over budget, amber needs attention | Colour carries meaning; one accent keeps focus on actions |
| Category colours | One limited pastel set, only behind category icons (to do: reduce from today's many hues) | Colour-coding that never competes with the money figures |
| Radius | Cards 16, controls 12, pill only for filter chips and the segmented switch (to do) | One scale, not a pill for everything |
| Icons | Emoji for categories and notices today (no assets, familiar). To do: decide between keeping them and one inline SVG set | Emoji look different on each OS; a drawn set would be consistent |
| Targets | 44px minimum for every control (to do: segmented switch, small buttons, link buttons, heat map, yearly bars) | Thumb use, and the owner's rule |
| Contrast | WCAG AA in light and dark, checked by axe on 48 screens | People read amounts in sunlight and at night |
| Themes | Follow the system, with a manual toggle; every screen works in both | Daily-use app |
| Copy | Plain Indonesian first, English second; verbs for actions ("Simpan rekening", "Terapkan aturan"); no buzzwords, no exclamation marks, no em dashes | Real people, real money: say what happens |
| Claims | No statistic, tax rule or verdict without a source or a "rule of thumb" label (to do for the interest calculator and the health check) | A wrong number about money is worse than none |

## Per screen

- Overview: one focal figure (today, then the month), then what needs attention, then where the money went.
- Review: the next waiting transaction, one decision per card.
- Transactions: a plain list grouped by day, filters as chips.
- Settings: one section at a time, labels above fields.

## Identity

The wallet mark and the round category icons. Nothing else is decorative.
