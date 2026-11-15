# FynHelp: what the CA discovery answers change. Critical review and PRD

Source: Devi Prasad's answers to the CA Domain Discovery Questionnaire (practising CA, small-to-mid firm, SME bookkeeping, GST and TDS), the 13 Nov 2026 retest report, and the code and docs in this repository.
Written from four seats: product manager, engineer, user (CA firm), QA tester. Then a YC-style critique, the agentic design, a yes/no decision table, and the PRD.

**How to read the evidence labels.** *[Devi]* is something Devi said. *[Code]* is something I checked in this repository. *[Retest]* is the 13 Nov retest on the tester's real statements. *[Research]* is public material, mostly vendor-written; treat its numbers as marketing until verified. *[Assumption]* is mine and must be validated.

---

## 0. The verdict, in one page

**Is FynHelp solving the problem Devi has?** Partly. It solves the middle of her workflow well and the edges not at all.

Devi's real month-end has ten steps. FynHelp covers step 2 (bank entries, with approval), step 4 (bank reconciliation) and the bank half of step 9 (MIS). It chases documents (step 1). It does not touch GST reconciliation (5), TDS (6), journals (7), ledger scrutiny (8) or the query list (10), and her own definition of "closed" includes GST and TDS being filed and reconciled. *[Devi 1.2, 2.5] [Code docs/CLOSE_WORKFLOW.md]*

**The single most important finding.** A partner opens a pack and looks first at: every bank account reconciled to the statement closing balance, cash never negative, suspense nil or explained, GST output and ITC against GSTR-2B, debtors and creditors. *[Devi 2.1]* Four of those six need ledger-level data that FynHelp explicitly does not read today (trial balance, ledger closing balances, GSTR-2B against books). *[Code docs/CLOSE_WORKFLOW.md: "it does not prepare a trial balance"]* So the product can be accurate and still not look partner-ready. Accuracy is necessary; it is not what gets the sign-off.

**What FynHelp already does that Devi values most.** The statement balance check. She says it "caught every misread statement and held the file instead of accepting wrong figures. Keep this front and centre." *[Devi 2.4]* That is the trust engine of the product. Everything below protects it.

### The calls (details in section 5)

| # | Change | Call |
|---|---|---|
| 1 | Tie every statement to the bank's own printed summary (line count, debit and credit totals, opening and closing) | **YES, now** |
| 2 | Exception engine v2: classify into the seven real types, resolve by reference, exclude resolved items from the count | **YES, now** |
| 3 | Pair transfers between a client's own accounts automatically | **YES, now** (the fix we just shipped makes this necessary) |
| 4 | Exception owner, status (open / query sent / resolved), remark, handover | **YES, now** |
| 5 | Client query list agent: one grouped message per client, replies tracked | **YES, next** |
| 6 | Partner Pack v2: one-page summary, comparatives, tie-out, open items with owners, audit trail of auto vs manual, Excel and PDF | **YES, next** (bank-derived first, ledger-derived after the spike) |
| 7 | Partner health checks (negative cash, suspense, negative debtors and creditors) | **SPIKE first**, then yes |
| 8 | Close checklist with GST, TDS and provisions as partner-ticked steps, plus due-date view (7th, 11th, 20th) | **YES** (small, and it fixes the "closed" mismatch) |
| 9 | Auto-accept rules: round-off tolerance, recurring bank charges, standing instructions, uncleared cheques within N days | **YES, with guardrails** |
| 10 | Password handling per client and bank | **YES, as encrypted patterns, opt-in; security review first** |
| 11 | Period and year summary per bank account | **YES** (data exists; a view) |
| 12 | GSTR-2B against books with vendor follow-up | **NOT YET**: separate bet after trust metrics hold; crowded |
| 13 | Posting journals, sales and purchase vouchers to Tally | **NO** for journals; **LATER** for sales and purchase |
| 14 | Cash-flow projection, ratios, trend charts | **NO** (Devi: nice-to-have) |
| 15 | More bank layouts by hand-written parsers | **NO**: keep one position-based reader and grow a golden test set |

---

## 1. What the answers say

### 1.1 Her workflow against ours

| Devi's step *[Devi 1.2]* | Who *[Devi 1.3]* | FynHelp today *[Code]* | Gap |
|---|---|---|---|
| 1. Collect documents, check completeness (all accounts, full period, no missing pages) | Junior, Manager | Chaser, intake by upload, Gmail, WhatsApp; statement gap check by dates | Completeness is judged by quiet stretches, not by the bank's own page and line numbers |
| 2. Post bank entries in Tally | Junior | Approve-one-at-a-time posting to Tally, read-back verified | Sales, purchase and journal entries are never written |
| 3. Post sales and purchase entries | Junior | Bills and registers are read; not posted | Entire step |
| 4. Bank reconciliation | Junior first cut, Senior | Deterministic matching, exceptions queue | Noise in the exception count (31 of 32 false in one month) |
| 5. GST reconciliation (sales vs GSTR-1, ITC vs GSTR-2B) | Senior | Register checks (GSTIN, taxable value, tax columns) only | No books-against-GSTR-2B reconciliation in the app |
| 6. TDS deducted, paid, challans | Senior | TDS register checks only | No TDS tie-out |
| 7. Journals: provisions, depreciation, corrections | Senior | None, by design | Entire step |
| 8. Ledger scrutiny: debtors, creditors, cash, suspense, negatives | Senior | None | Entire step |
| 9. Draft P&L, balance sheet, MIS | Manager | MIS from matched bank data, source lines per figure | No comparatives (previous month, YTD) found in the MIS code; no ledger-based statements |
| 10. Query list to client, close queries | Manager | Notes on exceptions; Chaser for documents | No shared query list, owner or status |

