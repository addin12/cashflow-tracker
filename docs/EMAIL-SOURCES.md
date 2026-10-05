# Email Sources & Parsing Rules

Built from a read-only scan of the transaction-related emails in the owner's Gmail over the last ~2 weeks (2026-09-23 → 2026-10-05). Personal names and account numbers are masked here. The real (redacted) bodies become test fixtures in Phase 1.

This scan covers **only you@gmail.com**, the one inbox Claude can read right now. When the partner's Gmail is added later (DESIGN.md §12), it gets the same coverage check. Either paste a few sample bank emails, or run the Phase 2 dry run on that account: its "unparsed" log lists every bank sender that still needs a parser.

The allow-list below is shared by all connected accounts. Adding a parser for a new bank enables it for every inbox.

## 1. Allow-list (the only senders the sync queries)

| Sender | Subjects | Produces | Parser |
|---|---|---|---|
| `bca@bca.co.id` | Internet Transaction Journal | QRIS payment (out), transfer (out), pocket transfer (internal) | `bca` |
| `noreply.livin@bankmandiri.co.id` | Pembayaran Berhasil! · Transfer Berhasil · *Pembayaran Tidak Berhasil* | payment (out), transfer (out), **failed → ignored** | `livin` |
| `receipts@blubybcadigital.id` | Transaksimu Pakai blu Berhasil · Info Transaksi Masuk ke blu Kamu | card/QR/transfer (out), incoming transfer (in) | `blu` |
| `noreply@jago.com` | Kamu telah melakukan transfer · Kamu memindahkan uang dari salah satu Kantong | transfer (out), Kantong move (internal) | `jago` |
| `corporate_action@mandirisekuritas.co.id` | Pembayaran Dividen Tunai … | dividend (in) | `sekuritas` |
| `no-reply@customers.go-pay.co.id` | Ini total pengeluaranmu di <bulan> | monthly totals → **suggested Penyesuaian**, no per-transaction rows | `gopay` |
| `noreply@tokopedia.com` | Pesanan Selesai: … | **no money row** (already paid via bank). Item names are added to the matching bank row's Details (Phase 5) | `tokopedia` |

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
