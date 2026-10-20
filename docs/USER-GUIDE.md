# Cara pakai / How to use

*Bahasa Indonesia di bawah setiap bagian ada versi English.*

## Membuka aplikasi / Opening the app

Link aplikasi sama untuk HP dan PC (ada di `private/webapp.json`, juga dikirim lewat chat). Login dengan akun Google yang sama dengan spreadsheet.
- **HP:** menu di bawah. Tambahkan ke layar utama (Chrome: ⋮ → *Add to Home screen*; Safari: Bagikan → *Add to Home Screen*).
- **PC:** menu di kiri, tabel transaksi lengkap, ringkasan dua kolom. Simpan sebagai bookmark.

Banner kecil "dibuat oleh pengguna Google Apps Script" di atas itu normal.

> One link for phone and PC (in `private/webapp.json`, also sent in chat), signed in with the same Google account as the spreadsheet. Phone: tab bar at the bottom, add it to your home screen. PC: sidebar on the left, a full transactions table and a two-column summary; bookmark it. The small "created by a Google Apps Script user" banner is normal.

## Setiap hari / Every day

- **Tidak perlu apa-apa.** Email transaksi bank masuk otomatis ke spreadsheet dalam 1–2 menit, dan app yang sedang terbuka memperbarui dirinya sendiri. Merchant yang sudah dikenal langsung masuk laporan.
- **Cek** (menu pertama, angka merah = jumlah yang menunggu): pilih kategori → **Simpan**. Kartu langsung hilang; penyimpanan ke Google berjalan di belakang (lihat tanda "Menyimpan…" di pojok kanan atas). Salah pencet? Ketuk **Urungkan** di pesan bawah.
- Biarkan *Selalu pakai kategori ini untuk …* tercentang supaya merchant itu otomatis lain kali (transaksi lain dari merchant yang sama ikut tersimpan).
- **Tambah**: untuk uang tunai atau yang tidak ada emailnya. Rekening dan tanggal terakhir diingat, jadi transaksi berikutnya lebih cepat.
- Salah kategori? **Transaksi** → ketuk barisnya → ubah → **Simpan perubahan**.
- **Ringkasan**: ketuk Pemasukan, Pengeluaran, kategori atau rekening untuk langsung melihat transaksinya.

> Nothing to do: within a minute or two bank emails become rows (an open app updates itself), and known merchants go straight to the reports. **Review** (red number = how many wait): pick a category → **Save**. The card goes at once and the save runs in the background ("Saving…" top right); tap **Undo** if you slipped. Keep "Always use this category for …" ticked. **Add** is for cash and remembers your last account and date. Wrong category? **Transactions** → tap the row → edit. In **Summary**, tap income, expenses, a category or an account to see its transactions.

## Fitur lain / More features