### 1.2 Where the time goes and where it stalls *[Devi 1.4, 1.5, 1.6]*

Time goes to: vague bank narrations, chasing the client, GSTR-2B mismatches. It stalls on: client documents and clarifications (the biggest delay), unidentified items in suspense, password-protected or poor files, partner-to-junior back and forth. A medium client takes 2 to 4 working days of effort over 1 to 2 weeks of elapsed time.

**Implication.** Most of the elapsed time is waiting on the client, not working. A product that makes the 2 to 4 days of effort faster but not the 1 to 2 weeks of elapsed time improves cost, not speed. The speed lever is the query and document-chasing loop (section 4, Query agent).

### 1.3 Her definition of "closed" *[Devi 2.5]*

Every bank account reconciled to the closing balance, suspense nil or explained, GST and TDS filed and reconciled with the books, provisions and adjustments posted, partner reviewed and the MIS sent to the client.

FynHelp marks a month closed at partner sign-off of the MIS. *[Code]* That is a subset. **A "closed" badge that the partner does not believe is worse than no badge.** Section 5, change 8 fixes it cheaply.

---

## 2. Four lenses

### 2.1 Product manager

**Jobs to be done, in her words.**
- *When the month ends, help me be sure the bank agrees with the books, so I can sign without re-doing my junior's work.* (trust)
- *When a client is slow, make the waiting visible and the chasing automatic, so the close does not depend on my memory.* (elapsed time)
- *When I hand work from junior to senior, keep the context, so the same question is not asked twice.* (handover)

**Where the value is, ranked by her evidence.**
1. Trust in the numbers (balance check, tie-outs, drill-down). Partner trust is earned by traceability, not by accuracy claims. *[Devi 5.2]*
2. Fewer and truer exceptions. 31 of 32 false exceptions teaches a team to ignore the queue. *[Devi 2.4]*
3. A shared, owned query list. Today it is Excel and WhatsApp. *[Devi 3.5]*
4. Partner-ready pack. *[Devi 5.3]*
5. Everything GST and TDS. Big, but a different product and a crowded market.

**What to say no to.** Anything that expands the surface (journals, projections, ratios) before the trust loop is tight. Devi herself ranks ratios, trend charts and projections as nice-to-have. *[Devi 2.3]*

**A positioning risk.** "Month-end close software" promises the whole close. Today it delivers the bank and documents part. Either narrow the promise ("bank and books close, partner-ready") or widen the product. Narrowing is faster and honest.

### 2.2 Engineer

**What the real statements taught us, and what to carry forward.** *[Retest + code]*
- A position-based reader with the running balance as proof generalises across HDFC, SBI, SBI OD, Union Bank, ICICI and Indian Bank. The bugs were all in layout assumptions, not in the idea: amounts wrapped over two lines, unsigned negative balances, summary rows read as lines, columns that drift between pages, a minus sign printed on its own line.
- Direction now comes from the bank's own Withdrawal and Deposit headings; the balance proves it. That ordering matters: when the balance disagrees with the column, say so, do not silently flip. *[Code pdfTable.ts]*
- A dedupe key of date, amount, direction and reference silently deleted 50 real ICICI lines because the same IMPS reference appears on two different accounts of the same client. The rule is now account-aware. *[Retest S1]*

**Engineering consequences of the answers.**
1. The bank prints its own control totals. HDFC prints `STATEMENT SUMMARY: Opening 190,925.04, Dr count 123, Cr count 38, Debits 22,278,675.40, Credits 22,131,863.00, Closing 44,112.64`. Our reader read exactly 161 lines (123 + 38) with matching sums. Indian Bank prints `Dr Count / Cr Count` and totals per page. Union Bank prints `Total (Curr. INR)` with debit and credit totals, where the credit total includes the opening balance (2,02,03,839.00 read + 15,223.53 opening = 2,02,19,062.53 printed). ICICI numbers every line (S.no) and prints `Page n of N`. Today these rows are thrown away as noise. **They are free ground truth.** Using them turns "we think we read it right" into "we read 161 of the bank's 161 and both totals tie".
2. Own-account transfers are now kept on both statements. If the reconciliation does not pair them, they become exceptions. The fix created a requirement.
3. Exceptions need a data model: type, evidence, owner, status, remark, history. Today a note is required for audit, but there is no owner or "query sent" state. *[Code ExceptionsPage.tsx]*
4. Tolerance and materiality must be per firm and per client, versioned, and every auto-accept must record which rule fired.
5. Ledger-level health checks need closing balances per ledger from Tally or Zoho. Whether the Tally connector can deliver those cheaply is the one unknown that gates changes 6 and 7. That is a spike, not a guess.
6. Per-client secrets (passwords) need a real design: encryption at rest, access control, audit, deletion. Not a text column.

