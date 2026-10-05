# Email Sources & Parsing Rules

Built from a read-only scan of the transaction-related emails in the owner's Gmail over the last ~2 weeks (2026-09-23 → 2026-10-05). Personal names and account numbers are masked here. The real (redacted) bodies become test fixtures in Phase 1.

This scan covers **only you@gmail.com**, the one inbox Claude can read right now. When the partner's Gmail is added later (DESIGN.md §12), it gets the same coverage check. Either paste a few sample bank emails, or run the Phase 2 dry run on that account: its "unparsed" log lists every bank sender that still needs a parser.

The allow-list below is shared by all connected accounts. Adding a parser for a new bank enables it for every inbox.

## 1. Allow-list (the only senders the sync queries)

| Sender | Subjects | Produces | Parser |
|---|---|---|---|
| `bca@bca.co.id` | Internet Transaction Journal | QRIS payment, transfer to BCA or another bank (with fee), pocket transfer. *Pocket creation* and *Failed* → skipped | `bca` |
| `noreply.livin@bankmandiri.co.id` | Pembayaran Berhasil! · Transfer Berhasil · Transfer dengan BI Fast Berhasil · Transfer Online Berhasil · Top-up Berhasil · Top-up e-money Berhasil · *Pembayaran Tidak Berhasil* | payment (QR or virtual account, with fee), transfer (with fee), e-wallet / e-money top-up, **failed → skipped** | `livin` |
| `receipts@blubybcadigital.id` | Transaksimu Pakai blu Berhasil(!) · Info Transaksi Masuk ke blu Kamu | debit card / QRIS / transfer (out, fee only when actually charged), incoming transfer (in) | `blu` |
| `noreply@jago.com` | Kamu telah melakukan transfer · Kamu memindahkan uang dari salah satu Kantong · *contact updates* | transfer (out), Kantong move (pocket ↔ main), **contact emails skipped** | `jago` |
| `corporate_action@mandirisekuritas.co.id` | Pembayaran Dividen Tunai … · *Jadwal Pembagian Dividen …* | dividend (in) · **schedule skipped** | `sekuritas` |
| `no-reply@customers.go-pay.co.id` | Ini total pengeluaranmu di <bulan> | monthly totals → **suggested Penyesuaian**, no per-transaction rows | `gopay` |

Inventory on 2026-10-05: about 200 emails from these senders between 2 Aug and 5 Oct 2026, in 19 distinct formats, all covered. Tokopedia order emails were left out: the bank email already records the money, and the item list is a nice-to-have.

**Never parsed:** promotional senders from the same banks (`info@jago.com`, `informasi@klikbca.com`, `official.info@marketing.bankmandiri.co.id`), Stockbit/Bibit newsletters and statements, job alerts, shop surveys.

## 2. Per-parser rules

### BCA (myBCA) · `bca@bca.co.id`
Plain-text body is a `| Label | : | Value |` table, in English.
- `Status` must be `Successful`. `Pocket Creation Successful` creates no row.
- `Transaction Date`: `05 Oct 2026 09:17:32` (English months, WIB).
- **QRIS:** `Transaction Type: QRIS Payment`, `Payment to` (merchant), `Merchant Location`, `Total Payment: IDR 20,000.00`, `Source of Fund: TAHAPAN - 1234****12` (→ stream hint `12`), `Reference No.`
- **Transfer:** `Transfer Type: Transfer to BCA Account` (or other bank), `Beneficiary Name`, `Transfer Amount: IDR 20,000.00`, `Remarks` (→ Details), `Source of Fund`.
- **Pocket transfer:** `Status: Transfer Pocket Successful` → internal transfer between the BCA main stream and the pocket's saving stream.
- Amount format: **comma thousands, dot decimals** (`20,000.00`).

