# FynHelp daily build prompts

How to use: open a **new chat each day** in the FynHelp repo. Paste the **Master context** once, then **that day's prompt**, then the **Evening close** prompt. Track progress in `FynHelp_Daily_Tracker.xlsx` (sheets: Daily plan, Metrics, Pilots).

The plan follows the product spec (document collection, extraction, ledger recommendation, recon and audit, outputs that prove value, trust, experience) and is ordered by **what is missing today**, not by what sounds best. Order of days can change; the rules in the Master context cannot.

---

## Master context (paste first, every chat)

```
You are working on FynHelp, an intelligence layer on top of Tally and Zoho Books for Indian CA firms. Repo: prajwal245/fynny2.0. Develop on the branch I give you; commit and push there. Do not open a PR or merge until I say "deploy".

What the product is: AI reads, code proves, people approve. Nothing is written to Tally or Zoho without a partner or manager approving it. No invented numbers. Every figure is computed in code and drillable to source.

What is already built (do not rebuild; read the code first):
- Intake: upload, Gmail, WhatsApp intake and no-login upload links, chaser (email and WhatsApp) that stops when the file arrives.
- Extraction: bank PDFs, Excel and Tally Day Book, scans through Gemini (tie-out proven), loan statements recognised, held statements until a partner accepts with a reason.
- Recon: multi-stage matching per bank account, own-account transfers, reversals, contra legs, identical-amount groups, Start over, exception queue with owners, states, history, senior review.
- Close: ten-step month-end checklist with partner sign-off. GST: GSTR-2B against the purchase register, saved to the client.
- Tally: connector with one-time pairing code; approved entries write to Tally; ledger suggestions learn from approvals.
- Admin: System Health shows the AI reader status and failures; firms see plain messages, admins see the technical reason.

Hard rules:
1. Test before you claim. Run `npx tsc --noEmit -p .` and `npx vitest run`. Gate every commit on both passing. Never commit with a failing test.
2. Use real files when they exist (/tmp/real2 or the Drive folder). Count results before and after the change.
3. Say what you could not verify. Never say "100%" or "works" without a test or a measured number.
4. Fix classes of bug, not single cases. Add a regression test for each.
5. Firm users see plain words. Technical reasons go to admin only.
6. Keep changes small enough to review. Finish with: what changed, evidence (counts, tests), what is not done, what I must do (SQL, settings, approvals).

Read first: docs/BUILD_NOW_VS_VYAPAR_TAXONE.md, docs/SUVIT_VS_FYNHELP_STRATEGY.md, docs/DEMO_20_MIN_SCRIPT.md.
```

---

## Evening close (paste last, every chat)

```
Close the day. 1) Run tsc and the full test suite; show the counts. 2) List every file changed and why in one line each. 3) Update the tracker row for today: status, evidence (commit hash, test names), metric before and after. 4) Write a WhatsApp note for the team (5 lines, plain) and one for Devi (what to retest today). 5) Tell me the SQL or settings I must apply. 6) Say "ready to deploy" only if tests pass and nothing is half-done; otherwise say exactly what blocks it.
```

---

## Morning triage (run before the day's prompt, 10 minutes)

```
Triage first. Read Admin > System Health output I paste below (AI reader status, failures in 24 hours, WhatsApp template status, connector status). For each failure: classify (our bug, provider, customer config), say who must act, and give the smallest fix. Fix anything that is our bug and blocks a firm today before starting the day's task.
[paste System Health and any firm feedback here]
```

---

## Day 1: Reliability gate (spec 6, priority 1)

```
Goal: no regression can reach production unnoticed.
Build: a script `npm run real:gate` that runs the real-file tests (REAL_STATEMENTS=<folder>) and compares against a committed `tests/real-gate-expected.json` containing counts only (lines read, tied or not, matched, open), never data. Cover: Satkaarika CA 7856871247 (42 of 43), SSSL May (at least 799 of 810), Kotak 3368 (31 lines, tied), the four Indian Bank loan statements (loan), demo pack (26 / 3 decisions). The gate fails if any count drops. Add a short README on how Devi or I run it.
Done when: the gate passes on the current code and fails when I deliberately break one stage.
```