- **Detail belanja:** pembayaran ke APPLE.COM/BILL, Tokopedia, Shopee, Xendit dan toko luar negeri otomatis diberi nama toko dan barangnya (dari email struk mereka). Kalau kategorinya belum pasti, transaksinya muncul lagi di **Cek**.
- **Bagi transaksi:** satu pembayaran berisi beberapa hal (mis. buku + barang hobi)? **Transaksi** → ketuk barisnya → **Bagi transaksi ini** → isi jumlah dan kategori tiap bagian. Totalnya harus pas; app memberi tahu sisanya. **Gabungkan lagi** untuk membatalkan.
- **Langganan & tagihan rutin** (di **Ringkasan**): tagihan berikutnya dan perkiraan totalnya per bulan.
- **Detail kategori:** di **Transaksi**, pilih satu kategori → grafik 6 bulan, rata-rata per bulan, tempat teratas dan pengeluaran terbesarnya muncul di atas daftar.
- **Aturan otomatis** (di **Pengaturan**): ubah kata dan kategori, tambah aturan baru; app menunjukkan transaksi mana yang cocok.
- **Email otomatis** (atur di **Pengaturan → Email otomatis**): ringkasan mingguan (Senin 07.00), laporan bulanan (tanggal 1), dan pengingat cek saldo (tanggal gajian). Kalau sinkron Gmail bermasalah atau ada email bank baru yang tidak terbaca, Anda juga dikirimi email.
- **Peringatan dobel:** saat **Tambah**, kalau sudah ada transaksi dengan jumlah sama di hari yang sama (mis. dari email bank), app bertanya dulu: **Jangan simpan** atau **Tetap simpan**.
- **Ringkasan → Ikhtisar / Laporan:** Ikhtisar menunjukkan pengeluaran hari ini, pengeluaran bulan ini dibanding bulan lalu di hari yang sama, dan budget per kategori (garis tipis = sudah sejauh mana bulan berjalan; oranye = lebih cepat dari jadwal). Laporan menunjukkan kalender pengeluaran harian (ketuk tanggal untuk melihat transaksinya), tren dibanding bulan lalu, dan diagram ke mana uangnya. Tombol mata menyembunyikan semua angka.
- **Transaksi:** pilih periode (Periode ini, 30 hari, 90 hari, Tahun ini, Semua) dan jenis (Pengeluaran, Pemasukan, Transfer, Penyesuaian) dengan satu ketukan; transaksi dikelompokkan per hari dengan totalnya.
- **Impor mutasi bank** (Pengaturan → Impor mutasi bank): BCA tidak mengirim email untuk uang masuk. Unduh mutasi rekening dari KlikBCA (Informasi Rekening → Mutasi Rekening → Download, file CSV), pilih rekeningnya, pilih filenya. App menunjukkan mana yang sudah tercatat (dilewati) dan mana yang baru; centang yang mau ditambahkan, lalu **Tambahkan**. Bisa dibatalkan di Riwayat impor.
- **Laporan Bulanan / Tahunan:** tahunan menunjukkan pengeluaran per bulan per kategori, kategori dari bulan ke bulan, tempat teratas dan pengeluaran terbesar. **Alur uang** menunjukkan uang masuk, pindah antar rekening, dan dibelanjakan dari mana.
- **Transaksi:** **Pilih** beberapa baris lalu pakai satu kategori (atau abaikan) sekaligus; **Ekspor CSV** mengunduh daftar yang sedang tampil. Di PC, tombol **N** membuka Tambah.
- **Tulis saja** (Tambah): ketik misalnya "kopi 28rb gopay", "gaji 8,5jt BCA" atau "parkir 5k kemarin #trip"; form terisi sendiri, Enter untuk simpan. Kolom jumlah bisa menghitung: 12000+3500, 3x25rb.
- **Tagih:** buka transaksi → **Tagih** → nama-nama teman (pisahkan koma); jumlah per orang dihitung otomatis. Di Ringkasan, kartu **Piutang**: ketuk **Lunas** saat uangnya masuk.
- **Tag:** tulis #tag di catatan transaksi (mis. #trip); Laporan menunjukkan total per tag, dan pencarian "#trip" menampilkan semuanya.
- **Langganan → Kelola:** total per bulan dan per tahun, tandai "Masih dipakai" atau "Mau berhenti", dan link cara berhenti.
- **Transaksi rutin** (Pengaturan): kos, iuran tunai, dll. Di tanggalnya transaksi masuk ke Cek (atau langsung tercatat).
- **Aset, utang & koleksi** (Pengaturan): motor, emas, saham (kode seperti IDX:BBCA ikut harga pasar), koleksi dan utang; Ringkasan menunjukkan **Kekayaan bersih**.
- **Gaji:** bank tidak mengirim email untuk uang masuk, jadi di tanggal gajian **Cek** menampilkan kartu "Gaji 28 …": isi jumlahnya → **Simpan gaji** (jumlah terakhir sudah terisi). Tidak ada gaji bulan itu? **Tidak ada gaji**. Rekening gaji dan gaji biasanya bisa diubah di **Pengaturan → Preferensi**.
- **Ringkasan dari gajian ke gajian** (Pengaturan → Preferensi → Ringkasan dihitung): "Oktober" = 28 Sep – 27 Okt, jadi gaji tanggal 28 dihitung untuk bulan berikutnya. Laporan di spreadsheet tetap per bulan kalender.
- **Bukan langganan:** di kartu *Langganan & tagihan rutin*, ketuk **Bukan langganan** di bawah nama yang bukan tagihan rutin.
- **Budget cepat:** di **Pengaturan → Budget bulanan**, tiap kategori menunjukkan pengeluaran bulan lalu; **Isi dari pengeluaran sebelumnya** mengisi yang masih kosong, lalu **Simpan budget**.
- **Target tabungan** (atur di **Pengaturan → Target tabungan**): pilih rekening, nama, jumlah target dan tanggal (opsional). **Ringkasan** menunjukkan berapa yang sudah terkumpul dan berapa yang perlu disisihkan per bulan; laporan bulanan juga.
- **Catat lewat email:** kirim email ke diri sendiri berisi "catat kopi 28rb gopay" (subjek atau isi; satu baris satu transaksi). Dalam 1–2 menit masuk; yang belum lengkap menunggu di **Cek**.
- **Yang biasa** (Tambah): yang sering Anda ketik sendiri muncul sebagai tombol; satu ketukan mengisi form.
- **Tagihan 7 hari ke depan:** tombol lonceng menunjukkan transaksi rutin dan langganan yang segera jatuh tempo. Pengingat email sehari sebelumnya bisa dinyalakan di **Pengaturan → Email otomatis**.
- **Acara & trip** (Ringkasan): beri budget untuk #tag (mis. #bali); semua transaksi dengan tag itu dihitung, lintas bulan.
- **Hari ini** (Cek): tulis pengeluaran tunai lalu Enter, kemudian **Tutup hari**; angka 🔥 = hari berturut-turut yang sudah ditutup. Pengingat jam 21.00 (mati secara bawaan) ada di **Pengaturan → Email otomatis**.
- **Jenis aset** sekarang juga: reksa dana, obligasi/SBN, deposito, dana pensiun, gadget & barang, piutang, dan paylater/kartu kredit (dihitung sebagai utang).
- **Gajian maju:** kalau tanggal gajian jatuh di Sabtu, Minggu, libur nasional atau cuti bersama, app memakai hari kerja sebelumnya (kartu gaji, periode ringkasan, sisa hari).
- **Langganan berubah:** kartu Langganan dan email mingguan menandai yang *naik harga*, yang *baru*, dan yang *belum ditagih* (mungkin sudah berhenti).
- **Langganan tahunan:** Langganan → Kelola → **Cari langganan tahunan** membaca email bank dan struk setahun ke belakang (1–4 menit). Yang ditemukan muncul dengan tanggal perpanjangannya. Berjalan sendiri sekali.
- **Kartu kredit & paylater** (Pengaturan): tambahkan kartunya sebagai rekening, lalu isi tanggal cetak dan jatuh tempo. Ringkasan menunjukkan tagihan, yang sudah dibayar, dan pengingatnya.
- **Cek kesehatan keuangan** (Ringkasan): berapa bulan dana darurat cukup, berapa persen pemasukan yang disisihkan, dan utang dibanding harta. **Simulasi bunga** membandingkan deposito dan SBN setelah pajak.
- **Daftar harta untuk SPT** (Laporan → Tahunan): harta dan utang dengan kode SPT, bisa diunduh sebagai CSV.
- **Pertama kali:** pembayaran pertama ke tempat yang belum pernah dibayar diberi tanda, supaya transaksi yang tidak dikenal cepat terlihat.
- **Tutup kemarin:** lupa menutup hari? Sampai jam 12.00 besoknya masih bisa, runtutannya tidak putus.
- **Pasang di layar utama:** buka **karjimut.vercel.app/pasang** di HP, lalu **Pasang aplikasi** (Android) atau **Bagikan → Tambahkan ke Layar Utama** (iPhone). Ikon dompet Cashflow langsung membuka aplikasi; tekan lama untuk Tambah, Cek dan Ringkasan.
- **Link pendek:** karjimut.vercel.app/tambah, /cek, /ringkasan, /transaksi, /pengaturan membuka layar itu.
- **Notifikasi di HP** (Pengaturan → Notifikasi di HP): ketuk **Aktifkan di perangkat ini** di tiap HP, lalu pilih jenisnya: transaksi baru, pengeluaran besar, tagihan besok, hari gajian, pengingat 21.00. **Kirim tes** untuk mencoba. Di iPhone, pasang dulu di layar utama dan aktifkan dari ikonnya (iOS 16.4+).
- **Cadangan bulanan:** email laporan bulanan (tanggal 1) melampirkan file CSV berisi semua transaksi. Simpan di tempat yang aman: spreadsheet bukan satu-satunya salinan.
- **Cari dengan jumlah** (Transaksi): ketik `>20rb`, `<=50rb`, `30rb-100rb` atau `28rb` (tepat), boleh bersama kata, mis. `kopi >20rb`.
- **Klaim asuransi:** buka transaksi → **Klaim asuransi** → *Perlu diklaim*. Batasnya = tanggal bayar + batas klaim (Pengaturan → Preferensi, bawaan 30 hari). Ringkasan menunjukkan yang belum diklaim, dan kamu diingatkan 3 hari sebelum batas. Tandai *Sudah diklaim* atau *Tidak perlu* kalau selesai.
- **Langganan pindah rekening:** kartu Langganan menandai "pindah dari GoPay" kalau tagihannya sekarang dari rekening lain.
- **Hari di bawah budget:** Ringkasan menunjukkan berapa hari bulan ini yang pengeluarannya di bawah jatah harian budget, dan berapa hari tanpa belanja.
- **Kebiasaan per kategori:** layar kategori (Transaksi) menunjukkan 90 hari terakhir: berapa kali, berapa total, rata-rata, dan kira-kira tiap berapa hari.
- **Garansi:** isi **Garansi sampai** di Pengaturan → Aset; diingatkan 30, 7 dan 1 hari sebelum habis (bel, notifikasi, email mingguan, kalender).
- **Rekap tahun:** Ringkasan → Laporan → Tahunan: pemasukan, pengeluaran, berapa persen disisihkan, bulan paling hemat dan paling boros, kategori terbesar, tempat paling sering. Ketuk **Salin** untuk membagikannya. Mulai 15 Desember ada tombol di Ringkasan.
- **Biaya bersama** (berdua): tulis **#bersama** di catatan sebuah pembayaran, atau ketuk tombol **Biaya bersama** di transaksinya. Ringkasan menunjukkan siapa yang menalangi berapa dan siapa berutang ke siapa; ketuk **Tandai lunas** setelah membayar (bisa sebagian; **Batalkan** kalau salah). Pembagian (bawaan 50/50) diatur di Pengaturan → Pasangan.
- **Telegram** (Pengaturan → Telegram): buat bot sendiri lewat @BotFather (/newbot), tempel tokennya, ketuk **Hubungkan Telegram-ku**, lalu tekan Start di Telegram. Sejak itu kirim "kopi 28rb gopay" (satu baris satu transaksi) dan bot membalas apa yang dicatat; yang belum lengkap menunggu di Cek. Tiap orang menghubungkan chat-nya sendiri. Token disimpan di Apps Script, bukan di spreadsheet.
- **Tahun baru:** pada 1 Januari spreadsheet otomatis pindah ke tahun baru dan saldo berlanjut. Tahun yang selesai disimpan sebagai salinan "(arsip)", linknya ada di **Pengaturan → Lainnya**.