### 2.3 User (four people in one firm)

| Person | What they need from FynHelp | What would make them stop using it |
|---|---|---|
| **Junior / article** | Fast first-cut reconciliation, clear reasons for each exception, no re-keying of party names every month, unlocking files in one go | A wrong line they did not catch; an exception queue full of noise |
| **Senior** | Evidence next to each exception (full narration, reference, suggested matches with reasons, history of similar entries), a place to write the query | Having to export to Excel to track queries anyway |
| **Manager** | Client-wise status, who is on what, what is waiting on the client, follow-ups that run by themselves | Losing the thread across WhatsApp and Excel |
| **Partner** | One page: reconciled or not, open items and owners, key numbers with comparatives, drill-down to source, audit trail, Excel and PDF | A number that cannot be traced; a pack that looks like a bank-statement viewer, not an MIS |

### 2.4 QA tester

**What we know from 10 real statements and 16 earlier checks.** *[Retest]*
- Before the 14 Nov fixes the tester's retest found: ICICI x4 dropped 50 real lines as duplicates and showed overdrawn debits as money in; Indian Bank read 18 of 43 lines in the wrong period; the second Indian Bank account missed its only deposit; UPI lines typed "Other" (808 of 836 on UBI); footer text stuck to the last line; a Zoho expense deleted at source stayed after a re-pull; no warning when a client is linked to both Tally and Zoho.
- After the 14 Nov reader work, on the same 10 files: all 10 read; all four ICICI quarters pass the balance check (1,464 / 1,461 / 1,293 / 1,610 lines, opening and closing match the PDFs); Indian Bank 43 of 43 and the 5,000 deposit read; no footer or summary text in any description; HDFC, UBI, SBI CA and SBI OD unchanged line for line against the previous reader. Everything filed through the real upload code with nothing dropped across accounts. *[Code tests]* **Not yet proven on the live site.**

**Defect classes to test for, every release.**
| Class | Example | Severity |
|---|---|---|
| Silent wrong number | A line dropped, a debit read as a credit, an unsigned balance | **Blocker**: must be caught by a check, never reach the partner |
| Loud wrong state | A red banner on a statement that is right | Major |
| Noise | False exceptions; bank codes in descriptions | Major (erodes trust) |
| Misclassification | Type "Other" for UPI | Minor, but sorting and filtering depend on it |
| Stale data | A deleted source entry still counted | **Blocker** for MIS |

**Test strategy.**
1. **Golden set of statements.** Keep the tester's real files out of the repository (client data). Build an anonymised set by replacing names and numbers while preserving layout. Every parser change must keep all of them green. Today the repository has one synthetic 60-page statement and made-up layouts. *[Code tests/fixtures/pdf]*
2. **Control-total tests.** For every statement type, assert the tie-out against the bank's printed summary.
3. **Property tests.** Reordering pages must not change lines; reading twice must not change counts; splitting a statement into two uploads must equal one upload.
4. **Evals for every agent decision**, with an accuracy target and a human-audited sample (section 4.3).
5. **Untested today, by name:** The Moon Excel files and books workbook (not in the shared folder); the password-protected Excel (no password); live Tally and live Zoho posting; the full retest on production.

---

## 3. YC-style critique

### 3.1 The honest questions

**Who is the customer, and what do they pay for?** A CA firm pays to close more client-months with the same people and to give partners confidence. Our pricing is per active client (Essential ₹1,999 a month for 10 clients, extra clients ₹149). *[Code plans.ts]* Devi spends 2 to 4 working days of effort per medium client per month. *[Devi 1.6]* If FynHelp saves even 30% of that, that is roughly 0.6 to 1.2 days per client-month. At an assumed junior cost of ₹1,000 to ₹1,500 per day *[Assumption]*, that is ₹600 to ₹1,800 of value against ₹149 to ₹199 of price per extra client. The ratio is attractive **if the saving is real**. It is not real while a junior must re-check every line. Trust is the unit economics.

**What is the wedge?** Not "AI accounting". The wedge is *the bank statement a CA can trust*. Every firm has the problem, nobody enjoys it, the failure is visible (a balance that does not follow), and the fix is checkable (a printed control total). That is a sharp start. The expansion path is: statements, then reconciliation, then queries, then the partner pack, then GST. Each step is paid for by the trust earned in the previous one.

**Painkiller or vitamin?** Statement trust and reconciliation: painkiller (the work exists every month for every client). Partner pack: painkiller if it removes the Excel rebuild (Devi 7.4), vitamin if it is another dashboard. Ratios and projections: vitamin.

**What would we have to believe?**
1. A CA will upload a bank PDF as downloaded, with no conversion, and trust the result. (Today: true for the 10 tested files, unproven at scale.)
2. A partner will sign off a pack whose auto-matches are visible and auditable. (Devi says yes if every figure traces to source. *[Devi 5.2]*)
3. Juniors will keep the exception queue open if it is mostly true. (False today at 1 true in 32; fixable.)
4. Clients will answer a grouped, specific question faster than a vague reminder. (Plausible, untested.)

