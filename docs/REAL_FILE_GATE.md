# Real-file regression gate

A change must not make a real client's month worse. The gate runs the product on real files and compares counts with a recorded baseline (`tests/real-gate-expected.json`, counts only, no client data). A count that drops fails.

## Run it

```bash
REAL_STATEMENTS=/path/to/folder npm run real:gate
```

The folder holds the real files, named `Client||name.pdf` (books: `Client||BOOKS||name.xlsx`). Expected names are listed at the top of `tests/unit/practice/real-gate.test.ts`. A case whose files are missing is skipped, so a partial folder still works.

## What it checks (baseline of 18 Nov 2026)

| Case | Baseline |
|---|---|
| Satkaarika CA 7856871247 against its Day Book, full year | 43 bank lines, at least 42 matched, at most 1 open |
| Satkaarika with the CC statement, a second CA account and the loan statements | 112 lines (the cash-credit statement's 64 lines are now read), at least 106 matched, at most 4 open, none with an identical book entry |
| SSSL four banks against the Day Book, May 2025 | 882 lines, at least 799 matched, at most 11 open, at most 4 open with an identical book entry |
| Kotak 3368 | 31 lines, read, balances tie |
| Indian Bank GECL, term and vehicle loan statements | recognised as loan statements, no bank lines |
| Indian Bank CC statement | not mistaken for a loan |

## Baseline change, 22 Nov 2026

The Indian Bank cash-credit statement (every cell on its own line, dates and balances split across lines) was not read before, so the Satkaarika baseline of 48 lines left it out. A new reader reads its 64 lines, proved by the running balance to the paisa. The count rose from 48 to 112 lines, matched from 44 to 106, open from 2 to 4; none of the 4 has an identical book entry (`pairable` is 0).

## After an intended improvement

```bash
GATE_UPDATE=1 REAL_STATEMENTS=/path/to/folder npm run real:gate
```

Review the change in `tests/real-gate-expected.json` before committing it. Never lower a number to make a failure go away.

## Proof it can fail

On 18 Nov 2026 the loan rule was switched off on purpose: the gate failed four tests (three loan statements and the Satkaarika count). The rule was restored. The demo pack has its own always-on tests in `tests/unit/practice/demo-pack.test.ts`; they need no real files and run in CI.
