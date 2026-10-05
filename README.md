# Cashflow Tracker

A personal cashflow tracker that reads bank transaction emails from Gmail (read-only) and fills a Google Sheet built on the *Template Cashflow 2025, V.1* cashflow template. A phone-friendly web app (Indonesian / English) is used to review, add and see totals.

- **Stack:** Google Sheets + Google Apps Script (sync every 10 min) + Apps Script web app. No server, no hosting cost.
- **Banks supported (planned v1):** BCA (myBCA), Livin' by Mandiri, blu by BCA Digital, Jago, Mandiri Sekuritas dividends, GoPay monthly summary.
- **Status:** all v1 phases built (0 setup, 1 email parsers, 2 Gmail sync, 3–4 web app, 5 month-end). 128 automated tests, plus a self-test on the real spreadsheet. v1 connects one Gmail account; collaboration with a partner's Gmail is a planned future phase.

| File | What |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Architecture, data model, sync pipeline, screens, security, build plan, decisions |
| [docs/TEMPLATE-ANALYSIS.md](docs/TEMPLATE-ANALYSIS.md) | How the template works, plus 14 problems found and their fixes |
| [docs/EMAIL-SOURCES.md](docs/EMAIL-SOURCES.md) | Bank emails that can be parsed and the rules for each |
| [docs/mockup.html](docs/mockup.html) | Screen mockup (open in a browser) |
| [template/](template/) | Where your own copy of the template goes (not included: it is a paid product) |

## Development

```sh
npm install                     # also installs the pre-commit hook (personal-data scan + tests)
npm test                        # unit tests
npm run build                   # src/ -> dist/Code.js for Apps Script
npx clasp login                 # once
node scripts/upload-template.mjs   # once: template .xlsx -> Google Sheet + bound script
npm run push                    # build + clasp push (sheet menus, sync)
npm run deploy                  # build + push + move the web app URL to the new code
```

Then in the sheet: **Cashflow Tracker → Set up**, **Self-test**, and **Hubungkan Gmail / Connect Gmail** (one Google consent; installs the 10-minute sync). First-run data comes from `private/seed.json` (git-ignored). Without it, the build uses [config/seed.example.json](config/seed.example.json).

**Privacy:** this repository is public. It contains no personal or financial data. Names, accounts and transactions live only in the owner's Google Sheet. See [DESIGN.md §13](docs/DESIGN.md#13-public-repository-rules).
