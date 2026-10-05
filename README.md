# Cashflow Tracker

A personal cashflow tracker that reads bank transaction emails from Gmail (read-only) and fills a Google Sheet built on the *Template Cashflow 2025, V.1* cashflow template. A phone-friendly web app (Indonesian / English) is used to review, add and see totals.

- **Stack:** Google Sheets + Google Apps Script (sync every 10 min) + Apps Script web app. No server, no hosting cost.
- **Banks supported (planned v1):** BCA (myBCA), Livin' by Mandiri, blu by BCA Digital, Jago, Mandiri Sekuritas dividends, GoPay monthly summary.
- **Status:** design phase. Nothing is built yet. v1 connects one Gmail account. Collaboration with a partner's Gmail is a planned future phase.

| File | What |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Architecture, data model, sync pipeline, screens, security, build plan, decisions |
| [docs/TEMPLATE-ANALYSIS.md](docs/TEMPLATE-ANALYSIS.md) | How the template works, plus 10 problems found and their fixes |
| [docs/EMAIL-SOURCES.md](docs/EMAIL-SOURCES.md) | Bank emails that can be parsed and the rules for each |
| [docs/mockup.html](docs/mockup.html) | Screen mockup (open in a browser) |
| [template/](template/) | Where your own copy of the template goes (not included: it is a paid product) |

**Privacy:** this repository is public. It contains no personal or financial data. Names, accounts and transactions live only in the owner's Google Sheet. See [DESIGN.md §13](docs/DESIGN.md#13-public-repository-rules).