> **Log by email:** send yourself "catat coffee 28k gopay" (one line per transaction). **The usual** chips on Add fill the form in one tap. The bell lists **bills due in 7 days** (optional reminder email the day before). **Trips & events** give a #tag a budget across months. **Today** in Review takes cash spending and **Close the day** builds a streak (optional 21:00 reminder, off by default). New asset kinds include funds, bonds, deposits, pension, goods, money lent and paylater (a debt).

> **Shared costs:** tag a payment #bersama (or use its "Shared cost" button); the Summary shows who paid what and who owes whom, and **Mark as settled** records a settle-up (split 50/50 unless changed in Settings → Partner). **Telegram:** make your own bot with @BotFather, paste its token in Settings → Telegram, connect your chat, then message it "coffee 28k gopay".

> **Backup:** the monthly email attaches a CSV of every transaction. **Search** understands `>20k`, `<=50k`, `30k-100k`. **Insurance claims:** mark a payment "To claim" (deadline = payment date + claim window in Preferences) and get reminded. A subscription paid from another account says so. Summary shows days under the budget's daily share and no-spend days; a category shows its last-90-days habit. **Warranty** dates on assets give reminders. **Year in review** is in Reports → Yearly (Copy to share).

> **Payday** moves to the working day before a weekend or national holiday. **Subscriptions** show price rises, new ones and ones that stopped; **Find yearly plans** reads Gmail a year back. **Credit cards & paylater** (Settings) get their bill and due date. **Money health check** and an **interest calculator** (deposit vs SBN) are on the Summary; the **SPT asset list** is in Reports → Yearly. **First time** marks the first payment to a place. Yesterday can be closed until 12:00.

