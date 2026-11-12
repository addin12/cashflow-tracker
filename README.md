# Cashflow Tracker

A two-person household cashflow app. It reads bank transaction e-mails from Gmail (read-only), keeps the transactions, and shows them in a phone-friendly web app (Indonesian / English): review, add, search, summaries, reports, budgets, bills, savings goals and a question box ("Tanya apa saja").

**Where it runs.** On Cloudflare (free plan): a Worker with a D1 database, queues, an R2 backup bucket and Cloudflare Access sign-in, in the separate `cashflow-worker` repository. This repository holds the two parts the Worker is built from:

- `src/core/`: the shared logic (parsers for each bank's e-mails, rules, summaries, the app's API, the question engine). The Worker keeps a mirror of it in `vendor/core`.
- `src/ui/`: the screens and styles. `npm run build` here writes `dist/index.html`; the Worker builds its own copy the same way.

The Google Sheet / Apps Script version this started as was retired on 2026-11-12, and its code (`src/gas`, the Apps Script build, clasp) was removed from this repository on the same day. It stays in git history.

## Development

```sh
npm install        # also installs the pre-commit hook (personal-data scan + tests)
npm test           # unit and screen tests
npm run build      # dist/index.html, what the screenshot and browser-check scripts read
node scripts/screens.mjs --only=pc-ask,phone-ask   # screenshots of the screens (demo data); see the script for names and --dark
```

To publish a change to the live app: copy `src/core` into `cashflow-worker/vendor/core`, then `npm run deploy` in `cashflow-worker`.

## Docs

| File | What |
|---|---|
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | How to use the app (Indonesian, with English summaries) |
| [docs/UI-DIRECTION.md](docs/UI-DIRECTION.md) | The UI direction and design tokens: read it before changing the interface (a test keeps the tokens in step with the stylesheet) |
| [docs/EMAIL-SOURCES.md](docs/EMAIL-SOURCES.md) | Bank e-mails that can be parsed and the rules for each |
| [docs/DESIGN.md](docs/DESIGN.md) | Historical design record from the Apps Script era (the data model and decisions still explain the core) |
| [docs/BACKLOG.md](docs/BACKLOG.md), [docs/TEMPLATE-ANALYSIS.md](docs/TEMPLATE-ANALYSIS.md) | Historical |
| [docs/RETIRE-GOOGLE-APP.md](docs/RETIRE-GOOGLE-APP.md) | How the Google side was shut down |

**Privacy:** this repository is public. It contains no personal or financial data: names, accounts and transactions live only in the owner's Cloudflare database. A pre-commit hook scans for personal terms.
