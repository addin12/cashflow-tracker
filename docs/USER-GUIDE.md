# Cara pakai / How to use

*Bahasa Indonesia dulu, ringkasan English di bawah tiap bagian. Panduan ini untuk aplikasi di Cloudflare (sejak 2026-11-12); spreadsheet Google tidak dipakai lagi.*

## Membuka aplikasi / Opening the app

- **Alamat:** satu link untuk HP dan PC (diberikan terpisah). Pertama kali, masukkan email-mu, lalu ketik **kode 6 angka** yang dikirim ke email itu. Setelah itu kamu tetap masuk sekitar satu bulan di perangkat yang sama. Hanya dua email yang boleh masuk: milikmu dan milik pasanganmu.
- **Pasang di layar utama:** buka `karjimut.addinalayubi12.workers.dev/pasang` di HP. Android: **Pasang aplikasi**. iPhone (Safari): **Bagikan → Tambahkan ke Layar Utama**. Ikon dompet langsung membuka aplikasi; tekan lama untuk Tambah, Cek, Ringkasan. Link pendek: `/tambah`, `/cek`, `/ringkasan`, `/transaksi`, `/pengaturan`.
- **HP:** menu di bawah. **PC:** menu di kiri, tabel transaksi lengkap, ringkasan dua kolom; tombol **N** membuka Tambah.
- **Di pojok kanan atas**, dari kiri ke kanan: **lonceng** (tagihan 7 hari ke depan, klaim, garansi, hal yang perlu perhatian), **mata** (sembunyikan semua angka), **bulan/matahari** (mode gelap/terang), **ID/EN** (bahasa).
- Aplikasi mengingat pilihan terakhirmu di perangkat itu: Kita/Aku/Dia, Ikhtisar atau Laporan, Bulanan atau Tahunan, periode dan jenis di Transaksi. **Tur singkat** ada di **Pengaturan → Lainnya**.

> One link for phone and PC. Sign in with your e-mail and the 6-digit code sent to it; you stay signed in for about a month per device, and only the two household e-mails can enter. Install it from `karjimut.addinalayubi12.workers.dev/pasang` (Android: Install app; iPhone Safari: Share → Add to Home Screen). Top right: bell, eye (hide numbers), moon/sun (dark mode), ID/EN (language). The app remembers your last choices on each device. A short tour is in Settings → More.

## Setiap hari / Every day

- **Tidak perlu apa-apa.** Email transaksi bank dibaca otomatis (biasanya dalam 1–2 menit; tombol **Pengaturan → Sinkron Gmail → Sinkron sekarang** mengeceknya saat itu juga). Merchant yang sudah dikenal langsung masuk laporan.
- **Cek** (angka merah = yang menunggu): pilih kategori → **Simpan**. Salah pencet? Ketuk **Urungkan** di pesan bawah. Biarkan *Selalu pakai kategori ini untuk …* tercentang supaya merchant itu otomatis lain kali.
- **Tambah:** untuk uang tunai atau yang tidak ada emailnya. **Tulis saja**: ketik "kopi 28rb gopay", "gaji 8,5jt BCA" atau "parkir 5k kemarin #trip", form terisi sendiri, Enter untuk simpan. Jumlah bisa dihitung: `12000+3500`, `3x25rb`. Tombol **Yang biasa** mengisi form dari yang sering kamu ketik. Kalau ada transaksi dengan jumlah sama di hari yang sama, app bertanya dulu (**Jangan simpan** atau **Tetap simpan**).
- **Transaksi:** pilih periode (Periode ini, 30 hari, 90 hari, Tahun ini, Semua), jenis (Pengeluaran, Pemasukan, Transfer, Penyesuaian), dan filter bulan, rekening, kategori, status. Cari dengan kata atau jumlah: `kopi >20rb`, `<=50rb`, `30rb-100rb`, `#trip`. Ketuk baris untuk mengubahnya. **Pilih** beberapa baris untuk memberi satu kategori sekaligus; **Ekspor CSV** mengunduh daftar yang tampil.
- **Ringkasan:** **Ikhtisar** (pengeluaran hari ini dan bulan ini dibanding bulan lalu, budget per kategori) dan **Laporan**. Ketuk angka, kategori, tanggal atau rekening untuk melihat transaksinya.

> Nothing to do: bank e-mails become rows by themselves (Settings → Gmail sync → Sync now checks at once). **Review**: pick a category → Save; Undo if you slipped. **Add** is for cash: type it in one line ("coffee 28k gopay"), amounts can be sums, "The usual" chips refill the form, and a same-amount same-day duplicate is asked about first. **Transactions**: period, kind and filters, search by words or amounts (`coffee >20k`, `30k-100k`, `#trip`), Select many rows, Export CSV. **Summary**: Overview and Reports; tap a number, category, date or account to see its transactions.