> **Salary:** banks send no email for money coming in, so on payday **Review** shows a salary card: enter the amount → **Save salary** (or **No salary**). **Summary from payday to payday** is a setting (Settings → Preferences). **Not a subscription** under a name on the subscriptions card hides it. **Fill from earlier spending** in Settings → Monthly budgets fills the empty budgets.

> **Savings goals** (Settings → Savings goals): account, name, target and an optional date; the Summary and the monthly report show how much is saved and what to put aside each month.

> Shop receipts name the APPLE.COM/BILL, Tokopedia, Shopee, Xendit and foreign shop charges with the shop and items. **Split** a payment into parts with their own category (Transactions → tap the row → Split this transaction). **Subscriptions & regular bills** in Summary. Pick a category in Transactions to see its 6-month trend. Edit **automatic rules** in Settings with a live preview. A **weekly summary** email arrives every Monday at 07:00 (Settings → Weekly summary).

## Akhir bulan / Month end (±5 menit)

0. Di tanggal gajian: catat dulu **gaji** di **Cek**, baru cek saldo (kalau tidak, gajinya tercatat sebagai Penyesuaian).
1. **Pengaturan → Cek saldo akhir bulan**: semua rekening ada di satu layar, dengan saldo di app dan kapan terakhir dicek. Isi saldo asli rekening yang ingin dicek (yang kosong dilewati), lalu **Cek saldo**. Selisihnya tampil langsung; catat sebagai *Penyesuaian*, atau pilih kategori kalau tahu asalnya (mis. uang masuk ke BCA yang tidak ada emailnya → *Pemasukan Lainnya*). Pada cek pertama sebuah rekening, centang **Jadikan saldo awal** (sudah tercentang kalau saldo awalnya masih 0): selisihnya masuk ke saldo awal, bukan sebagai pengeluaran/pemasukan.
2. Ringkasan GoPay bulanan masuk ke **Cek** sebagai "Pengeluaran GoPay (ringkasan bulanan)": pilih kategorinya.
3. Laporan lengkap (Growth, Quarter, Budget, Final Statement) ada di spreadsheet: **Pengaturan → Buka spreadsheet**.

