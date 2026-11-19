# FynHelp

Month-end close software for chartered accountant firms in India. FynHelp collects client documents, reads bank statements and Tally or Zoho exports, reconciles bank to books, checks GST returns, and drafts a monthly MIS in which every figure links to the bank and book lines behind it. A partner signs off; nothing is filed or posted without a person approving it.

Operated by FIVENTO AI PRIVATE LIMITED.

## What is in this repository

| Path | What it holds |
| --- | --- |
| `src/routes`, `src/pages` | The public site and the signed-in app, built with TanStack Start and React |
| `src/lib/practice` | The product's logic: extraction, reconciliation, GST checks, month-end close, billing |
| `src/lib/practice/gst`, `audited.ts`, `ageing.ts` | GST invoice rules and return checks, the audited-statement comparison, and bill ageing |
| `supabase/migrations` | The database schema, including row-level security |
| `tests` | Unit, integration and database tests, and the real-file regression gate |
| `docs` | Plans, release notes and the architecture blueprint (`architecture-blueprint.html`) |

## Working on it

```bash
npm install
npm run dev          # local site
npm test             # the full test suite
npx tsc --noEmit     # type check
```

`bun.lock` points at a private package mirror, so installs outside the team's network use `npm install`. Deployment is described in `docs/DEPLOY.md` and the Mumbai region move in `docs/MUMBAI_MIGRATION_RUNBOOK.md`.

## Ground rules

- Figures are computed by code. AI reads documents, and what it reads must tie to the totals the document itself prints.
- A check that cannot run says which file it needs. It never shows a partial answer as complete.
- Public pages claim only what the code does. `tests/unit/trust-claims.test.ts` fails if an unbacked claim returns.
- Client files used for testing stay outside the repository; tests use masked copies of the real layouts.
