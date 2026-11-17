# Tester feedback (Devi, 16–17 Nov): analysis and plan

Source: four rounds of notes from real client work (Satkaarika, Sri Satyanarayana Swamy Logistics "SSSL", The Moon, Tritiksha, K Lakshmi, K Srinu Ramesh). 40+ distinct points. Below: what is working, what is broken grouped by cause, the root cause found in the code, the fix, and the order to do it in.

## 1. What is working (protect with regression tests)
The Moon Apr/May/Jun reconcile fully (0 exceptions, was 96); Aug down to 1 genuine item. SBI Excel reads exactly (1,641 / 1,222 / 274) and dedupes against the CSV. May MIS ties to the books; drill-down, sign-off, correction request and PDF/Excel export work. Exception owner, remark and status changes are logged; the junior view blocks sign-off. UBI SB 1967 (4,591 rows), UBI 0394 and HDFC 6043 read exactly. Archiving clearly says nothing is deleted.
Not yet tested: senior review (needs a second partner seat).

## 2. Categories, causes and fixes

### A. Reconciliation accuracy (the trust core; biggest value)
| # | Feedback | Root cause (found in code) | Fix |
|---|---|---|---|
| A1 | Repeated amounts never match (EMIs ₹1,39,307 ×3, FDR credits ×2, ₹50,000 ×2 daily; SSSL 282 of 309 unmatched have an exact same-date same-amount entry; 83 clean one-to-one pairs missed in May) | `recon/engine.ts` stage 1b matches only when the pair is the **only** candidate both ways. Equal amounts make every candidate non-unique, so all are skipped. | **Group matching:** within one amount and date window, if bank lines and book entries are equal in number and fit one another completely, pair them in order (any pairing is identical). Where counts differ, match the largest fitting set and leave the remainder as an exception that says "2 of 3". Same method already proven on own-account transfers. |
| A2 | Day Book takes the party line, not the bank line (₹47,32,488 + ₹29.21 charges vs bank ₹47,32,517.21) | The Day Book is read one row per voucher, amount taken from the first non-bank leg. | Use the **bank ledger leg's own amount** in each voucher; keep charges as a separate leg. |
| A3 | Multi-bank Day Book loses which bank each line belongs to (SSSL: ICICI, UBI, HDFC ×2, Kotak in one file; 894 bank vs 903 book lines) | Rows carry no account. | Keep the **bank ledger name** on every book row; match a statement to its ledger by account digits or name; scope recon per account. A voucher with two bank legs becomes two lines (one per account), which is how own-account transfers across the client's accounts reconcile. |
| A4 | Transfers to the CC account unmatched when the CC statement is not read | Matching needs the other leg's statement. | A transfer whose other account has no statement still matches **against the books** (book voucher with both bank ledgers). |
| A5 | Bank-only clients stay "Waiting for books"; plan is to share raw statements only | Pipeline assumes books. | **Bank-only mode:** pair own-account transfers, then classify bank lines without books (see AI plan §3). The month can reach "Bank and Books Closed" as "Bank closed" without books. |
| A6 | One genuine difference: ₹5,572.66 on 31-03 in bank vs 02-03 in books | Beyond the 5-day window. | Suggest (never auto-match) a unique-amount, same-party pair at any distance, with the gap stated. |

### B. Document intake coverage
| # | Feedback | Cause | Fix |
|---|---|---|---|
| B1 | "No statement layout recognised": Kotak SB, Indian Bank CC, Axis CV loan SOAs, loan with nil transactions; loan statements go to Needs review | Code readers exist for ICICI, HDFC, SBI, UBI, Indian Bank CA only; the AI fallback reports "not configured". | **AI reads, code proves** (see §3): Gemini reads the layout; the result is accepted only if the running balance and printed totals tie, exactly like a code-read statement. Loan statements get their own handling (B6). |
| B2 | APGB scan rejected; PhonePe "took too long" | Scans need OCR/vision that is off; the AI call has a short time limit. | Gemini reads PDFs and photos natively; remove the short timeouts for statements; chunk long files by page range and merge; keep OCR.space as the free first try. |
| B3 | Multi-sheet books Excel read as a TDS register | One sheet is chosen by guessing. | **Sheet chooser** (the app already offers it for statements; extend to books) plus Gemini classification of each sheet. |
| B4 | CA 8088 ledger export missing from the list; "re-file as register" changes 1,641 to 377 and may still feed recon | Re-filing changes the kind but not what recon reads; no replace. | **Remove or replace a books file** with a clear action; a register never feeds recon (assert in test). |
| B5 | Duplicate uploads possible; counters stuck at 32 | Counters are not recomputed after upload; duplicate check by file hash exists but the list lags. | Derive counters from the same list; refresh on upload; show "already uploaded" at once. |
| B6 | How should loan statements be handled? | Not defined. **Product decision needed.** | Recommended: a loan statement is not bank recon. Read it as a **loan account**: EMIs split into principal and interest, outstanding balance, tie to the loan ledger, and the EMI lines on the bank statement match to it (this also fixes the repeated-EMI exceptions). |

