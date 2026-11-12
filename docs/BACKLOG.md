# Backlog

> **Historical (2026-11-12):** this document describes the Google Sheet / Apps Script version, retired and removed from the code on 2026-11-12. The app now runs on Cloudflare (see the cashflow-worker repository and README.md). Where it mentions the spreadsheet, clasp, `src/gas`, Telegram or the monthly e-mails, those parts no longer exist. The shared core in `src/core` and the screens in `src/ui` are still the live code.

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

## Partner's bank mail (2026-11-09)

- **BRI reader added** (`src/core/parsers/bri.js`): her BRI account had no reader, so it held manual rows only. A dry run on her real mail against a copy of the live sheet: 35 rows would be added (7 money in, 28 out; most wait in Review for a category), none matching an existing row. They arrive at the next sync of each of her connected Gmail accounts.
- **The BRI HTML form is unseen.** n8n returns the plain-text part of an email and the app's Gmail reader prefers the HTML part. The reader handles both forms, but only the text form was seen: after the first sync, check the Inbox Log for BRI rows with status "error" (each carries its masked outline).
- Grab e-receipts (8 in 120 days) and Bibit purchase emails have no reader. A Grab receipt could name the shop on the matching BRI row, like the other shop receipts.

- **One of the partner's Gmail accounts has not synced since 08:45 on 2026-11-09** (its row in Connections; the other two sync every 30 minutes at least). Its every-minute trigger is probably gone. The sync now puts the trigger back (`ensureTrigger`) the next time that account's sync runs at all, which only a "Sync now" from that Google account can start. Until then its mail (the BRI payments) is not read. Check the Connections tab: every account's last_sync should be under 30 minutes old.
- A sender added to `SENDERS` makes every account read its mail again from the start date once (`rescanIfSendersChanged`); the status line then says "reading all mail from the start date".

## Round 35 (2026-11-10)

- Done: a warning when a connected Gmail account has not synced for 2 hours (in "Needs attention", and an email to the owner at most every 12 hours); a BCA "Cash Withdrawal" reader; the planner's tests (mutation score 65% → 92%).
- **Coverage of the owner's inbox** (through n8n, headers only): every financial-looking sender has a reader except promotions and monthly statements (Mandiri "Consolidated Statement", Bibit newsletters). Nothing else to build there.
- **Grab e-receipts: not built.** 21 of the partner's 25 were paid with OVO, so no bank row exists to name; a reader would only make sense after the e-wallet decision (one "digital wallet" account would make the receipt the expense row).
- Mutation testing: `api.js` is at 76% overall (89% on the ranges its new tests cover); the rest of its survivors are listed in the section "Mutation testing (2026-11-10)".

## 2026-11-10

- **BRI emails some payments twice** (two Gmail messages, one reference): found after her first account synced, by the data audit (5 payments counted twice, all approved). The planner now skips an email whose reference, account, direction, day and amount are already in the sheet, and ignores the later copy of any that already are (`sameRef` in `src/core/plan.js`). An ignored row can be restored in the app.
- The partner's first account synced on its own after she pressed Sync now: her BRI account went from 6 to 109 rows, all 108 BRI emails read without error, and she had already categorised them.
- `vitest.config.js` and `.gitignore` keep a mutation run's `.stryker-tmp` sandbox out of the tests and out of git.

## Decisions and what was done (2026-11-10)

- **Shared costs (#bersama): keep 50/50.** Nobody has used the tag yet (0 rows), so nothing changes; revisit when it is used.
- **E-wallet top-ups: stay as spending.** 36 top-up rows (the owner 9, about Rp10.7M; the partner 27, about Rp6.9M), already categorised by what they were for. Totals are right; spending inside a wallet is not itemised. This also means Grab receipts (21 of 25 paid with OVO) get no reader. Revisit only if category detail for wallet spending matters: then one "Dompet digital" account, top-ups as transfers into it.
- **Telegram logging: dropped for good** (2026-11-10). The code stays in the repo, switched off; it is not an open item.
- **Accounts list order: done.** Your own accounts are shown first in Settings → Accounts; the stored order (which the spreadsheet's blocks follow) never changes (`src/ui/accountorder.js`, `test/accountorder.test.js`).
- **"Cek cakupan email": covered by the n8n scan** of both inboxes (nothing unread but promotions and statements); running the menu itself is only a check that it works.
- **Oracle server: prepared and validated, not created.** The compose file, the setup script and the Caddyfile validate with dummy values (`docker compose config`, `bash -n`, `caddy validate`). What is left needs the owner: an Oracle Cloud account (card for verification), an Always Free ARM server, a free host name, then steps 4 to 9 of `D:Project
8nserverREADME.md`. The app and its sync do not depend on it; only Claude's mail reading does.

## E-wallets as accounts (2026-11-10, replaces the "stay as spending" decision above)

The owner chose one account per wallet. What the mail allows: **no wallet emails receipts or balances** (OVO sends promotions only, Dana and ShopeePay nothing, GoPay one monthly total that already has a reader). The only receipts are the banks' top-up emails (already read) and Grab receipts. So:

- A top-up to a wallet that is an account is a transfer into it (the planner did this already), so the wallet's balance goes up by the receipt amount. A top-up to a wallet that is NOT an account stays a payment and the app suggests adding the wallet ("account not recognised (OVO …0812)" feeds the existing "new account" row).
- Grab e-receipts (`src/core/parsers/grab.js`, both the ride and the GrabFood layouts) paid with a wallet become spending on that wallet's account: all 16 of the partner's receipts in 4 months read (Rp314.360, all OVO). Cash and card are skipped.
- Past top-ups: once a wallet is an account, "Needs attention" offers to turn them into transfers into it (`convertTopups`). Tap per wallet; only your own rows; a top-up already in the transfer category only gets its wallet side (nothing changes in spending). Without this, past top-ups would count twice next to the wallet's own spending.
- **The balance of a wallet only falls by what is recorded** (Grab, and whatever is typed). Everything else spent from it is not in any mail, so the wallet's balance runs high until a month-end balance check; the check's adjustment is the rest of its spending. Do it at least monthly (Settings → Month-end balance check; the payday reminder already lists every account).
- What each person has to do: add the wallet(s) in Settings → Accounts (the suggestion row does the typing), enter its current balance with a balance check, then tap the conversion row.

## Mutation testing (2026-11-10)

- `money.js` 82% to 90%, `goals.js` 86% to 98% after `test/money-goals-edges.test.js`; `plan.js` 65% to 92% (round 35).
- **`api.js` run in 7 line ranges** (about 3,400 mutants, 18 minutes per range): 76.1% killed. `test/api-edges.test.js` (31 tests: daily close and streak, "Tagih", planned transactions and their creation, assets, the people and phone devices on the settings page, the phone code) lifts the parts it covers (lines 86-160, 810-915, 985-1002) to about 89%. Still open: the yearly-subscription merge (lines 89-93), `mineGoal`, the Telegram chat list (switched off), and the account/category/budget save paths (lines 1012-1075), which were not re-run.