## Fitur lain / More features

**Mencatat dan merapikan**
- **Detail belanja:** pembayaran ke APPLE.COM/BILL, Tokopedia, Shopee, Xendit dan toko luar negeri diberi nama toko dan barangnya dari struk emailnya.
- **Bagi transaksi:** satu pembayaran, beberapa kategori. Ketuk barisnya → **Bagi transaksi ini** → isi jumlah tiap bagian (totalnya harus pas). **Gabungkan lagi** untuk membatalkan.
- **Aturan otomatis** (Pengaturan → Otomatis): ubah kata dan kategori, tambah aturan; app menunjukkan transaksi mana yang cocok. **Kategori** juga bisa diubah di situ.
- **Transaksi rutin** (kos, iuran, dll.): di tanggalnya masuk ke Cek atau langsung tercatat.
- **Pertama kali:** pembayaran pertama ke tempat yang belum pernah dibayar diberi tanda, supaya transaksi yang tidak dikenal cepat terlihat.
- **Impor mutasi bank** (Pengaturan → Rutin): BCA tidak mengirim email untuk uang masuk. Unduh mutasi dari KlikBCA (CSV), pilih rekening dan file; app menunjukkan mana yang sudah tercatat dan mana yang baru. Bisa dibatalkan di Riwayat impor.
- **Dompet digital (OVO, DANA, ShopeePay, GoPay):** tambahkan tiap dompet sebagai rekening. Top-up jadi transfer ke dompet; pengeluarannya hanya tercatat kalau ada emailnya atau kamu mengetiknya. Isi saldo dompet di **Cek saldo akhir bulan** sebulan sekali: selisihnya adalah sisa pengeluaran.

**Uang, rencana, dan pengingat**
- **Gaji:** bank tidak mengirim email untuk uang masuk, jadi di tanggal gajian **Cek** menampilkan kartu gaji: isi jumlahnya → **Simpan gaji** (atau **Tidak ada gaji**). Kalau gajian jatuh di akhir pekan atau libur, app memakai hari kerja sebelumnya. Di hari gajian Ringkasan menunjukkan **Hari gajian**: gaji, tagihan sampai gajian berikutnya, kebutuhan target tabungan, sisa, dan sisa per hari. Ringkasan bisa dihitung dari gajian ke gajian (Pengaturan → Aplikasi → Preferensi).
- **Budget** (Pengaturan → Uang & rekening): per kategori, untuk **Kita** dan untuk masing-masing orang. **Isi dari pengeluaran sebelumnya** mengisi yang kosong. **Acara & trip:** beri budget untuk sebuah #tag (mis. #bali), dihitung lintas bulan.
- **Target tabungan:** pilih rekening, nama, target dan tanggal (opsional); Ringkasan menunjukkan yang terkumpul dan yang perlu disisihkan per bulan.
- **Aset, utang & koleksi:** motor, emas, saham (kode seperti IDX:BBCA mengikuti harga pasar), reksa dana, SBN, deposito, piutang, paylater. Ringkasan menunjukkan **Kekayaan bersih**. Isi **Garansi sampai** di sini; kamu diingatkan 30, 7 dan 1 hari sebelumnya.
- **Kartu kredit & paylater:** tambahkan sebagai rekening, isi tanggal cetak dan jatuh tempo; Ringkasan menunjukkan tagihan dan pengingatnya.
- **Langganan & tagihan rutin** (Ringkasan): tagihan berikutnya, total per bulan, yang naik harga, yang baru, dan yang belum ditagih. **Kelola**: tandai "Masih dipakai" atau "Mau berhenti". **Cari langganan tahunan** membaca email setahun ke belakang. **Bukan langganan** menyembunyikan yang bukan tagihan rutin.
- **Tagih:** ketuk transaksi → **Tagih** → nama teman (pisahkan koma); jumlah per orang dihitung. Kartu **Piutang**: ketuk **Lunas** saat uangnya masuk.
- **Klaim asuransi:** ketuk transaksi → **Klaim asuransi** → *Perlu diklaim*. Batasnya = tanggal bayar + batas klaim (Preferensi, bawaan 30 hari); kamu diingatkan 3 hari sebelumnya.
- **Biaya bersama (berdua):** tulis **#bersama** di catatan, atau ketuk **Biaya bersama** di transaksinya. Ringkasan menunjukkan siapa menalangi berapa; **Tandai lunas** setelah membayar. Pembagian (bawaan 50/50) ada di Pengaturan → Pasangan.
- **Tutup hari** (Cek): tulis pengeluaran tunai hari itu lalu **Tutup hari**; angka 🔥 = hari berturut-turut. Kemarin masih bisa ditutup sampai jam 12.00.
- **Tag:** tulis #tag di catatan; Laporan menunjukkan total per tag.
- **Kalender:** tagihan dan rencana bisa muncul di Google Calendar lewat alamat langganan pribadi (diberikan terpisah; jangan dibagikan). Pengingat diatur di kalendernya sendiri.