## Day 2: Fast open on large firms (spec 7, priority 1)

```
Goal: the app opens in under 5 seconds on the largest firm.
Context: getPracticeWorkspace loads every transaction row of up to 300 documents (2,000 each) on every boot and refresh. The store computes MIS, recon guides and reports from `doc.rows`.
Build: load document headers and counts at boot; load a document's rows only when it is opened or when a calculation for the selected period needs them (a server function by client and period). Keep all existing screens correct. Add a timing log (server and client) so we can see the gain.
Done when: measured boot time on SSSL-sized data (use the memory harness plus a synthetic 20,000-row firm) drops by at least 60%, every existing test passes, and a new test proves a period switch still shows the right figures.
```

## Day 3: Measured value (spec 5, priority 5)

```
Goal: every firm sees hours saved and percent auto-matched, every month.
Build: per client and firm-wide, for the selected month: bank lines, auto-matched, manually matched, decisions left, time from first upload to Bank and Books Closed. Show "X% matched automatically (N of M lines), Y decisions left, about Z hours saved". The hours estimate must state its assumption (seconds per line by hand, default 45, shown in the card, editable in Settings). Put the card on Portfolio and Reports. No invented numbers: if data is missing, say so.
Done when: the card matches a hand count on the demo pack (26 of 32, 3 decisions) and on a real file, with tests.
```

## Day 4: Precision audit (spec 3 and 6, "99%" must be measurable)

```
Goal: measure how many auto-matched lines are WRONG, not only how many matched.
Build: "Check a sample": pick 30 random auto-matched lines of the month (stratified by stage), show bank line and book entry side by side, partner marks right or wrong. Store results (needs a small table; write the migration and give me the SQL). Show precision per stage and overall, with the sample size. Wrong ones reopen as exceptions and teach the rules.
Done when: on the demo pack the sample shows 100% right with n=26, a deliberately wrong pair is caught, and the numbers appear in the Metrics view.
```

## Day 5: Intake quality gate (spec 1)

```
Goal: bad files are caught before processing and re-requested automatically.
Build: detect on arrival: blurry or low-resolution scans, pages missing (page count versus statement's printed total pages, date gaps), wrong period, wrong client, password protected. Show the exact reason and a one-tap "Ask client to resend" that uses the chaser with the reason in plain words.
Done when: seven test files (blurry, cut page, wrong month, wrong client, locked, empty, wrong type) each get the right message, and the chaser creates the right request.
```

## Day 6: Ledger recommendation depth (spec 3)

```
Goal: the suggestion shows its evidence and covers GST and TDS.
Build on src/lib/practice/tallyLedgerSuggest.ts and ledgerLearning.ts: top 1 to 3 suggestions with confidence and a plain reason ("12 earlier payments to this payee went to Office Expenses"); amount-range and party-history signals; GST treatment hint on charges and purchases (taxable, exempt, reverse charge) and a TDS section hint where the narration and amount indicate one. Never suggest a ledger that is not in Tally. Mark anything under the threshold as "decide".
Done when: on the real SSSL and Satkaarika Day Books, the first suggestion is right for at least 90% of lines that have an earlier similar entry, measured and reported.
```

## Day 7: Exception questions on WhatsApp (spec 1 and 4)

```
Goal: ask a client about one exception from the queue, and attach the reply.
Context: document reminders already send through whatsappSend.server.ts with consent, daily cap, window and credits. I will submit one new Utility template; env WHATSAPP_QUERY_TEMPLATE holds its name.
Build: "Ask the client" on an exception: editable message prefilled with date, amount, narration; sends through the same sender; sets the exception to Query sent with the message in its history; a client reply is attached to the exception. If the template is not set, fall back to the copy and wa.me link. Same path for GST supplier follow-ups.
Done when: tests cover consent, window, cap, missing template and reply attach, using the existing fakes.
```

## Day 8: Invoice reading against GSTR-2B (spec 2 and 3)