### Livin' by Mandiri · `noreply.livin@bankmandiri.co.id`
Indonesian text.
- Subject `Pembayaran Tidak Berhasil` → **ignore** (seen in the inbox: a payment failed on Livin', then the same purchase went through on blu).
- `Penerima` (merchant / payee), `Tanggal 3 Okt 2026`, `Jam 09:10:14 WIB` (Indonesian months), `Nominal Transaksi IDR 150.000,00` or `Rp 25.000,00`, `Biaya` (fee → own row if > 0), `Jumlah Transfer Rp 50.000` for transfers.
- "dengan QR" in the body → Details `QRIS`.
- Amount format: **dot thousands, comma decimals** (`150.000,00`).

### blu by BCA Digital · `receipts@blubybcadigital.id`
- Outgoing (`Transaksimu Pakai blu Berhasil`): `Total Bayar` / `Total` / `Nominal` `Rp1.250.000,50`, merchant line after `bluAccount`, optional quoted note (`"catatan"`), `Biaya`.
- Incoming (`Info Transaksi Masuk ke blu Kamu`): `Nominal Transfer Rp1.000.000,00`, quoted note (`"catatan"`), sender name + bank, `Tgl & Jam Transaksi 01 Okt 2026 21:25:07 WIB`, `Tipe Transaksi BI-FAST`.
- Amount format: dot thousands, comma decimals.

### Jago · `noreply@jago.com`
- Transfer: `Dari <name> • <acct>` → `Ke <name> <bank> • <acct>`. When the recipient is an owner → own-account transfer.
- Kantong: `penarikan sebesar Rp1.000.000 dari Kantong <nama>` → transfer from the *Jago Dana Darurat* saving stream to the Jago main stream.

### Mandiri Sekuritas · dividends
- Subject carries the stock ticker. The body has the gross/net amount → income, category *Dividen & Bunga*, stream *Saham*.
- Body format still to be confirmed with a fixture in Phase 1.

### GoPay · monthly summary
- `Pengeluaran -Rp100.000 · Pemasukan +Rp1.000` for the month. Used at month end to suggest a Penyesuaian row, so the GoPay stream matches the app balance. It is not split per transaction.

## 3. Cross-email logic

| Situation | Seen in inbox | Rule |
|---|---|---|
| Own-account transfer emailed by both banks | BCA out Rp1.000.000 + blu in Rp1.000.000, both at the same second | Same amount, both streams known, ≤15 min apart → one transfer pair |
| Own-account transfer, only one side emails | Jago → "YOUR NAME · Mandiri" | Beneficiary name matches an owner → transfer. The destination stream comes from the bank name |
| Failed then retried elsewhere | Livin' failed + blu success at the same shop a minute later | Failed one ignored. The success is a normal row |
| Marketplace + bank emails for one purchase | Tokopedia "Pesanan Selesai" + Livin' "Penerima Tokopedia" | Bank email is the money row. Marketplace email is enrichment only |
| Same email fetched twice | — | Dedupe by Gmail message id, then by bank reference number |

## 4. Coverage check (to repeat with the partner's inbox)

Over the scanned window, emails covered QRIS and transfers on BCA, Livin' and blu, card payments on blu, Jago transfers and Kantong moves, and a dividend. **Not covered by email:** GoPay individual spends, cash, and any debit-card swipe a bank doesn't email about. These are handled as described in DESIGN.md §6.

Tip: in each bank app, turn on email notifications for *all* transactions. For example, myBCA emails "Internet Transaction Journal" for app transactions, but card swipes may need a separate setting.

## 5. Implementation notes (Phase 1, 2026-10-05)

- Code: `src/core/parsers/` (one module per sender), `src/core/text.js` (email body → tokens), `src/core/money.js` (amounts and dates).
- Every email body is turned into a list of **tokens** (one per table cell, paragraph or line). The same parser handles the raw HTML that Apps Script receives and the text view used in the tests. `test/parsers.test.js` checks both forms on the same Livin' email.
- Results are `ok` (events), `skip` (with a reason: promo, failed, pocket creation…) or `error` (a transaction email that couldn't be read, e.g. no amount). Errors are never silent: Phase 2 lists them in Review.
- Account hints the parsers extract: BCA *Source of Fund* trailing digits, Livin' `****1234`, blu account number or debit-card last 4, Jago account last 4, Jago/BCA pocket names. `Accounts.match_hint` holds a comma-separated list of these per stream.
- **BCA pockets** count as part of the BCA account: creating a pocket and moving pocket money back to the owner's BCA are internal. A pocket transfer to someone else is a normal transfer out.
- **Top-ups** (DANA, e-money card, …) are transfers when the wallet exists in `Accounts`. Otherwise they go to Review without a category.
- Test fixtures (`test/fixtures/emails/`) are real formats with fake names, account numbers, reference numbers and amounts.
- **Lesson from the first live preview (2026-10-05):** the real HTML often splits one field over several elements, while the text view merges them. Jago puts the payee name and "Bank • number" in two paragraphs of one cell. blu splits the name, "bluAccount" and the account number, and styles amounts in pieces ("Rp" "1.500.000" ",00"). Foreign-currency card payments add a "Nominal dalam USD" line. The parsers now collect runs of tokens instead of a single token, and the sync links any email to a waiting transfer leg (same account, direction, amount, ±15 min) even when the sender name is unreadable. `test/fixtures/emails/jago-transfer.html` (real structure) and the split-layout tests in `test/parsers.test.js` guard this. **When adding a bank, test with its real HTML, not only the text view.**
