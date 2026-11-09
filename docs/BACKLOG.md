# Backlog

What is left after round 29 (2026-11-04). Nothing here is broken; each item is waiting for a decision or for a person.

## Waiting for a person

| Item | Who | Why it matters |
|---|---|---|
| ~~Put categories on the partner's waiting transactions~~ | partner | Done: Review was empty on 2 Nov. New waiting rows are categorised the same way. |
| Enter your name as the bank writes it (Settings → Pasangan) | partner (or the owner for them) | Money between the two of you is then a transfer, not spending. A first-step row asks for it. |
| Opening balance of the partner's account (Settings → Month-end balance check) | partner | The balance starts at 0 until a real balance is entered. A first-step row asks for it. |
| Payday and salary of the partner (Settings → Preferences) | partner | The salary card and the "Hari gajian" plan only appear with a payday. |
| The partner's other banks and wallets | partner | Only one bank has sent mail so far; two more Gmail accounts have read nothing yet. |
| A real copy of the one unreadable bank email ("Transfer Berhasil", 2 Sep) | partner forwards it | The reader needs the real layout. "Abaikan" hides it meanwhile. |

## Waiting for a decision

| Item | Options |
|---|---|
| Split of shared costs (`#bersama`) | 50/50 is the default (Config `shared_split`); change it, or split by income. |
| E-wallet top-ups (OVO, ShopeePay, e-money, GoPay, Dana) count as spending | Leave as spending; or one "digital wallet" account and treat top-ups as transfers into it; or per-wallet accounts. |
| Telegram logging (built, off) | Paste a BotFather token in Settings → Telegram. |
| Accounts list order on the Settings screen | Own accounts first would help, but the order of the Accounts tab maps to blocks in the spreadsheet; needs a safe way (display only, sorted back on save). |

## Paused by the owner

- ~~The partner's Gmail sign-ins in n8n~~ Done 2026-11-09: two accounts, both read through n8n. The 24/7 Oracle Always Free server stays paused: see `D:\Project\n8n\BACKLOG.md`.

## Open, found in round 29

- The Cashflow calendar can hold leftover copies of itself from earlier versions (each with its own copy of every bill and payday). From round 29 the sync removes the app's own leftovers (only calendars whose events are all marked as the app's) and reuses an existing one instead of creating another. It runs the next time Settings → Email & pengingat is saved with the calendar on, or at the next morning run.

## Ideas, not started

- A monthly "what changed" email for both people (spending per person, the shared balance).
- Savings goals shared between the two people.
- ~~A masked outline of unreadable bank emails~~ Done (round 30): an email no parser could read is logged with its shape, e.g. `[outline: <text:2> | nama penerima: | <text:2> | nominal: | <amount>]` (`maskedOutline` in `src/core/text.js`, `test/outline.test.js`). Read it in the Inbox Log reason column.
- ~~A mail coverage report~~ Done (round 30): spreadsheet menu "Cek cakupan email / Mail coverage" lists the sender domains of financial-looking mail (last 90 days, up to 200 messages) that no parser reads, with counts only; nothing is saved (`src/gas/coverage.js`). Not run against the real mailbox yet; a parser that needs the body to recognise its mail may show up as missing.
- Receipt photo to transaction (only with a measured accuracy check first).

## Operations

- Every round so far is pushed and CI is green (build, string check, tests in UTC and Asia/Jakarta). Keep checking CI after each push.
- Dev checks on real data (read-only): `node scripts/smoke-live.mjs [--audit]`, `node scripts/screens-live.mjs`.

## Added 2026-11-09

- A transfer recorded on one side only is offered for joining in "Needs attention" (`src/core/transfers.js`); the app never joins it by itself. Found on real data: Rp4.500.000 on 2 Nov between two of the partner's accounts; it becomes a joinable row once her bank name is set (the Mandiri email says her own name, which the app only knows as "her own" when Settings → Pasangan has it).
- The mail coverage report (spreadsheet menu) has not been run on the real mailbox: run it once and see which senders it lists.
- Dev dependencies: 10 npm audit findings remain in @google/clasp and exceljs (see the audit file); not worth a downgrade.

## Test quality (2026-11-09)

- **Flaky tests:** ten full runs (five local zone, five UTC) passed every time.
- **Mutation testing** (Stryker with the vitest runner, 574 mutants over `transfers`, `rules`, `money`, `goals`, `payday`, `shared` in src/core): 83.3% killed. The weakest were `rules.js` (73.4%) and `transfers.js` (79.1%); `test/rules-edges.test.js` and more cases in `test/transfers.test.js` brought them to 93.6% and 98.5% (what survives is equivalent: code that behaves the same either way). Not run on the larger files (`plan.js`, `api.js`, `insights.js`); `money.js` (82%) and `goals.js` (86%) have survivors worth a look. Stryker is not a project dependency: install it in a temporary folder, point \`plugins\` at its vitest runner's \`dist/src/index.js\`, and delete the \`.stryker-tmp\` it leaves in the project.
- **Dead code:** the scan found no unused function; 24 lines of CSS for features that no longer exist (KPI cards, two-column grid, the bar rows, the old rule rows) were removed.
