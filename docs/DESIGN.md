# Cashflow Tracker: Design & Build Plan

Status: **DRAFT for review** (2026-10-05). Nothing has been built yet. Decisions are recorded in §11. The architecture (§2) is waiting for final approval.

**Scope decided 2026-10-05:** v1 connects **one Gmail account** (your Gmail). Working together with your partner (their Gmail, shared views) is a planned future phase, described in §12. v1 is built so that adding them later needs no data migration.

A cashflow tracker that reads bank and e-wallet transaction emails from your Gmail and turns them into rows in the format of *Template Cashflow 2025, V.1*. You review, fix and add transactions from your phone. The template's report tabs (Cashflow, Growth Analysis, Quarter Report, Budget Tracker, Final Statement) keep working on top of that data.

Companion docs:
- [TEMPLATE-ANALYSIS.md](TEMPLATE-ANALYSIS.md): how the template works, and the bugs and limits it has
- [EMAIL-SOURCES.md](EMAIL-SOURCES.md): which emails can be read and how each one is parsed
- [mockup.html](mockup.html): screen mockups (open it in a browser)

---

## 1. Goals

1. **Little manual typing.** Every transaction that a bank emails about lands in the tracker on its own, already categorized when it matches a known merchant.
2. **Same structure as the template.** It keeps the same columns (Date · Category · Streams · Description · Details · Debit · Credit), the same idea of streams (Spending / Saving accounts), and the same reports.
3. **Your Gmail now, your partner later.** v1 reads one Gmail account. Every row already records an `owner` and a source `gmail`, so the partner's mailbox can be added later without changing existing data (§12).
4. **Trustworthy numbers.** No double counting (own-account transfers, failed payments, marketplace + bank emails for the same purchase). Nothing is dropped silently, so anything that can't be parsed shows up for review.
5. **Private.** Gmail access is read-only and the data stays inside your own Google account. No third-party server.

Out of scope for v1: partner collaboration (§12), bank API/scraping, receipts OCR, multi-currency, multiple years in one file (one spreadsheet per year, as in the template).

## 2. Recommended architecture: Google Sheets + Apps Script + small web app

```
 ┌──────────── Gmail: you@gmail.com ────────────┐      ┌ ─ ─ future (§12) ─ ─ ┐
 │  BCA · Livin' · blu · Jago · Mandiri Sekuritas · GoPay  │        partner's Gmail
 └─────────────────────────────┬───────────────────────────┘      └ ─ ─ ─ ─ ┬ ─ ─ ─ ─ ─ ┘
                               │ read-only, every 10 min (trigger runs as you)
                               ▼                                            ┊
        ┌──────────────────────────── Apps Script project ──────────────────────────┐
        │  fetch allow-listed senders → parse → map to stream → pair transfers →    │
        │  categorize by rules → write rows (pending / approved)                    │
        └──────────────────────────────────────┬────────────────────────────────────┘
                                               ▼
        ┌────────────────────── Google Sheet "Cashflow 2026" ───────────────────────┐
        │  Transactions (source of truth) · Accounts · Rules · Connections          │
        │  CASHFLOW B:H  ← formula pulls approved Transactions                      │
        │  GROWTH ANALYSIS · QUARTER REPORT · BUDGET TRACKER · FINAL STATEMENT      │
        └──────────────────────────────────────┬────────────────────────────────────┘
                                               ▼
                 Web app (Apps Script HtmlService, phone-friendly)
                 Review · Dashboard · Transactions · Add · Settings
```

**Why this and not a "real" hosted app**

| | Sheets + Apps Script (recommended) | Hosted web app (Next.js + DB + Gmail API) | Local desktop app |
|---|---|---|---|
| Cost | Free | Hosting + DB | Free |
| Gmail access | You authorize your own script once. No Google app review | Gmail read is a *restricted* scope: Google security review for a production app, otherwise test-mode tokens expire about weekly | Same OAuth issue |
| Works on phone | Yes (web app URL) | Yes | No |
| Runs when PC is off | Yes (Google runs the trigger) | Yes | No |
| Template reports | Kept as-is, still live | Must be rebuilt | Must be rebuilt |
| Where data lives | Your Google Drive | Someone's server | Your PC |
| Adding partner later | Share the sheet + they authorize once | New user accounts, same OAuth issue | Not practical |

The template itself is a Google Sheets original (it uses Sheets-only functions, and the FAQ says "File > Make a copy"), so keeping it in Sheets is the natural home. You can always download the sheet as `.xlsx`.

