# Cara pakai / How to use

*Bahasa Indonesia di bawah setiap bagian ada versi English.*

## Membuka aplikasi / Opening the app

Link aplikasi sama untuk HP dan PC (ada di `private/webapp.json`, juga dikirim lewat chat). Login dengan akun Google yang sama dengan spreadsheet.
- **HP:** menu di bawah. Tambahkan ke layar utama (Chrome: ⋮ → *Add to Home screen*; Safari: Bagikan → *Add to Home Screen*).
- **PC:** menu di kiri, tabel transaksi lengkap, ringkasan dua kolom. Simpan sebagai bookmark.

Banner kecil "dibuat oleh pengguna Google Apps Script" di atas itu normal.

> One link for phone and PC (in `private/webapp.json`, also sent in chat), signed in with the same Google account as the spreadsheet. Phone: tab bar at the bottom, add it to your home screen. PC: sidebar on the left, a full transactions table and a two-column summary; bookmark it. The small "created by a Google Apps Script user" banner is normal.

## Setiap hari / Every day

- **Tidak perlu apa-apa.** Setiap 10 menit, email transaksi bank masuk otomatis ke spreadsheet. Merchant yang sudah dikenal langsung masuk laporan.
- **Cek** (menu pertama, angka merah = jumlah yang menunggu): pilih kategori → **Simpan**. Kartu langsung hilang; penyimpanan ke Google berjalan di belakang (lihat tanda "Menyimpan…" di pojok kanan atas). Salah pencet? Ketuk **Urungkan** di pesan bawah.
- Biarkan *Selalu pakai kategori ini untuk …* tercentang supaya merchant itu otomatis lain kali (transaksi lain dari merchant yang sama ikut tersimpan).
- **Tambah**: untuk uang tunai atau yang tidak ada emailnya. Rekening dan tanggal terakhir diingat, jadi transaksi berikutnya lebih cepat.
- Salah kategori? **Transaksi** → ketuk barisnya → ubah → **Simpan perubahan**.
- **Ringkasan**: ketuk Pemasukan, Pengeluaran, kategori atau rekening untuk langsung melihat transaksinya.

> Nothing to do: every 10 minutes bank emails become rows, and known merchants go straight to the reports. **Review** (red number = how many wait): pick a category → **Save**. The card goes at once and the save runs in the background ("Saving…" top right); tap **Undo** if you slipped. Keep "Always use this category for …" ticked. **Add** is for cash and remembers your last account and date. Wrong category? **Transactions** → tap the row → edit. In **Summary**, tap income, expenses, a category or an account to see its transactions.

## Fitur lain / More features

- **Detail belanja:** pembayaran ke APPLE.COM/BILL, Tokopedia, Shopee, Xendit dan toko luar negeri otomatis diberi nama toko dan barangnya (dari email struk mereka). Kalau kategorinya belum pasti, transaksinya muncul lagi di **Cek**.
- **Bagi transaksi:** satu pembayaran berisi beberapa hal (mis. buku + barang hobi)? **Transaksi** → ketuk barisnya → **Bagi transaksi ini** → isi jumlah dan kategori tiap bagian. Totalnya harus pas; app memberi tahu sisanya. **Gabungkan lagi** untuk membatalkan.
- **Langganan & tagihan rutin** (di **Ringkasan**): tagihan berikutnya dan perkiraan totalnya per bulan.
- **Tren kategori:** di **Transaksi**, pilih satu kategori → tren 6 bulannya muncul di atas daftar.
- **Aturan otomatis** (di **Pengaturan**): ubah kata dan kategori, tambah aturan baru; app menunjukkan transaksi mana yang cocok.
- **Ringkasan mingguan:** email setiap Senin 07.00. Matikan atau kirim sekarang di **Pengaturan → Ringkasan mingguan**.

> Shop receipts name the APPLE.COM/BILL, Tokopedia, Shopee, Xendit and foreign shop charges with the shop and items. **Split** a payment into parts with their own category (Transactions → tap the row → Split this transaction). **Subscriptions & regular bills** in Summary. Pick a category in Transactions to see its 6-month trend. Edit **automatic rules** in Settings with a live preview. A **weekly summary** email arrives every Monday at 07:00 (Settings → Weekly summary).

## Akhir bulan / Month end (±5 menit)

1. **Pengaturan → Cek saldo akhir bulan**: isi saldo asli tiap rekening. Selisihnya otomatis dicatat sebagai *Penyesuaian*.
2. Ringkasan GoPay bulanan masuk ke **Cek** sebagai "Pengeluaran GoPay (ringkasan bulanan)": pilih kategorinya.
3. Laporan lengkap (Growth, Quarter, Budget, Final Statement) ada di spreadsheet: **Pengaturan → Buka spreadsheet**.

> At month end: Settings → Month-end balance check, enter each account's real balance (the difference becomes a *Penyesuaian* row). The GoPay monthly summary arrives in Review: pick its category. Full reports are in the spreadsheet.

## Pertama kali / First time

- **Pengaturan → Rekening & saldo awal**: isi saldo tiap rekening per **31 Agustus 2026** (malam), lalu **Simpan rekening**. Tanpa ini saldo per rekening dimulai dari 0.
- **Pengaturan → Budget bulanan** (opsional): isi budget per kategori. Ringkasan lalu menunjukkan sisa atau kelebihan budget.

> First time: Settings → Accounts & opening balances: enter each balance as of the end of 31 Aug 2026. Optional: monthly budgets (the Summary then shows what's left or over).

## Kalau ada masalah / If something looks wrong

- **Pengaturan → Sinkron Gmail** menunjukkan kapan terakhir sinkron dan apakah berjalan normal.
- Email bank yang tidak bisa dibaca muncul di **Cek → Email yang belum terbaca** dengan link ke Gmail.
- Kalau penyimpanan gagal, transaksinya kembali ke layar dengan alasannya. Kalau sinkron sedang berjalan, app menunggu dan mencoba lagi sendiri.
- Di spreadsheet, menu **Cashflow Tracker → Sinkron sekarang** menjalankan sinkron langsung.

> Settings → Gmail sync shows the last sync and whether it works normally. Emails that couldn't be read appear in Review with a Gmail link. If a save fails, the transaction comes back on screen with the reason; while a sync is running the app waits and retries by itself. In the spreadsheet, Cashflow Tracker → Sync now runs a sync immediately.
