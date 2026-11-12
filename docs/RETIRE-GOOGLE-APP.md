# Retiring the Google app for good (on or after 2026-12-11)

The Google Sheet and the Apps Script project were kept for a month after the move to Cloudflare (2026-11-12) as a last-resort copy and a way back. After 2026-12-11, if the Cloudflare app has run without trouble, remove them. This is irreversible, so do the checks first.

## 1. Check first (about 5 minutes)

1. `cd D:\Project\cashflow-worker`, then `node scripts/backup.mjs`. It must end with "matches the live data". Copy the new file `private/backup/d1-<date>.sql` to a second place (another drive or cloud storage).
2. In the app, **Pengaturan → Aplikasi → Lainnya → Unduh cadangan** and keep the CSV too.
3. Look at **Ringkasan** and **Transaksi** for the current month: do the numbers look right to both of you? Anything you still look up in the old Sheet? If yes, stop here.
4. `node scripts/live-stats.mjs` should show no errors for the last day.

## 2. Remove the Google side (you, in your Google account)

1. **Optional archive:** open the Sheet, **File → Download → Microsoft Excel (.xlsx)** and keep the file with the backups.
2. **Apps Script:** open https://script.google.com, find the Cashflow Tracker project. **Triggers** (the clock icon): delete any that remain. Then, in the projects list, `⋮ → Remove` the project.
3. **The Sheet:** in Google Drive, right-click the Cashflow spreadsheet → **Move to bin**. It stays recoverable for 30 days; empty the bin when you are sure.
4. **The old Calendar:** already deleted (2026-11-12).
5. **Account permissions:** https://myaccount.google.com/permissions → remove "Cashflow Tracker" (the Apps Script app) if it is listed.

Do NOT touch the Google Cloud project `household-mail` or its "n8n" client: the Gmail reader on Cloudflare uses them.

## 3. Afterwards

- In `D:\Project\Cashflow Tracker`, the folders `src/gas` and the Apps Script deploy scripts can stay as history, or be removed in a later cleanup; they are not used by the live app.
- Note the date in the project memory (`cloudflare-mail-worker.md`).
