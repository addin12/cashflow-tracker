# Template Analysis: "Template Cashflow 2025, V.1.xlsx"

The original is kept untouched in `template/`. This file records how the template works, so the app writes data the way the formulas expect, and lists the fixes the adapted copy needs.

The workbook is a **Google Sheets original** exported to Excel. It uses Sheets-only functions (`SEQUENCE`, `FILTER` stored as `__xludf.DUMMYFUNCTION`, lowercase `sum`) and the FAQ says "File > Make a copy".

## 1. Tabs

| Tab | Role | Reads from |
|---|---|---|
| **GUIDELINE** | Column glossary + FAQ (Indonesian) | — |
| **Setup** | Year (D3 = 2026), 8 *Spending* accounts + 8 *Saving* accounts with opening balances (B6:E13) | — |
| **CASHFLOW** | **The input sheet** + monthly summary | its own B:H rows |
| **GROWTH ANALYSIS** | Month-to-month growth of income/expense/balance; balance growth per stream; charts | rawdata |
| **QUARTER REPORT** | Q1–Q4: totals per category, highest income/expense, pie charts | CASHFLOW |
| **BUDGET TRACKER** | Target vs realization per category for a chosen month; monthly allocation per stream | CASHFLOW, rawdata |
| **FINAL STATEMENT** | Year totals per category and final balance per stream | CASHFLOW |
| **rawdata** | Helper tables: month numbers, cumulative stream balances per month, lists for dropdowns | everything |

## 2. CASHFLOW: the input contract

Transactions are typed in rows **6–296**, columns:

| Col | Header | Meaning |
|---|---|---|
| B | Date | transaction date |
| C | Category | dropdown from `K5:K40` |
| D | Streams | account name from Setup (`BCA`, `CASH`, `Reksa Dana`, …) |
| E | Description | e.g. "kopi susu tetangga" |
| F | Details | extra info (free text or link) |
| G | Amount · **Debit** | **money in** (the template defines Debit = income) |
| H | Amount · **Credit** | **money out** |

Month-name separator rows (`B141 FEBRUARY`, `B164 MARCH`, `B183 APRIL`, …) sit inside the input area. They are cosmetic only.

### Summary block (K:Y)

- **Categories** `K5:K40`:
  - `K5:K10` = 6 **income** categories. Totals use column G (Debit).
  - `K11:K38` = 28 **expense** categories. Totals use column H (Credit).
  - `K39` = **Penyesuaian** (adjustment) and `K40` = **trf ke bank lain** (transfer). Both are kept *out of* the Income/Expense totals but still move stream balances.
- Each month cell: `SUMPRODUCT((C=category) * (TEXT(B,"mmm")=month) * G-or-H)`.
- Row 3 Income = `SUM(L5:L10)`, Row 4 Expense = `SUM(L11:L38)`, Row 41 Balance = Income − Expense. X/Y = yearly totals.
- **Streams** (rows 44–65): balance change per stream per month = IN − OUT. IN/OUT are computed in blocks at rows 67–129 by matching column **D**, regardless of category. The yearly column adds the Setup opening balance. Totals: SPENDING, SAVING, TOTAL.
- **Budget per day** (Y49:Y56): `TODAY`, hard-coded `PAYDAY`, days left, and `budget/day = spending total ÷ days left`.