### 2.1 The three parts, in plain terms

| Part | What it is | What it does | Where it lives |
|---|---|---|---|
| **Google Sheet** "Cashflow 2026" | Your template, adapted, plus 4 new tabs | The database *and* the report engine. Every number you see comes from here | Your Google Drive |
| **Apps Script** | Small program attached to the sheet (Google's built-in scripting, like Excel macros but in the cloud) | Every 10 minutes it reads new bank emails, turns them into rows and writes them into the sheet | Inside the sheet (Extensions → Apps Script). The source code is in this repo |
| **Web app** | A web page served by the same Apps Script | Phone-friendly screens to review, add and look at totals. It reads and writes the same sheet | A private Google URL (`script.google.com/macros/s/…/exec`). Add it to your phone's home screen |

There is no server of ours, no database to maintain, and no monthly bill. Google runs the script on its own machines, even while your PC and phone are off.

### 2.2 Day one (one-time setup, ~15 minutes, done together)

1. I upload the adapted sheet to your Drive and push the script into it from this repo (`clasp push`).
2. You open the web app once. Google shows a consent screen listing what the script may do: *read your email (read-only), edit this spreadsheet, run in the background*. The script is your own and not published, so Google first shows **"Google hasn't verified this app"**. Click *Advanced → Go to Cashflow Tracker*. This warning is normal for personal scripts.
3. You enter the **opening balance of every account at the end of 31 Aug 2026** (Settings → Rekening).
4. The first sync reads every bank email since **1 Sep 2026** and fills September and October. You go through the Review screen once to categorize what no rule matched yet. Each "always for this merchant" tap teaches a rule.

### 2.3 A normal day

- 09:17 you pay at a minimarket with QRIS from BCA. 09:18 BCA's email arrives. By ~09:27 the sync has turned it into a row (BCA · Credit Rp20.000 · *Belanja Harian*, via a rule) and it's already in the reports.
- A new merchant shows up in **Review** without a category. You tap a chip, tick "Selalu untuk merchant ini", and next time it's automatic.
- Cash coffee: **Tambah** → amount → category → Simpan (≈5 seconds).
- You open **Ringkasan** to see the month so far and how much you can spend per day until the 28th.

### 2.4 Month end (~5 minutes)

- GoPay's monthly summary email arrives. The app suggests one *Penyesuaian* row so the GoPay balance is right.
- Optional **balance check**: type each account's real balance, and any difference becomes a *Penyesuaian* row (it catches anything a bank didn't email).
- The template's report tabs (Growth, Quarter, Budget, Final Statement) are already up to date. Open them from Settings.

### 2.5 Limits and what happens when something breaks

| Situation | What you notice | What happens |
|---|---|---|
| A bank changes its email layout | The email lands in Review as "Email belum terbaca" with an *open in Gmail* link. After 7 quiet days Settings warns about that bank | You enter it by hand; I update that bank's parser and its tests |
| You change your Google password / revoke access | Settings shows "Sinkron berhenti, hubungkan ulang" | One tap to re-authorize. The next sync catches up, because it overlaps 2 days |
| Google is down or a run fails | Nothing (it retries) | The next run, 10 minutes later, picks up the same emails. Dedupe prevents doubles |
| Delay | — | A transaction appears up to ~10 minutes after the bank's email |
| Google's free script quotas | — | One inbox syncing every 10 minutes uses a small fraction of the daily allowance. A single run may last at most 6 minutes, and the sync is designed to stop and resume |
| Web app look | A thin Google banner at the top ("created by a Google Apps Script user") | Cosmetic, can't be removed on free accounts |
| You want out | — | The sheet is yours. Download it as `.xlsx` at any time. Deleting the script stops everything |

### 2.6 Why not the alternatives (short version)

- **A normal hosted app** (website + database): to read Gmail it needs Google's paid security assessment, or your login silently expires every week. It also costs hosting money and has to rebuild all the template's reports.
- **A desktop app on your PC**: it only syncs while the PC is on and can't be used from your phone.
- **Only Gmail filters + manual typing in the sheet**: free and simple, but you'd still type every transaction, which is exactly what we're removing.

## 3. Data model

### 3.1 `Transactions` sheet (new, app-owned, the source of truth)