**Laporan**
- **Laporan Bulanan:** kalender pengeluaran harian, tren dibanding bulan lalu, ke mana uangnya, dan **Alur uang** (uang masuk, pindah antar rekening, dibelanjakan per rekening; ketuk "Dibelanjakan" untuk melihat transaksinya).
- **Laporan Tahunan:** pengeluaran per bulan per kategori, tempat teratas, pengeluaran terbesar, **Rekap tahun** (bisa disalin untuk dibagikan; tombolnya di Ringkasan mulai 15 Desember), **Cek kesehatan keuangan**, **Simulasi bunga** (deposito vs SBN setelah pajak), dan **Daftar harta untuk SPT** (bisa diunduh CSV).

> **Receipts** name Apple/Tokopedia/Shopee/Xendit/foreign charges. **Split** a payment into categories. **Rules**, categories and **recurring transactions** are under Settings → Automatic. **First time** marks a first payment to a place. **Import bank statement** (BCA sends no mail for incoming money). **E-wallets** are accounts; check their balance at month end. **Salary**: enter it on payday (Review shows a card); the Summary then shows the **payday plan**; payday moves to the working day before weekends and holidays. **Budgets** per category for Us and for each person, **trip/event budgets** per #tag, **savings goals**, **assets and debts** (net worth, warranty reminders), **credit cards and paylater**, **subscriptions** (price rises, new, stopped, Find yearly plans), **Bill friends** (Receivables card), **insurance claims**, **Shared costs** (#bersama, Mark as settled), **Close the day** streak, **tags**, a **calendar** subscription. **Reports**: monthly (daily calendar, trend, where it went, Money flow) and yearly (per month per category, top places, biggest spending, Year in review from 15 December, money health check, interest calculator, SPT asset list).

## Notifikasi di HP / Phone notifications

- **Pengaturan → Otomatis → Notifikasi di HP:** ketuk **Aktifkan di perangkat ini** di tiap HP, lalu pilih jenisnya: transaksi baru, pengeluaran besar, tagihan besok, hari gajian, pengingat jam 21.00. **Kirim tes** untuk mencoba. Di iPhone, pasang dulu di layar utama (lihat atas) dan aktifkan dari ikonnya (iOS 16.4 ke atas).
- Notifikasi menggantikan email: tidak ada lagi email mingguan atau bulanan. Kalau pembaca Gmail diam berjam-jam atau ada email bank yang tidak terbaca, kamu juga dapat notifikasi.

> Settings → Automatic → Phone notifications: tap Enable on this device on each phone and choose what you want (new transactions, big spending, bills tomorrow, payday, 21:00 reminder); Send test tries it. On iPhone install to the home screen first. Notifications replace the old e-mails (weekly, monthly, reminders); you are also notified when Gmail reading stops or a bank e-mail cannot be read.

## Akhir bulan / Month end (±5 menit)

0. Di tanggal gajian catat dulu **gaji** di **Cek**, baru cek saldo (kalau tidak, gajinya tercatat sebagai Penyesuaian).
1. **Pengaturan → Rutin → Cek saldo akhir bulan:** semua rekening di satu layar. Isi saldo asli rekening yang ingin dicek (yang kosong dilewati), lalu **Cek saldo**. Selisihnya tampil langsung; catat sebagai *Penyesuaian*, atau pilih kategori kalau tahu asalnya (mis. uang masuk tanpa email → *Pemasukan Lainnya*). Pada cek pertama sebuah rekening, centang **Jadikan saldo awal**: selisihnya masuk ke saldo awal, bukan sebagai pemasukan atau pengeluaran.
2. Ringkasan GoPay bulanan masuk ke **Cek** sebagai "Pengeluaran GoPay (ringkasan bulanan)": pilih kategorinya.

> Month end: Settings → Routine → Month-end balance check: enter each account's real balance; the difference becomes a *Penyesuaian* row (or, on an account's first check, the opening balance). Record salary first on payday. The GoPay monthly summary arrives in Review: pick its category.