**What this means for the app:** a transaction must become exactly one row with Date, Category, Stream, Description, Details, and *either* Debit *or* Credit. A transfer becomes **two** rows (Credit on the source stream, Debit on the destination stream), both with category `trf ke bank lain` (GUIDELINE #9).

## 3. Placeholder state of the file

Most categories are still placeholders (`Income #2`, `Expenxe #2…#28`). You've already renamed four: income **gaji**, **jajan dari ibu**; expense **skincare**, **fnb**. Streams: `CASH`, `Mandiri`, `BRI`, `BANK #3…#7`; saving `Reksa Dana`, `Saham`, `Obligasi`, `SAVING #1…#5`. There are 7 dummy transactions in Jan–Feb (FAQ #1 says to delete them before use).

## 4. Problems found, and fixes for the adapted copy

All fixes are applied by `src/gas/setup.js` from the patch list in `src/core/formulas.js`. They were **verified on Google Sheets on 2026-10-05**: the self-test passed 11,828 report cells against an independent JS calculation, in both the `en_US` and `id_ID` locales. Problems 11–14 were found by an automated scan of every formula during Phase 0.

| # | Where | Problem | Fix (status) |
|---|---|---|---|
| 1 | CASHFLOW all SUMPRODUCTs | Input range is only rows 6–296 (≈290 rows). Automatic email capture can create thousands of rows a year (more once a partner joins) | Open-ended `SUMIFS($G$6:$G, …)` ranges. The ledger is pulled from `Transactions` (**fixed**) |
| 2 | CASHFLOW all SUMPRODUCTs | `TEXT(date,"mmm")="JAN"` depends on the spreadsheet locale. With an **Indonesia** locale, month names come out in Indonesian (`Mei/Agu/Okt/Des`), so **May, Aug, Oct and Dec would silently sum to 0** | Sum by a real date range: `DATE(year, month, 1)` ≤ date < `DATE(year, month+1, 1)`. The month number comes from the column header (`MATCH(L$1, {"JAN",…}, 0)`). It also filters by the Setup year (**fixed**, verified in `id_ID`) |
| 3 | CASHFLOW Y52 | Payday hard-coded to **2025-07-25**, so "days left" = −437 and budget/day is negative | Next payday computed from Config `payday_day` = 28. The payday itself counts as paid (**fixed**) |
| 4 | BUDGET TRACKER E35 | Income total `SUM(E29:E32)` skips 2 of 6 income rows | `SUM(E29:E34)` (**fixed**) |
| 5 | BUDGET TRACKER J37 | Spending streams total `SUM(J29:J34)` skips 2 of 8 streams | `SUM(J29:J36)` (**fixed**) |
| 6 | BUDGET TRACKER L37 | Saving streams total `SUM(L29:L31)` skips 5 of 8 | `SUM(L29:L36)` (**fixed**) |
| 7 | QUARTER REPORT Q3/Q4 | Income rows 11–14 of **Q3 and Q4** read one row too low (`AA11:AA14`, `AL11:AL14`). Q3/Q4 "Income #6" even read the first *expense* category | Every quarter income row is rewritten as `SUM(CASHFLOW!<months><row-4>)` (**fixed**) |
| 8 | rawdata S1:W… | References a deleted `MONTHLY REPORT` tab (`#REF!`) | Cleared (**fixed**) |
| 9 | Setup / Streams block | Room for only 8 spending + 8 saving streams | Setup slots now read the `Accounts` tab, and unused slots show `-`. Expanding beyond 8 + 8 is **deferred** to the partner phase (DESIGN.md §12): your 8 accounts fit |
| 10 | GUIDELINE | Mentions a "Trx" tab that doesn't exist, and old row numbers (Balance is row 41, not 36) | Links and texts updated (**fixed**) |
| 11 | QUARTER REPORT row 15 | Every quarter's income total `SUM(x9:x13)` skips the 6th income row | `SUM(x9:x14)` (**fixed**) |
| 12 | BUDGET TRACKER H57 | Expense total `SUM(H29:H54)` skips 2 of 28 rows | `SUM(H29:H56)` (**fixed**) |
| 13 | FINAL STATEMENT S14 / U14 | Stream totals `SUM(S6:S11)` / `SUM(U6:U11)` skip 2 of 8 streams | `SUM(S6:S13)` / `SUM(U6:U13)` (**fixed**) |
| 14 | BUDGET TRACKER rows 6–8 | Demo budgets point at placeholder categories, and an empty row shows `#N/A` / `#DIV/0!` | Demo values cleared on first setup, and the cells wrapped in `IFERROR` (**fixed**) |

Fixes 1, 2 and 9 change formulas but not what any report means. The others correct wrong totals or error cells.

**Things the setup deliberately kept:** the template's own semantics (Debit = income, Penyesuaian and transfers left out of Income/Expense, the budget "percentage" formula `(budget − realization) / realization`), its layout, charts and dropdowns. CASHFLOW's month headers `L1:W2` are merged cells, which is why the month number is read from the header text and not from a helper row.

## 5. Starter category list (proposal, for you to edit)

This list is based on your real transactions from the last weeks, and keeps the names you already chose. Capacity is 6 income + 28 expense, plus the two fixed ones.

**Income (6):** gaji · jajan dari ibu · Proyek / Freelance · Dividen & Bunga · Cashback & Refund · Pemasukan Lainnya

**Expense (up to 28):** fnb (makan & minum) · Belanja Harian (minimarket) · Belanja Online · Transportasi & Bensin · Servis & Cuci Kendaraan · Langganan Digital · Hobi & Board Game · Buku · Kesehatan & Optik · skincare · Tagihan & Utilitas · Pulsa & Internet · Rumah Tangga · Pakaian · Nongkrong & Hiburan · Hadiah & Sosial · Iuran & Kas · Pendidikan · Biaya Admin · Pengeluaran Lainnya

**Fixed:** Penyesuaian · trf ke bank lain

Example merchants from your inbox → category: CIRCLE K / Alfamart → *Belanja Harian*, SPBU → *Transportasi & Bensin*, APPLE.COM/BILL → *Langganan Digital*, Tokopedia → *Belanja Online*, car wash → *Servis & Cuci Kendaraan*, bookstore → *Buku*, optician → *Kesehatan & Optik*, cafés → *fnb*, "uang kas" transfer → *Iuran & Kas*.