| Column | Example | Notes |
|---|---|---|
| `id` | `t_8f3a…` | stable id |
| `date` | 2026-10-05 | transaction date from the email body (not the email's send time) |
| `time` | 09:17:32 | |
| `owner` | Me | always "Me" (your short name) in v1. Kept so a partner can be added later (§12) |
| `stream` | BCA | must exist in `Accounts` |
| `direction` | in / out | in → template **Debit**, out → template **Credit** (the template defines Debit = income) |
| `amount` | 20500 | integer rupiah |
| `category` | fnb | must exist in the category list |
| `description` | CIRCLEKA INDONESIA UTAMA | merchant / counterparty |
| `details` | QRIS · Jakarta Timur | type, location, remarks, marketplace items |
| `source` | email / manual / adjustment | |
| `sender` | bca@bca.co.id | |
| `gmail` | you@gmail.com | which mailbox it came from. One value in v1, kept for §12 |
| `gmail_id` | 18f3c2ab… | dedupe key + "open email" link |
| `ref_no` | 95271202610… | bank reference, second dedupe key |
| `status` | pending / approved / ignored | only `approved` reaches the reports |
| `transfer_id` | x_12 | links the two legs of an own-account transfer |
| `rule_id` | r_7 | which rule categorized it (for "why?") |
| `updated_by`, `updated_at` | | audit |

Bank fees ("Biaya" in Livin'/blu emails) are written as their own row (category *Biaya Admin*) so totals match the bank statement.

### 3.2 `Accounts` sheet (replaces the template's Setup lists)

| stream | type | owner | institution | match hint | opening balance |
|---|---|---|---|---|---|
| BCA | Spending | Me | BCA | source of fund `…12` | 0 |
| Mandiri | Spending | Me | Mandiri | Livin' sender | 0 |
| blu | Spending | Me | blu | `…3456` | 0 |
| Jago | Spending | Me | Jago | `…7890` | 0 |
| GoPay | Spending | Me | GoPay | top-ups | 0 |
| Cash | Spending | Me | — | manual | 0 |
| Jago Dana Darurat | Saving | Me | Jago | Kantong "Dana Darurat" | 0 |
| Saham (Mandiri Sekuritas) | Saving | Me | Mandiri Sekuritas | dividend emails | 0 |

The "match hint" (last digits / pocket name) tells the parser which stream an email belongs to. Only the last 4 digits are stored, never full account numbers. Your 8 streams fit the template's 8 Spending + 8 Saving slots in v1.

### 3.3 `Rules` sheet (auto-categorization)

| id | when (field ~ pattern) | category | stream override | auto-approve | hits |
|---|---|---|---|---|---|
| r_1 | description ~ `CIRCLE ?K` | Belanja Harian | | ✓ | 14 |
| r_2 | description ~ `TOKOPEDIA` | Belanja Online | | | 6 |
| r_3 | description ~ `SPBU` | Transportasi & Bensin | | ✓ | 3 |
| r_4 | description ~ `APPLE.COM/BILL` | Langganan Digital | | ✓ | 2 |

**Decided 2026-10-05: auto-approve is on by default.** A transaction that matches a rule goes straight into the reports, and new rules are created with auto-approve ticked. Only unmatched transactions wait in Review. Auto-added rows stay visible for 7 days in a "Baru ditambahkan" strip under Review, so a wrong rule can be fixed (or undone) quickly.

Rules are checked top-down and the first match wins. In the Review screen, "Always categorize *CIRCLE K* as *Belanja Harian*" creates a rule in one tap, so the system learns from your corrections.

### 3.4 `Connections` sheet (connected Gmail accounts)

| gmail | owner | method | connected | last sync | status |
|---|---|---|---|---|---|
| you@gmail.com | Me | own trigger | 2026-10-05 | 13:40 | ✓ 6 new · 0 errors |

v1 has exactly one row. It also holds the sync log: last successful run, emails seen / parsed / skipped, and parse errors with a link to the email. This feeds the "sync health" line in Settings. More rows are added in §12.

### 3.5 How the template reads the data

`CASHFLOW!B6` gets one formula that lists every **approved** transaction, sorted by date, as the template's 7 input columns (Date, Category, Streams, Description, Details, Debit, Credit). Every existing formula (monthly matrix, streams, growth, quarter, budget, final statement) then works unchanged, after the fixes in TEMPLATE-ANALYSIS.md §4.

## 4. Sync pipeline (runs every 10 minutes)

1. **Fetch.** Gmail search limited to the allow-listed senders (EMAIL-SOURCES.md), newer than the last checkpoint minus 2 days of overlap. The very first run starts at the **start date, 1 Sep 2026**, and works through the backlog in batches (each run stays under Apps Script's 6-minute limit). Skip any `gmail_id` already in `Transactions` or in the skip log.
2. **Route.** sender + subject → a parser. No parser → logged as "ignored (promo/other)". Promos from the same banks are not transactions.
3. **Parse.** Each parser is a pure function: email text → `{datetime, amount, fee, direction, counterparty, type, accountHint, refNo, status}`. It handles each bank's number format (`IDR 20,000.00` BCA vs `Rp1.250.000,50` blu vs `IDR 150.000,00` Livin') and Indonesian/English month names (`Okt`, `Oct`).
4. **Reject non-events.** Failed payments ("Pembayaran Tidak Berhasil"), "Status ≠ Successful", pocket *creation* and monthly statements create no transaction rows.
5. **Map stream.** `accountHint` → `Accounts`. If nothing matches → row is *pending* with the stream left blank.
6. **Pair transfers** (template rule #9: Credit on the source stream, Debit on the destination stream, category *trf ke bank lain*):
   - outgoing + incoming of the **same amount within ±15 min** on two known streams → one transfer pair. *Example from your inbox: a BCA → blu transfer arrives as two emails stamped with the same second.*
   - outgoing whose beneficiary name is the owner (e.g. "YOUR NAME") → transfer even if the other leg never emails.
   - pocket moves (BCA Pocket, Jago Kantong) → transfer between the main stream and the saving stream.
7. **Categorize** with `Rules`. No match → category blank, status *pending*.
8. **Write.** If a rule has auto-approve on, the row is *approved* and appears in reports immediately. Otherwise it is *pending* until you tap ✓ in Review.

Safety rails: a sync run never edits rows a human has touched. A run that fails halfway is safe to repeat because dedupe is by `gmail_id`. A sender that produced zero parsed transactions for 7 days shows a warning, because it usually means the email format changed.

The sync code reads its mailbox list from `Connections` instead of assuming one inbox, so §12 adds rows instead of rewriting it.

## 5. Access, start date, payday, language

- **One spreadsheet** in your Google Drive, private to you.
- **You authorize the sync once** (open the web app → "Hubungkan Gmail" → Google consent screen). The trigger runs as you and reads only your inbox.
- The web app is deployed for your Google account only.
- **Start date: 1 Sep 2026** (decided 2026-10-05). Opening balances = each account's balance at the end of **31 Aug 2026**, entered in Settings (they go into the template's Setup amounts). Earlier months stay empty. September's GoPay summary email (already in your inbox) gives September's GoPay adjustment.
- **Payday: the 28th** (decided 2026-10-05). "Budget per day" = spending-stream balance ÷ days until the next 28th. The template's hard-coded PAYDAY cell is replaced by a formula. The day is editable in Settings.
- **Language: Indonesian and English** (decided 2026-10-05). Every UI string lives in `ui/i18n/id.json` and `ui/i18n/en.json`. The first visit follows the phone's language, and Settings has a switch. Category names are your data, so they don't get translated. The Indonesian wording is yours to approve.

## 6. What can't come from email, and how it's covered

| Gap | Handling |
|---|---|
| Cash spending | **Add** screen: 3 taps (amount → category → save), defaults to the Cash stream |
| GoPay spending (you only get a *monthly summary* email) | Top-ups are captured as transfers into GoPay. At month end, the GoPay summary email suggests a **Penyesuaian** (adjustment) row so the GoPay balance matches. *Penyesuaian* already exists in the template's category list |
| Investments that change in value (Stockbit/Bibit/Sekuritas) | Dividend emails → income automatically. Month-end value update via **Add → Penyesuaian**, following the template FAQ #6 |
| Debit card swipes that a bank doesn't email | Monthly **balance check**: enter the real balance and the app posts the difference as Penyesuaian |

## 7. Web app screens

See [mockup.html](mockup.html). The app is phone-first and opens from a home-screen bookmark.

1. **Review** (home): pending transactions as cards showing merchant, amount, stream and time, with suggested category chips. Tap ✓ to approve or tap a chip to recategorize, with an "Always for this merchant" checkbox. Unparsed emails appear here too, with an "open in Gmail" link.
2. **Dashboard**: this month's Income / Expense / Balance (the CASHFLOW rows 3, 4, 41), category bars against budget (BUDGET TRACKER), stream balances (CASHFLOW Streams), and **budget per day until payday** (the template's Y56, fixed).
3. **Transactions**: search and filter by month, stream and category. Edit, split, ignore or delete.
4. **Add**: expense / income / transfer / adjustment.
5. **Settings**: Gmail sync status (reconnect if needed), accounts & opening balances, categories, rules, payday date, language (Bahasa Indonesia / English), "Open spreadsheet", "Download .xlsx".

The full template reports (Growth Analysis, Quarter Report, Final Statement) stay in the spreadsheet and open from Settings.

## 8. Security & privacy

- **Read-only Gmail scope** (`gmail.readonly`, declared explicitly in `appsscript.json`). The script cannot send, delete or label mail.
- Only allow-listed sender addresses are queried. Email bodies are **not stored**. Only the parsed fields plus the message id are kept.
- Account numbers are stored as last 4 digits only.
- The spreadsheet and web app are restricted to your Google account in v1.
- No external services in v1. AI categorization of unknown merchants (Claude API) is an optional later add-on, off by default, and it would send only the merchant name and amount.

## 9. Code layout (in `D:\Cashflow Tracker`)

```
Cashflow Tracker/
├─ README.md
├─ docs/                     DESIGN.md · TEMPLATE-ANALYSIS.md · EMAIL-SOURCES.md · mockup.html
├─ template/                 original xlsx (untouched) + adapted "Cashflow 2026" xlsx
├─ apps-script/
│  ├─ appsscript.json        timezone Asia/Jakarta, gmail.readonly, Gmail advanced service
│  ├─ src/
│  │  ├─ parsers/            bca.js · livin.js · blu.js · jago.js · sekuritas.js · gopay.js · index.js
│  │  ├─ money.js            amount/date parsing (ID & EN formats)
│  │  ├─ sync.js             fetch → parse → map → pair → categorize → write
│  │  ├─ transfers.js · rules.js · sheet.js · setup.js (builds/fixes the template tabs)
│  │  └─ webapp.js           doGet + server functions for the UI
│  └─ ui/                    index.html · app.js · styles.css
├─ test/
│  ├─ fixtures/              real email bodies, redacted (names/accounts masked)
│  └─ *.test.js              parser, transfer pairing, rules (Node + Vitest)
└─ package.json              build (esbuild → single Apps Script bundle), test, deploy via clasp
```

The parsers, transfer pairing and rules are plain functions with no Google APIs, so they are unit-tested on your PC against real (redacted) emails. Only the thin Gmail/Sheets layer needs Apps Script.

## 10. Build plan

| Phase | What gets built | How it's verified | Size |
|---|---|---|---|
| **0. Foundation** | Repo + tooling (Node, Vitest, esbuild, clasp). Adapted template: TEMPLATE-ANALYSIS.md fixes, `Transactions`/`Accounts`/`Rules`/`Connections` tabs, CASHFLOW pull formula. Upload to your Drive as Google Sheet | Template totals equal hand-calculated totals on sample data | S |
| **1. Parsers** | BCA, Livin', blu (out + in), Jago (transfer + Kantong), Mandiri Sekuritas dividend, failure/promo filters | Unit tests on ~30 real redacted emails from your inbox: every field exact | M |
| **2. Sync** | Fetch, dedupe, stream mapping, transfer pairing, rules, write rows. **Dry-run mode** writes to a `Preview` tab only | Dry run over the last 30 days of your Gmail; you compare against your bank apps | M |
| **3. Web app v1** | Review, Add, Transactions | You use it on your phone for a week | M |
| **4. Dashboard & Settings** | Dashboard, rules/accounts/category editors, sync health | Dashboard numbers equal the spreadsheet's CASHFLOW/BUDGET tabs | M |
| **5. Reconciliation** | GoPay month-end adjustment, balance check, investment month-end values, Tokopedia item names as details | First month-end close matches every bank balance | S |
| *6. Partner collaboration (future)* | *§12* | *Partner connects; Kita/Aku/Dia views add up* | *M* |

After Phase 2 the tracker already fills itself, so Phases 3–5 are about comfort and accuracy.

**Commit policy:** git repo in `D:\Cashflow Tracker`, pushed to a **public** GitHub repo, one commit per phase. See §13 for what is never committed.

## 11. Decisions

| # | Question | Answer (2026-10-05) |
|---|---|---|
| 1 | Architecture: Google Sheets + Apps Script + web app | **Open:** explained in more detail in §2.1–2.6, waiting for your OK |
| 2 | Which Gmail accounts | Only your own Gmail for now. Partner later (§12) |
| 3 | Start date | **1 Sep 2026**, with opening balances as of 31 Aug (§5) |
| 4 | Categories | Starter list in TEMPLATE-ANALYSIS.md §5, accepted for now (editable any time in Settings) |
| 5 | Auto-approve rule matches | **Yes:** straight into the reports (§3.3) |
| 6 | App language | **Both** Indonesian and English (§5) |
| 7 | Payday | **28th** (§5) |
| 8 | GitHub | **Public** repo on your account (§13) |

---

## 12. Future: collaborating with your partner's Gmail

*Not in v1. Noted on 2026-10-05 for a later phase.*

### 12.1 What v1 already does to make this cheap

- Every transaction row has `owner` and `gmail` columns from day one.
- `Accounts` has an `owner` column.
- The sync reads its mailbox list from `Connections` instead of assuming one inbox.
- Parsers are shared by all inboxes, so every bank you already support works for your partner immediately.

Adding your partner therefore needs no migration of existing rows.

### 12.2 How the partner would connect

1. Share the spreadsheet with the partner's Google account (Editor) and allow them on the web app.
2. **Connection method**, chosen per account:
   - **Own sync (recommended).** The partner opens the web app signed in as themselves → Settings → "+ Tambah akun Gmail" → Google consent screen. This installs a trigger that runs as them. Apps Script can only read the mailbox of the account the trigger runs as, so their sync reads only their inbox and yours reads only yours. Neither of you can read the other's email. Only the parsed rows are shared. If one sync stops (for example, a password change revokes access), the other keeps working, and Settings shows which one needs reconnecting.
   - **Forwarding.** In the partner's Gmail, a filter auto-forwards only the bank senders (EMAIL-SOURCES.md §1) to your connected inbox. No second authorization is needed. Rows are tagged with the partner as owner based on the forwarding address. Trade-off: Gmail asks to confirm the forwarding address once, and the filter must be updated whenever a bank is added.
3. A coverage check on their inbox (paste sample emails or run a dry run) shows which of their banks need a new parser.

### 12.3 Changes this phase brings

- **Streams per person.** Partner streams get a name suffix (`BCA · <partner>`). Your existing streams keep their names, so nothing is rewritten. Two people will likely exceed the template's 8 + 8 stream slots, so the setup script rebuilds the CASHFLOW "Streams" block from `Accounts` (up to 20 + 12).
- **Views.** The Dashboard and Transactions get a **Kita / Aku / Dia** switch (household, me, partner).
- **Transfers between you two.** To decide then: count them as an *internal transfer* (household view nets them out, *trf ke bank lain*), or as *income/expense* (e.g. paying each other back).
- **Payday.** One shared payday or one each, for "budget per day".
- **Joint accounts.** If one bank emails both inboxes about the same transaction, dedupe on bank reference number + amount + time keeps one row.
- **Privacy.** Each person can mark a stream as *private*. Its rows count in household totals, but the merchant detail is hidden from the other person (optional, to decide then).

---

## 13. Public repository rules

The code lives in a **public** GitHub repo (decided 2026-10-05). Anyone can read it, so personal and financial data never goes in. Instead it lives in your Google Sheet, or in the local `private/` folder, which is git-ignored.

| Never committed | Where it lives instead |
|---|---|
| Your name, email address, account numbers / last digits | `Accounts` + `Connections` tabs in your sheet |
| Real transactions, balances, merchants with amounts | Your sheet |
| Raw email bodies | Nowhere. Test fixtures are **synthetic or fully redacted** (fake names, fake account numbers, fake reference numbers, rounded amounts) |
| The template `.xlsx` (a paid product by its author) | `template/` on your PC, git-ignored. The repo only describes it (TEMPLATE-ANALYSIS.md), and `setup.js` applies changes to *your* copy |
| `.clasp.json` (script id), spreadsheet id, any tokens | `.clasp.json` git-ignored; `.clasp.example.json` is committed |
| Notes with your real details | `private/NOTES.md` (git-ignored) |

From Phase 0 on, every commit is checked by a pre-commit scan (`npm run check:secrets`) which fails if it finds your name or email, long digit runs that look like account numbers, or Rupiah amounts in fixtures. The docs use placeholders: *Me* / *Partner*, `you@gmail.com`, `…1234`.