## Berdua dengan pasangan / With your partner

Kalian setara di aplikasi ini: hak yang sama, dan masing-masing punya pengaturan sendiri.
- **Pengaturan → Aplikasi → Pasangan** (siapa saja): nama, email Google dan nama seperti di rekening bank, untuk **keduanya**. Mengganti nama membawa transaksi dan rekeningnya. Email milikmu sendiri tidak bisa dihapus (supaya tidak terkunci).
- **Kita / Aku / Dia** di Ringkasan dan Transaksi: uang berdua, punyamu saja, atau punya pasangan saja. Sebuah transaksi milik pemilik rekeningnya. Tambahkan rekening pasanganmu di **Rekening** dengan **Pemilik** = namanya.
- **Punya masing-masing:** tanggal gajian dan kartu gaji, "Tutup hari" beserta runtutannya, notifikasi dan perangkatnya, budget pribadi, dan kalender.
- Email kalian tidak saling terbaca: tiap Gmail hanya dibaca sinkronnya sendiri; yang dibagi hanya transaksinya. Transfer di antara kalian dicatat sebagai transfer, bukan pengeluaran. Tagihan, klaim dan garansi dinotifikasi ke kalian berdua.
- **Yang baru bergabung:** masuk dengan emailnya (kode 6 angka), pasang di layar utama, lalu aktifkan notifikasi. Gmail-nya dihubungkan lewat pembaca Gmail (diatur oleh pemilik; **Pengaturan → Aplikasi → Pasangan** menunjukkan Gmail mana yang terhubung dan kapan terakhir dibaca).

> You are equal in the app and each has your own settings. Settings → Partner holds both names, Google accounts and bank names. **Us / Me / Them** switches the view; a transaction belongs to the owner of its account (add your partner's accounts with Owner = their name). Each has their own payday, salary card, Close-the-day streak, notifications, budgets and calendar. Neither reads the other's e-mail; money between you is a transfer. A newcomer signs in with their e-mail code, installs the app and turns on notifications; their Gmail is connected through the mail reader, which the owner sets up.

## Kalau ada masalah / If something looks wrong

- **Pengaturan → Rutin → Sinkron Gmail** menunjukkan kapan terakhir sinkron dan apakah normal. **Sinkron sekarang** memeriksa saat itu juga; emailnya dibaca satu per satu di belakang, jadi tombolnya menjawab berapa email baru yang ditemukan.
- Email bank yang tidak bisa dibaca muncul di **Cek → Email yang belum terbaca** dengan link ke Gmail; yang bukan transaksi bisa diabaikan. Tiap orang hanya melihat email dari Gmail-nya sendiri; pemilik aplikasi hanya diberi tahu jumlahnya untuk Gmail pasangan, tanpa judul email.
- **Perlu perhatian** (Ikhtisar): rekening baru yang belum ditambahkan, saldo awal yang belum diisi, transfer yang baru tercatat satu sisi (ketuk untuk menggabungkan; app tidak pernah menggabungkan sendiri), dan langkah pertama untuk pengguna baru.
- Kalau penyimpanan gagal, transaksinya kembali ke layar dengan alasannya; kalau sinkron sedang berjalan, app menunggu dan mencoba lagi sendiri.
- Aplikasi tidak mau muncul atau terlihat lama? Muat ulang (di PC Ctrl+F5; di HP tutup lalu buka lagi dari ikonnya).

> Settings → Gmail sync shows the last sync and whether it is healthy; Sync now checks at once (mails are then read one by one in the background, so it reports how many it found). Unreadable bank e-mails appear in Review with a Gmail link, each person seeing only those of their own Gmail (the owner is told only how many there are in the other one, without subjects). "Needs attention" lists new accounts, missing opening balances, one-sided transfers (you join them; the app never does) and first steps for newcomers. A failed save comes back with its reason. If the app looks stale, reload it (Ctrl+F5, or close and reopen from the icon).

## Cadangan / Backup

- **Unduh cadangan** (Pengaturan → Aplikasi → Lainnya): semua transaksi sebagai file CSV, bisa dibuka di Excel atau Google Sheets. Simpan di tempat aman sebulan sekali.
- Cadangan lengkap database dan cara memulihkannya ada di `cashflow-worker/docs/RESTORE.md` (untuk pemilik).

> Settings → More → Download backup gives every transaction as a CSV. The full database backup and restore steps are in `cashflow-worker/docs/RESTORE.md` (owner only).