### C. Blockers and reliability (hotfix first)
| # | Feedback | Cause | Fix |
|---|---|---|---|
| C1 | Uploads hang on "Uploading securely…" for new clients; the 5-client limit appears only later | The limit is checked when the work starts (`billing/usage.server.ts`), after the upload begins, and the error never reaches the stuck card. | Check the limit **before** the upload starts, show the message at once, and add a timeout with a clear error and Retry. |
| C2 | Exception status change takes ~5 s with no loader; the note box does not clear | The action refreshes the whole workspace before updating the screen. | Update the row at once (optimistic), show a progress state, clear the note on success, refresh in the background. |
| C3 | Archived clients still count and cannot be restored; no archived view | Active clients are counted by work done this month, including later-archived ones. | "Archived" view with **Unarchive**; say plainly how archiving affects the month's count. |

### D. Consistency and clarity
| # | Feedback | Cause | Fix |
|---|---|---|---|
| D1 | Overview says "recon not run, 5 of 9, 20%" while Month-end close says "recon done, 3 of 10". 5 of 9 shown as 20% | Two separate calculations: the old `closeStateFor` in the store (9 stages, client-side) and the new close checklist (10 steps, server). The 20% is a separate bug. | One source of truth: Overview reads the close checklist. |
| D2 | Per-account recon summary missing | Not built. | Per account: statement lines vs book lines, matched, unmatched, opening/closing tie. |
| D3 | "Match all same-date same-amount" one-click | Follows from A1. | Offer it for any group the engine could pair; show the pairs and an Undo. |
| D4 | "Mark query sent" does not chase the client | Status only; Module 6 (client queries) was not built. | Build Client Query Automation: group exceptions per client, draft one message, staff approve, send, attach the reply. |

### E. MIS correctness
| # | Feedback | Fix |
|---|---|---|
| E1 | "Expenses" ₹26.36 L include loan repayment, TDS, GST and creditor payments | Classify by ledger group: expenses only from expense heads; loan principal, taxes, and creditor payments are separate lines. |
| E2 | "TFR 66.07%" revenue insight meaningless | Revenue heads from the books (UPI, POS, sales), never a bank narration code. |
| E3 | Two different net figures (−₹3,87,261.71 and −₹1,91,711.71) | One net, defined once; the other becomes a labelled reconciliation line. |
| E4 | Largest payment shows the bank narration, not the ledger name | Prefer the books' ledger name where matched. |

### F. Admin actions for this tester (no code)
Restore Tritiksha and The Moon; raise the trial limit to 7 active clients (Admin: firm plan and usage). Both can be done in the admin panel; I cannot reach production data from here.

## 3. AI plan with the Gemini credits ("no limits, but safe")
Principle: **AI reads and proposes; code proves; people approve.** A model never decides a number on its own. Every AI-read statement is accepted only if its running balance and the bank's printed totals tie (the same proof the code readers use), so more AI means more coverage without less accuracy.

