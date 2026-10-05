# Cara pakai / How to use

*Bahasa Indonesia di bawah setiap bagian ada versi English.*

## Membuka aplikasi / Opening the app

Buka link aplikasi (ada di `private/webapp.json`, juga dikirim lewat chat) di HP. Login dengan akun Google yang sama dengan spreadsheet. Lalu **Tambahkan ke layar utama** (Chrome: ⋮ → *Add to Home screen*; Safari: Bagikan → *Add to Home Screen*). Banner kecil "dibuat oleh pengguna Google Apps Script" di atas itu normal.

> Open the app link (in `private/webapp.json`, also sent in chat) on your phone, signed in with the same Google account as the spreadsheet, and add it to your home screen. The small "created by a Google Apps Script user" banner is normal.

## Setiap hari / Every day

- **Tidak perlu apa-apa.** Setiap 10 menit, email transaksi bank masuk otomatis ke spreadsheet. Merchant yang sudah dikenal langsung masuk laporan.
- **Cek** (tab pertama): transaksi yang belum punya kategori. Pilih kategori → **Simpan**. Biarkan *Selalu untuk merchant ini* tercentang supaya lain kali otomatis.
- **Tambah**: untuk uang tunai atau yang tidak ada emailnya (≈5 detik).
- Salah kategori? Buka **Transaksi** → ketuk barisnya → ubah.

> Nothing to do: every 10 minutes bank emails become rows, and known merchants go straight to the reports. **Review** shows rows without a category: pick one and **Save** (keep "Always for this merchant" ticked). **Add** is for cash. Wrong category? **Transactions** → tap the row → edit.

## Akhir bulan / Month end (±5 menit)

1. **Atur → Cek saldo akhir bulan**: isi saldo asli tiap rekening (BCA, Mandiri, blu, Jago, GoPay, Cash, Saham). Selisihnya otomatis dicatat sebagai *Penyesuaian*.
2. Ringkasan GoPay bulanan masuk ke **Cek** sebagai "Pengeluaran GoPay (ringkasan bulanan)": pilih kategorinya.
3. Laporan lengkap (Growth, Quarter, Budget, Final Statement) ada di spreadsheet: **Atur → Buka spreadsheet**.

> At month end: Settings → Month-end balance check, enter each account's real balance (the difference becomes a *Penyesuaian* row). The GoPay monthly summary arrives in Review: pick its category. Full reports are in the spreadsheet.

## Pertama kali / First time

- **Atur → Rekening & saldo awal**: isi saldo tiap rekening per **31 Agustus 2026** (malam), lalu Simpan. Tanpa ini saldo per rekening dimulai dari 0.
- **Atur → Budget bulanan** (opsional): isi budget per kategori.

> First time: Settings → Accounts & opening balances: enter each balance as of the end of 31 Aug 2026. Optional: monthly budgets.

## Kalau ada masalah / If something looks wrong

- **Atur → Sinkron Gmail** menunjukkan kapan terakhir sinkron dan error-nya (kalau ada).
- Email bank yang tidak bisa dibaca muncul di **Cek → Email belum terbaca** dengan link ke Gmail.
- Di spreadsheet, menu **Cashflow Tracker → Sinkron sekarang** menjalankan sinkron langsung.

> Settings → Gmail sync shows the last sync and any error. Emails that couldn't be read appear in Review with a Gmail link. In the spreadsheet, Cashflow Tracker → Sync now runs a sync immediately.