> At month end: Settings → Month-end balance check, enter each account's real balance (the difference becomes a *Penyesuaian* row; on an account's first check, "Use as opening balance" puts it into the opening balance instead). The GoPay monthly summary arrives in Review: pick its category. Full reports are in the spreadsheet.

## Pertama kali / First time

- **Pengaturan → Rekening & saldo awal**: isi saldo tiap rekening per **31 Agustus 2026** (malam), lalu **Simpan rekening**. Tanpa ini saldo per rekening dimulai dari 0.
- **Pengaturan → Budget bulanan** (opsional): isi budget per kategori. Ringkasan lalu menunjukkan sisa atau kelebihan budget.

> First time: Settings → Accounts & opening balances: enter each balance as of the end of 31 Aug 2026. Optional: monthly budgets (the Summary then shows what's left or over).

## Berdua dengan pasangan / With your partner

Kalian berdua setara di aplikasi ini: hak yang sama, dan masing-masing punya pengaturan sendiri.

- **Pengaturan → Pasangan** (siapa saja): nama, email Google (boleh lebih dari satu, pisahkan koma) dan nama seperti di rekening bank, untuk **keduanya**. Spreadsheet dibagikan otomatis ke semua email yang tertulis. Mengganti nama membawa transaksi dan rekeningnya. Email milikmu sendiri tidak bisa dihapus (supaya tidak terkunci).
- **Yang baru bergabung:** buka spreadsheet Cashflow dengan akun Google-nya → menu **Cashflow Tracker → Hubungkan Gmail** → izinkan. Sejak itu **karjimut.vercel.app** terbuka untuknya, dan **Pengaturan → Pasangan** menunjukkan Gmail mana yang terhubung. Tambahkan rekeningnya di **Rekening** dengan **Pemilik** = namanya (nama rekening dibedakan, mis. "BCA" dan "BCA <nama>").
- **Punya masing-masing:** tanggal gajian dan kartu gaji, "Tutup hari" beserta runtutannya, email otomatis, notifikasi dan perangkatnya, kalender, pencarian langganan tahunan. Kosongkan tanggal gajian kalau belum tahu: kartu gaji baru muncul setelah diisi.
- **Kita / Aku / Dia** di Ringkasan dan Transaksi: uang berdua, punyamu saja, atau punya pasangan saja. Sebuah transaksi milik pemilik rekeningnya.
- Email kalian tidak saling terbaca: tiap Gmail hanya dibaca oleh sinkronnya sendiri; yang dibagi hanya transaksinya. Transfer di antara kalian berdua dicatat sebagai transfer, bukan pengeluaran. Tagihan, klaim dan garansi dinotifikasi sekali sehari ke kalian berdua.

> The two of you are equal in the app: the same rights, and each with your own settings. **Settings → Partner** (either of you) holds both people's names, Google accounts (several allowed) and bank names; the spreadsheet is shared with every account listed. A newcomer opens the spreadsheet with their Google account → **Cashflow Tracker → Connect Gmail** → Allow. Each of you has your own payday and salary card, "Close the day" streak, emails, notifications and devices, calendar and yearly-plan scan. **Us / Me / Them** switches the view; a transaction belongs to the owner of its account. Neither of you can read the other's email; money between you is a transfer.

## Kalau ada masalah / If something looks wrong

- **Pengaturan → Sinkron Gmail** menunjukkan kapan terakhir sinkron dan apakah berjalan normal.
- Email bank yang tidak bisa dibaca muncul di **Cek → Email yang belum terbaca** dengan link ke Gmail.
- Kalau penyimpanan gagal, transaksinya kembali ke layar dengan alasannya. Kalau sinkron sedang berjalan, app menunggu dan mencoba lagi sendiri.
- Di spreadsheet, menu **Cashflow Tracker → Sinkron sekarang** menjalankan sinkron langsung.

> Settings → Gmail sync shows the last sync and whether it works normally. Emails that couldn't be read appear in Review with a Gmail link. If a save fails, the transaction comes back on screen with the reason; while a sync is running the app waits and retries by itself. In the spreadsheet, Cashflow Tracker → Sync now runs a sync immediately.