**What would make us wrong?** If most firms' pain is GST and TDS due dates, not bank reconciliation, then we are polishing the wrong step. Devi's own words: "the GST and TDS due dates drive the sequence more than the ideal order." *[Devi 1.2]* The fastest way to find out is to ask 10 more firms the same questions and count which step they name as the worst. One answer is not a market.

### 3.2 The market, honestly *[Research]*

- **India's CA practice base is large and fragmented.** ICAI membership was 3,27,081 with 1,26,892 in practice (1 April 2021, dated). An ICAI survey of about 1,100 members found 21% use AI tools daily and the top barrier is lack of skills. That sample is opt-in and not representative. ([Bajaj Finserv](https://www.bajajfinserv.in/insights/roadblocks-for-ca-firms-and-how-to-solve-them), [Taxscan on the ICAI survey](https://www.taxscan.in/ai-integration-in-ca-firms-icai-survey-analysis/412529))
- **Direct competitors exist and are well-marketed.** Suvit, now Vyapar TaxOne, does OCR to Tally, bank reconciliation and report creation for Indian CAs. AI Accountant, VouchrIt and Suvidha AI are positioned the same way. Their accuracy and speed claims are vendor-written and unverified. ([Suvit](https://suvit.io/post/indian-accounting-software), [AI Accountant vs Suvit](https://www.aiaccountant.com/gads/ai-accountant-vs-suvit), [Suvidha AI](https://yourstory.com/companies/suvidha-ai))
- **GSTR-2B reconciliation is the most contested area.** ClearTax and several others do it, including vendor follow-up templates; many small firms still do it in Excel. ([ICAI use case](https://ai.icai.org/usecases_details.php?id=250), [KDK on GSTR-2A/2B](https://www.kdksoftware.com/blog/posts/gstr-2a-2b-reconciliation))
- **Globally, "agentic close" is the pitch of the year.** Puzzle and Digits describe agents that do categorisation, reconciliation and drafts, with human sign-off at checkpoints; KPMG frames agentic AI plus embedded governance. Vendor figures such as "25 to 50% faster close" are unverified. The consistent pattern is bounded autonomy with human sign-off, which is what FynHelp already does. ([Puzzle](https://puzzle.io/blog/ai-agents-month-end-close-guide), [Digits Agentic Close](https://www.pulse.bot/ai/news/digits-unveils-agentic-close-for-accounting-firms-37cdaacd-c86b-4c53-95cb-bd417c0acb5c/), [KPMG](https://kpmg.com/kpmg-us/content/dam/kpmg/pdf/2026/kpmg-take-command-of-the-financial-close.pdf))

**What research could not tell us.** There is no independent benchmark of any of these tools on real Indian bank statements, no current official count of small CA firms, and no error-rate data on agent autonomy. That absence is itself an opening: **a published, reproducible accuracy benchmark on real Indian bank statements is a credibility asset nobody else has.** We have the files and the checker.

### 3.3 Moat

Not the model. Three things compound: (1) the golden set of Indian bank layouts and the checks that prove a read; (2) per-firm memory of decisions (party to ledger, accepted timing differences) that makes month 3 better than month 1; (3) the audit trail partners rely on. A competitor can copy the UI; it cannot copy a year of a firm's accepted decisions.

---

## 4. Agentic design

### 4.1 Agents, jobs, and what each is allowed to do alone

| Agent | Job | Today | Autonomy rule |
|---|---|---|---|
| **Collector** | Know what the client owes us, ask for it, stop when it arrives | Chaser, intake | Sends reminders by itself on a schedule; never changes a figure |
| **Reader** | Turn a file into lines and prove it | Extract + statement check | Files a statement only if it passes the check; otherwise holds it and says why |
| **Matcher** | Pair bank lines with book entries | Recon (deterministic, no AI) | Auto-matches only on rules with measured precision; every match records the rule |
| **Classifier** (new) | Say what an unidentified line probably is | Suggestions from past decisions | Suggest only; a person confirms; confirmed decisions become rules |
| **Query** (new) | Turn open exceptions into questions for the client, collect answers | Not built | Drafts and sends grouped questions with approval at first; sends by itself once a firm has approved the pattern |
| **Reviewer** (new) | Pre-sign-off health check: reconciled? negatives? suspense? comparatives odd? | Not built | Read-only; produces a list, never edits |
| **Narrator** | Write the MIS from matched, verified data | Narrate | Writes only on locked numbers; every figure drills to source |

### 4.2 The autonomy ladder (per rule, per firm)

0. **Suggest.** Shows a proposal with evidence; a person acts.
1. **Act with undo.** Applies, shows in the day's list, one-click undo.
2. **Act silently, audit only.** For rules with a long clean record and a low value cap.

A rule moves up only after it has run at level 0 or 1 on at least 200 decisions in that firm with at most 0.5% overridden. It moves down automatically on any override of a silent action. Value caps apply at every level (for example no silent action above ₹10,000 without a partner-set limit *[Assumption: value to be agreed with Devi]*). **Every action records who or which rule did it, which inputs it saw, and what it changed.** That is what lets a partner trust a pack. *[Devi 5.2, 5.3]*

### 4.3 Evals (what we measure about the agents, not the product)

| Agent | Eval | Target | How measured |
|---|---|---|---|
| Reader | Statements with a printed control total that tie exactly (count and both totals) | 100% of statements either tie or are held with a reason; zero silent mismatches | Automatic, every upload |
| Reader | Direction wrong on any line | 0 | Running balance + headings |
| Matcher | Auto-match precision on an audited sample | at least 99.5% | Monthly human audit of 200 auto-matches per firm |
| Matcher | Share of exceptions that are true exceptions | at least 70% (Devi's month: 1 of 32, about 3%) | Exception decisions: "genuine" vs "should have matched" |
| Classifier | Top-1 suggestion accepted | at least 60% in month 3 for repeat parties | Accept rate |
| Query | Answer within 3 working days | at least 60% | Reply timestamps |
| Narrator | Figures that drill to a source | 100% | Automatic |

### 4.4 Guardrails that are not negotiable

1. **Nothing is posted to a client's books without a person approving it.** (Already true and called out in the product.)
2. **A held file is better than a wrong file.** Never lower the bar to raise the read rate.
3. **No silent deletion.** The duplicate bug deleted 50 real lines with a green banner. Any rule that drops a line must say so in the statement's summary.
4. **Per-client data isolation and consent for messaging.** Query and Chaser messages go only to people who agreed; vendor outreach (GSTR-2B follow-up) involves third parties and needs a separate consent and compliance review. *[Assumption: confirm against the DPDP Act and WhatsApp template policy]*

---

## 5. Decision table: build, defer, or refuse

Scored on evidence from Devi, effort (S under a week, M 1 to 3 weeks, L over 3), and risk.

| # | Change | Evidence | Effort | Call | Why |
|---|---|---|---|---|---|
| 1 | **Bank control-total tie-out** (count, debit and credit totals, opening, closing, page and serial continuity) | 2.4, 4.2 | M | **YES** | Turns the product's best feature into proof. Free ground truth already on the page |
| 2 | **Lines read vs the bank's count, per statement, also on held files** | 2.4, 7.1 | S | **YES** (part of 1) | She counts by hand today |
| 3 | **Exception engine v2**: seven types, reference-resolved items excluded from the count, reason and evidence per type | 2.4, 3.1, 3.3 | M | **YES** | Noise is the fastest way to lose a junior |
| 4 | **Own-account transfer pairing** | 3.1 (7), 3.4 | S | **YES** | New lines exist because of the S1 fix |
| 5 | **Owner, status, remark, handover on exceptions** | 3.3, 3.5 | M | **YES** | Replaces the Excel query sheet |
| 6 | **Query agent** | 1.4, 1.5, 3.5, 6.3 | M | **YES, next** | Attacks the elapsed time, the real delay |
| 7 | **Auto-accept rules with guardrails** (tolerance, bank charges and interest, standing instructions, uncleared cheques within N days) | 3.4 | M | **YES** | Her own list; each with a value cap, an audit line and an undo |
| 8 | **Partner Pack v2** | 5.1 to 5.5 | L | **YES, next** | Bank-derived summary and drill-down first; ledger comparatives after the spike |
| 9 | **Ledger-balance health checks** (cash, suspense, debtors and creditors negative) | 2.1, 5.1 | spike, then M | **SPIKE** | Gated on whether Tally and Zoho give ledger closing balances cheaply |
| 10 | **Close checklist with manual GST, TDS and provisions steps; due-date view** | 1.2, 2.5, 6.3, 6.4 | S | **YES** | Makes "closed" match her definition |
| 11 | **Period and year summary per bank account** | 2.4 | S | **YES** | Data exists |
| 12 | **Password patterns per client and bank** | 4.4, 7.4 | M | **YES, after security review** | See 6.5 |
| 13 | **Multi-file unlock with one password** | 7.4 | S | **YES** | Cheap relief |
| 14 | **Party and ledger mapping memory with a visible Rules screen** | 7.4 | M | **YES** | Makes month 3 better than month 1 |
| 15 | **MIS template per client** | 7.4 | M | **YES, after 8** | Rebuilding the same format every month |
| 16 | **Checklist of expected documents per client** (each account, period, loan statement) | 4.3 | M | **YES** | Completeness is her step 1 |
| 17 | **GSTR-2B against books, vendor-wise follow-up list** | 1.4, 3.1, 7.3 | L | **NOT YET** | Crowded; different data; start only when 1 to 8 hold targets. Import 2B Excel or JSON and export a vendor list before any outreach |
| 18 | **TDS deducted vs paid tie-out** | 2.2 | M | **LATER** | After 17's data path exists |
| 19 | **Loan statements: principal vs interest split** | 4.3 | M | **LATER** | Real but narrower |
| 20 | **Sales and purchase voucher import file for Tally** | 7.1, 7.3 | L | **LATER** | Big accuracy risk; needs the reader proven first |
| 21 | **Journal, provision and depreciation posting** | 1.2 (7) | L | **NO** | Judgement calls, high risk; the product's rule is "never writes a journal" and that protects trust |
| 22 | **Cash-flow projection, ratios, trend charts** | 2.3 | M | **NO** | She calls them nice-to-have |
| 23 | **More per-bank parsers** | 4.5 | L | **NO** | Position reader + golden set is the better investment |
| 24 | **Raise the "AI reads anything" claim** | n/a | n/a | **NO** | Overclaiming is the fastest way to lose a partner; say what we read and what we do not |

**Net of the table:** build 1 to 11 and 16 in the next two months (about 12 items, mostly S and M), run spike 9 in week one, hold 17 to 20, refuse 21 to 24.

---

## 6. PRD

### 6.1 Problem

CA firms close each client's month through ten steps, spread over one to two weeks, mostly waiting on the client. A partner signs off only on work they can trace to source. Today FynHelp reads statements and reconciles them, but (a) a junior still counts lines by hand to trust the read, (b) the exception queue carries mostly false exceptions, (c) questions to the client live in Excel and WhatsApp, (d) the pack does not show what a partner looks at first, and (e) "closed" in the product does not mean what it means to a partner.

### 6.2 Goals and non-goals

**Goals (next 8 weeks).**
1. A junior no longer counts lines by hand: every statement shows "read X of the bank's Y" and its totals tie, or is held with a reason.
2. At least 70% of exceptions shown are true exceptions.
3. Every open question to a client has an owner, a status and a remark, and survives a handover.
4. A partner opens one page and sees reconciliation status, open items with owners, key numbers and a drill-down.
5. "Closed" matches the firm's definition, with manual steps for what FynHelp does not do.

**Non-goals.** Posting journals; ratios and projections; per-bank hand-written parsers; GSTR-2B reconciliation and vendor outreach; replacing Tally.

### 6.3 Personas

Junior, Senior, Manager, Partner as in 2.3. Primary for the next 8 weeks: **Junior and Partner** (trust at both ends). Secondary: Senior and Manager (handover and tracking).

### 6.4 Success metrics

| Metric | Baseline | Target (8 weeks) | Where measured |
|---|---|---|---|
| Statements that tie to the bank's own control totals, or are held with a reason | not measured | 100% | Reader, every upload |
| Silent mismatches (a statement filed whose totals disagree with the bank's) | not measured | 0 | Reader audit log |
| True exceptions as a share of exceptions shown | about 3% (1 of 32, one month) | at least 70% | Exception decisions |
| Auto-match precision | not measured | at least 99.5% | Monthly audit of 200 |
| Median elapsed days, first document to partner sign-off | about 7 to 14 *[Devi 1.6]* | 20% lower | Close timestamps |
| Sign-offs without sending back for rework | not measured | at least 85% | Sign-off history |
| Tester sentiment on the three questions "did it save time, can I trust it, would I switch" | one tester | 5 firms | Structured interview |
| Problems reported through Help that are acknowledged within 1 working day | new | 100% | Admin triage |

**North Star:** client-months closed with at most one review round. It rises only if trust, noise and handover all improve.

### 6.5 Requirements

Priorities: **P0** this release, **P1** next, **P2** later. Each has acceptance criteria a tester can run.

#### R1. Bank control-total tie-out (P0)

*What.* Read the bank's own printed summary where one exists and compare it with what was read. Show the result on the statement.
*Sources of truth by layout (from the real files).*
- HDFC: `Opening Balance, Dr Count, Cr Count, Debits, Credits, Closing Bal` in a summary row.
- Indian Bank: `Dr. Count, Cr. Count`, debit total, credit total, per page and overall.
- Union Bank: `Total (Curr. INR)` with debit total, credit total (which includes the opening balance), closing.
- ICICI: serial numbers 1..N and `Page n of N`.
- SBI: no summary found; rely on opening, closing and the running balance.
*Behaviour.* Parse the summary row instead of discarding it (`BARRIER` rows today). Compare: count in and out, sum in and out (allowing for the opening-in-credits convention), opening and closing; serial continuity and page continuity where present. Output: `Lines read 161 of 161; debits and credits tie; opening and closing tie` or the exact difference ("Bank says 25 debits; we read 23: 2 missing").
*Acceptance.* (a) On the 10 real statements the tie-out passes or names a difference; (b) a statement with one line removed shows the difference and is held; (c) a statement with no printed summary says so plainly and relies on the balance check; (d) the result shows on held files too; (e) no change to lines already filed.
*Non-obvious.* Treat the summary as evidence, never as an instruction to change lines.

#### R2. Exception engine v2 (P0)

*Seven types (from 3.1).* Unidentified receipt or payment; amount difference (TDS deducted, bank charge netted, part payment, one payment for several invoices); timing; duplicate; GSTR-2B mismatch (P2); cash deposit or withdrawal needing classification; own-account or related-party transfer.
*Behaviour.* Each exception has a type, a reason, and evidence: full narration, date, amount, reference, up to three suggested matches with the reason for each, how a similar entry was treated before, linked invoice details when known. Items resolved by a unique reference on both sides are not exceptions and do not count. The count shown is "needs a person".
*Amount difference hints.* If the difference is within a small tolerance of a standard TDS rate on the invoice (1%, 2%, 10%) suggest "TDS deducted"; if it equals a known bank charge, suggest that.
*Acceptance.* (a) The September UPI case (31 same-day same-amount receipts with unique references) produces 0 false duplicates; (b) each exception shows type, reason and evidence; (c) the count excludes reference-resolved items; (d) every suggestion shows why.

#### R3. Own-account transfer pairing (P0)

*Behaviour.* Pair an outgoing line on one of the client's accounts with an incoming line on another when amount is equal, directions are opposite, dates are within two days, and the reference or UTR is equal or the narration names the other account. Mark both lines "transfer between own accounts" and settle them together. Unpaired transfers become an exception of the type "transfer, one side missing".
*Acceptance.* The HDFC 2932 and ICICI 1053 transfers of 2 Apr and 4 Apr 2025 (₹1,90,000 and ₹4,18,840) pair and do not appear as exceptions. A one-sided transfer appears as one exception naming the account to look at.

#### R4. Exception ownership, status and handover (P0)

*Fields.* Owner (a person), status (open, query sent, answered, resolved, accepted as timing), remark, due date, history (who changed what, when).
*Behaviour.* Assign from the queue; filter by owner and status; "My exceptions" view; a junior can hand a set to a senior with the history intact. The existing required note stays.
*Acceptance.* A senior opening an exception sees what the junior tried and wrote; filtering by owner and by "query sent" works; history is append-only.

#### R5. Query agent (P1)

*Behaviour.* For each client, collect open "needs the client" exceptions, group them into one message ("5 questions about September"), each with date, amount, narration and a one-line question; send by WhatsApp or email on the client's preferred channel; capture the reply into the exception and set it to "answered". Ask for approval of the first message per client; after a firm approves the pattern three times, offer to send by itself. Reminders follow the Chaser schedule and stop when answered.
*Acceptance.* One message per client per cycle; replies attach to the right exception; nothing is sent to a client who has not agreed to messaging; the log shows each send and reply.

#### R6. Auto-accept rules with guardrails (P1)

*Rules, all per firm, editable, each with a value cap and an undo.* Round-off within a tolerance (default ₹1, partner-set); recurring bank charges, interest and GST on bank charges; known standing instructions (EMI, rent, subscriptions) once seen three times; uncleared cheques within N days (flagged "timing", not an error); transfers between own accounts once paired.
*Behaviour.* Every auto-accept records the rule, the inputs and the value, appears in a daily "done for you" list, and can be undone. A rule is suggested at level 0 first and moves up per the ladder in 4.2.
*Acceptance.* No auto-accept above its cap; an override of a silent rule moves it down; the partner pack lists every auto-accept.

#### R7. Partner Pack v2 (P1)

*Page one.* Reconciliation status per bank account (count and value of unreconciled items); open items with owner and age; key numbers with previous month and year to date; tie-out line ("matches Tally closing balance" or the difference); a sentence listing what was matched by the system and what a person decided.
*Behaviour.* Every number drills to its lines and to the source document. Export to Excel for working and PDF for the client. Bank-derived comparatives ship first and are labelled "from bank data"; ledger-based comparatives follow the R8 spike.
*Acceptance.* A partner can reach any figure's source in two clicks; the audit list matches the actions taken; Excel and PDF show the same numbers.

#### R8. Health-check spike, then checks (P1)

*Spike (1 week).* Can the Tally connector and Zoho deliver ledger closing balances for cash, suspense, sundry, debtors and creditors? Output: yes or no per source, data shape, cost.
*If yes.* Show on the pack: cash negative, suspense non-zero, negative debtors and creditors, with the ledger and amount. Read-only.

#### R9. Close checklist and due-date view (P0, small)

*Behaviour.* Add partner-ticked steps "GST filed and reconciled", "TDS paid and reconciled", "Provisions and adjustments posted" beside the automatic steps; the month shows "Closed" only when all are done, and "Bank and books closed" when only the automatic steps are. A Portfolio view for the 7th, 11th and 20th lists clients with steps still open.
*Acceptance.* The wording matches Devi's definition; the Portfolio filter lists the right clients.

#### R10. Passwords per client and bank (P1, security review first)

*Approach.* Store a pattern, not a bare password: for example "customer ID" or "date of birth as ddmm" resolved from the client's own stored fields, or an encrypted password per client and bank account visible only to partners. Encrypt at rest, audit every use, allow deletion, make it opt-in per client, and keep today's rule that a password typed once is not kept unless the firm turns this on.
*Acceptance.* A multi-file upload opens every file whose pattern is known; passwords never appear in logs, emails or the Help reports; a partner can delete them.

#### R11. Other P1 items

Period and year summary per bank account; multi-file unlock; party and ledger mapping memory with a Rules screen; expected-document checklist per client; MIS template per client.

### 6.6 Data model additions

`ca_exceptions` gains `type`, `owner_id`, `status`, `due_on`, `remark`; a new `ca_exception_events` (append-only history); `ca_queries` (client, exception ids, channel, sent_at, replied_at, text); `ca_rules` (firm, kind, parameters, cap, level, stats); `ca_close_steps` for manual steps; statement `bank_summary` (jsonb) on the document; `ca_client_secrets` (encrypted, if R10 proceeds). Migrations are additive and apply by the existing manual process; code must degrade when a table is missing, as the new problem-report table already does.

### 6.7 Rollout

| When | What | Gate to the next step |
|---|---|---|
| **This week** | Ship what exists: statement reader fixes, own-account fix, type fixes, Help and Report. Retest on production with the same 10 files. | Devi re-runs the 10 statements and reports in the agreed format |
| **Weeks 1 to 3** | R1, R2, R3, R4, R9 (and the R8 spike) | True-exception share at least 70% on two firms' months; zero silent mismatches |
| **Weeks 4 to 8** | R5, R6, R7, R11 items | Rework rate on sign-offs measured on 5 firms |
| **Quarter** | Decide on GSTR-2B and TDS based on what 10 more firms name as the worst step | Evidence, not intuition |

### 6.8 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| One tester's workflow is not the market | High | High | Same questionnaire to 10 more firms before the quarter's bet |
| A parser change breaks a layout that worked | Medium | High | Golden set of anonymised statements; line-by-line comparison against the previous reader on every change (done for the 14 Nov change) |
| Auto-accept hides a real error | Medium | High | Value caps, undo, daily list, ladder with automatic demotion |
| Messaging a client without consent | Low | High | Consent flag; approval on first send; template compliance review |
| Stored passwords leak | Low | Very high | Encrypt, audit, opt-in, security review before building |
| Competitors' marketing claims reset expectations | High | Medium | Publish our own reproducible benchmark |
| Scope creep into GST | High | High | The refusal list in section 5 |

### 6.9 Open questions for Devi (answer in the agreed format)

1. What is the largest value you would let the system accept without you? Per rule.
2. For a TDS difference, which rates do your clients actually see?
3. How many days until an uncleared cheque becomes a problem?
4. Which three ledgers must never be negative, and which two should always be nil?
5. Which comparatives does your partner actually use: previous month, same month last year, year to date?
6. Would you rather the system store a password pattern or the password itself?
7. Which single step costs you the most hours: GST reconciliation, bank reconciliation or chasing? (Ask ten other firms the same.)

---

## 7. Traceability: her answers to our requirements

| Devi | Requirement |
|---|---|
| 1.2 step 1, 4.3 (missing pages, accounts) | R1 page and serial continuity; R11 expected-document checklist |
| 1.4, 1.5, 3.5, 6.3 (chasing, waiting, handover) | R4, R5 |
| 2.1, 5.1 (partner looks first) | R7, R8 |
| 2.4 (exception count misleading) | R2 |
| 2.4 (lines read vs statement count; held files show 0) | R1 |
| 2.4 (full-period view) | R11 period and year summary |
| 2.5 (closed) | R9 |
| 3.1 to 3.4 (exception types, evidence, auto-accept) | R2, R3, R6 |
| 4.4 (passwords) | R10, R11 multi-file unlock |
| 4.5 (SBI, HDFC, Union, Indian, ICICI) | Done 14 Nov; golden set; R1 |
| 5.2 to 5.5 (partner trust, format, rework) | R7, audit trail, 4.2 |
| 6.4 (client status tracker) | Portfolio today; R9 due-date view |
| 7.1 to 7.4 (workarounds) | R5, R7, R10, R11 mapping memory and MIS template; posting stays approval-based |
| 8 (feedback format) | Built: Settings, Help, Report a problem uses the same five fields |

---

## 8. What was verified, and what was not

**Verified by running code on the tester's real files (14 to 15 Nov).** The ten statements read; ICICI quarters pass the balance check; Indian Bank 43 of 43 lines; descriptions clean; no change to HDFC, UBI, SBI CA and SBI OD against the previous reader; HDFC plus four ICICI quarters filed under one client with nothing dropped across accounts; type column examples. Automated tests pass; the only failures in the full suite are two snapshot tests that already failed before this work.

**Not verified.** The live site (nothing in this report has been run there); The Moon Excel files; the password-protected Excel; live Tally and Zoho posting; the Zoho deleted-expense fix and the "linked to both Tally and Zoho" warning (code present from 13 Nov, not retested); every figure in section 3.2 beyond what the cited pages say; the value assumptions in section 3.1.

---

## Sources

- [Bajaj Finserv, roadblocks for CA firms (membership figures, dated 2021)](https://www.bajajfinserv.in/insights/roadblocks-for-ca-firms-and-how-to-solve-them)
- [Taxscan, ICAI survey on AI in CA firms](https://www.taxscan.in/ai-integration-in-ca-firms-icai-survey-analysis/412529)
- [Suvit (Vyapar TaxOne), Indian accounting software](https://suvit.io/post/indian-accounting-software)
- [AI Accountant vs Suvit (vendor comparison, unverified claims)](https://www.aiaccountant.com/gads/ai-accountant-vs-suvit)
- [Suvidha AI profile](https://yourstory.com/companies/suvidha-ai)
- [ICAI AI use case: GST invoice processing and reconciliation](https://ai.icai.org/usecases_details.php?id=250)
- [KDK Software, GSTR-2A and 2B reconciliation for CA firms](https://www.kdksoftware.com/blog/posts/gstr-2a-2b-reconciliation)
- [Puzzle, AI agents and the month-end close](https://puzzle.io/blog/ai-agents-month-end-close-guide)
- [Digits, Agentic Close for accounting firms](https://www.pulse.bot/ai/news/digits-unveils-agentic-close-for-accounting-firms-37cdaacd-c86b-4c53-95cb-bd417c0acb5c/)
- [KPMG, take command of the financial close (2026)](https://kpmg.com/kpmg-us/content/dam/kpmg/pdf/2026/kpmg-take-command-of-the-financial-close.pdf)
