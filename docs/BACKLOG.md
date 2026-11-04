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

- The partner's three Gmail sign-ins in n8n, and the 24/7 Oracle Always Free server: see `D:\Project\n8n\BACKLOG.md`.

## Open, found in round 29

- The Cashflow calendar can hold leftover copies of itself from earlier versions (each with its own copy of every bill and payday). From round 29 the sync removes the app's own leftovers (only calendars whose events are all marked as the app's) and reuses an existing one instead of creating another. It runs the next time Settings → Email & pengingat is saved with the calendar on, or at the next morning run.

## Ideas, not started

- A monthly "what changed" email for both people (spending per person, the shared balance).
- Savings goals shared between the two people.
- A masked outline of unreadable bank emails in the Inbox Log (labels only, no names or amounts), so a reader can be fixed without reading the mail.
- A mail coverage report: which other senders look financial and have no reader (domain and counts only).
- Receipt photo to transaction (only with a measured accuracy check first).

## Operations

- Every round so far is pushed and CI is green (build, string check, tests in UTC and Asia/Jakarta). Keep checking CI after each push.
- Dev checks on real data (read-only): `node scripts/smoke-live.mjs [--audit]`, `node scripts/screens-live.mjs`.