```
Goal: purchase invoices as PDF or photo become checked purchase lines.
Build: a reader that returns invoice number, date, supplier GSTIN, taxable value, tax split and total; verify arithmetic (taxable plus tax equals total) and the GSTIN checksum; anything that fails goes to review. Feed the result to the GST reconciliation as the books side and show matched, missing in portal, amount differences. Live-test with Gemini on three generated invoices (clean PDF, scan, photo).
Done when: the demo pack's six invoices, rendered as PDFs, reproduce the register results (4 matched, 1 difference, 1 missing).
```

## Day 9: Client-facing status (spec 5)

```
Goal: the client sees where their month stands, without a login.
Build: a read-only page behind the client's upload-link token: "Your September books are 94% reconciled. Missing: 2 purchase invoices", with an upload button. Only counts and missing items, never amounts of other clients, never internal remarks. Partner can turn it off per client.
Done when: tests prove the page shows nothing outside its client, expires with the link, and matches the Close step data.
```

## Day 10: Connector updater and installer readiness (priority 3)

```
Goal: make the Windows build trivial for whoever builds it.
Build what is possible on Linux: the check-in response carries latest_version, min_version, download_url, sha256; the connector script verifies and stages an update (tested with a fake server); tray and status panel content as a JSON status file the installer can display; the pairing flow end-to-end test. Do not claim a signed installer.
Done when: all items in docs/TALLY_CONNECTOR_INSTALLER_SPEC.md that are code are tested, and the remaining list is exactly what a Windows engineer must do.
```

## Day 11: Mobile exception review (spec 7)

```
Goal: a manager can clear exceptions on a phone.
Build: audit the exception queue, detail, approve and ask-the-client screens at 390 px width with Playwright screenshots (deviceScaleFactor 1); fix overflow, tap targets under 44 px, and horizontal scroll. Do not redesign.
Done when: screenshots before and after are in the report and no screen scrolls sideways.
```

## Day 12: Evidence pack (spec 4)

```
Goal: one click produces the audit evidence for a client-month.
Build: export (PDF and CSV): statements with tie-out results, every match with its stage and reason, set-asides, every exception with owner and history, who approved what and when, close steps and sign-off. Immutable: the export records its own hash and time.
Done when: the demo pack export contains all 32 bank lines accounted for, and totals reconcile to the bank's printed totals.
```

## Day 13: Layout memory (spec 2)

```
Goal: each new bank layout is read by rules after the AI reads it once.
Build: when the AI reads a statement and the tie-out passes, store a layout fingerprint and column map for that bank (firm-scoped, no raw data); next time use the rules path first. Show "read by rules" or "read by AI" per document.
Done when: a second statement of the same layout is read without an AI call, proven by test, and a layout that later fails the tie-out falls back to AI.
```

## Day 14: Pilot readiness and outreach (positioning)

```
Goal: five firms can try one real month.
Build: a one-page pilot guide (what to upload, what they will see, how long), a before-the-call checklist from docs/DEMO_20_MIN_SCRIPT.md, and a results sheet template to compare our month with the firm's own. Run the whole demo script against a fresh test firm in the memory harness and list every step that fails.
Done when: the list of failing steps is empty or each has an owner.
```

---

## Weekly reach prompts (not firms already testing)

```
WEEK A. Write a 5-message WhatsApp sequence for a CA I do not know, using only claims we can prove (held statements, 3 decisions out of 32 lines, tie-out). No accuracy percentages. Offer one free client-month.
WEEK B. Draft a 600-word post for CA WhatsApp groups and LinkedIn: "How a missing line in a bank statement goes unnoticed, and how to catch it in 5 minutes", with the demo pack link.
WEEK C. Draft the ICAI branch and Tally partner outreach: a 10-minute demo slot request, what we show, what we ask.
WEEK D. Review pilot results from the Pilots sheet. For each firm: what they did, time saved, what blocked them. Propose the next three fixes by impact.
```

## Claims we may and may not make

- May say: statements are checked against the bank's own totals; a missing line is held and named; you decide only the exceptions; nothing posts to Tally without approval.
- May not say: "100% accuracy", "zero errors", "fully automatic", "files GST", "under 1 second per file", "trained on Indian data".