1. **Remove artificial ceilings.** Today a firm's AI is capped at 1,500 calls a day (`PRACTICE_AI_DAILY_CAP`), model calls are cut short by 9–10 s timeouts, and several reads are text-only. With credits: make the cap a soft alert (per-firm usage shown in Admin, no hard stop), raise timeouts for statements, send whole PDFs and images to Gemini (native vision), chunk by page range for long statements and merge.
2. **Provider setup (needs you).** Confirm in the production environment: `GEMINI_API_KEY` (or the Vertex AI route that the startup credits are attached to), `GEMINI_MODEL`/`GEMINI_FALLBACK_MODEL` pinned to a version, `USD_INR_RATE`. The "AI reader not configured" message means no model is reachable in production right now; that alone explains Kotak, Indian Bank CC, Axis, APGB and PhonePe. The Admin cost page already shows spend in ₹.
3. **Agents (each with a trace, a cost line and a human gate):**
   - **Intake Agent:** identifies any file (statement, loan, credit card, books, register, scan), picks the reader, asks Gemini for structured rows when no code reader fits, then proves the result.
   - **Recon Agent:** after the rules, a model adjudicates only the ambiguous leftovers (party names, narrations, near dates), proposing matches with a stated reason; never auto-posts. Bank-only mode: classifies lines into categories from narration and the client's history, in batches.
   - **Exception Triage Agent:** types, explains, proposes an owner by workload, drafts one grouped client query per client (Module 6), learns from approvals.
   - **MIS Agent:** ledger-aware classification and commentary that cites the figures it used.
   - **Evaluation loop:** the real statements and books form a golden set run on every change (the real-file test already does this); a model-assisted review flags regressions.
4. **Cost control without limits:** cache by file hash (a duplicate costs nothing), batch lines per call, prompt caching for fixed instructions, per-firm usage visible in Admin, alert (not block) at a threshold.

## 4. UX principles applied
Say what happened and what to do, in plain words, at the moment it happens (limit before upload; error with Retry). Never a silent wait: every action shows progress within 200 ms and the result in place. One number, one source. Show the proof (what tied) next to every claim. Bulk where the work is repetitive (match all, assign all), with Undo.

## 5. Sequence
**Sprint 0 (2 days, unblock testing):** C1 upload preflight and errors; C2 loaders and note clear; C3 archived view and unarchive; D1 single close source and the 20% bug; B5 counters; F admin actions; AI environment check and caps.
**Sprint 1 (recon accuracy):** A1 group matching; A2/A3 Day Book bank leg and per-account scope; A4 transfers against books; D3 one-click match; D2 per-account summary. Target: SSSL May unmatched 309 → about 30 with zero false matches; Satkaarika 17 → 1.
**Sprint 2 (coverage):** B1/B2 AI reader with proof, loans (B6 after your decision); B3 sheet chooser; B4 replace books file; A5 bank-only mode.
**Sprint 3 (MIS and queries):** E1–E4; D4 client query automation and chase.
**Sprint 4 (agents and evaluation):** Recon adjudicator, Triage agent, golden-set runner, senior-review test seat.

## 6. Decisions and inputs needed
1. Loan statements (B6): approve the "loan account" approach.
2. Production environment: Gemini key or Vertex route, confirmed model.
3. Admin: restore Tritiksha and The Moon; trial limit to 7.
4. Files: the Day Books and bank ledger exports for the tested clients are in the Drive folder; I will use them (privately, not committed) as the regression set.

## 7. Acceptance for the first release after this plan
Repeated amounts match; Day Book uses the bank leg and the right account; no upload can hang; Overview and Month-end close agree; counters are correct; archived clients can be restored; every statement type in the feedback reads and is proved or is held with a stated reason.

## 8. Progress (updated 17 Nov)
Done and verified on real files: A1 identical amounts (EMIs, FDR credits, daily receipts; parties never swapped), A2 the Day Book's bank ledger leg is the book line (charges included), A3 book entries for bank accounts with no statement wait instead of becoming exceptions, cash-only vouchers no longer reach bank reconciliation. Satkaarika, Indian Bank CA 7856871247 against the Day Book: **42 of 43 matched, 1 exception** (the genuine 5,572.66 date difference), was 16 matched / 24 exceptions. SSSL, May 2025, ICICI 1053 + HDFC 2932: **465 of 477 bank lines matched**, was 513 of 894.
Also done: C1 upload room is checked once, before the batch, with one message and a timeout; C3 archived view with **Restore for 14 days**, archived clients no longer count toward the month's active clients; C2 exception changes appear at once and the note clears; D1 Overview recon status now follows the month on screen (an earlier month's run is no longer forgotten), the percentage now equals "n of m", and Overview links to the real checklist; AI daily cap raised from 1,500 to 100,000.
Next: UPI payment and reversal pairs (SSSL's last 8), per-account passes for clients with several statements, bank-only mode, the Gemini statement reader with proof (Kotak, CC, loans, Axis, scans), sheet chooser, replace books file, MIS classification. Not reproduced from the code: the Documents counters staying at 32 (counters and list read the same data); needs a screen recording.
