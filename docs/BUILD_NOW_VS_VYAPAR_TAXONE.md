# What to build now, and what not to, against Vyapar TaxOne (formerly Suvit)

17 Nov 2026. Inputs: the competitor research report (vendor-published claims, unverified), our own strategy doc (`SUVIT_VS_FYNHELP_STRATEGY.md`), and what real firms hit this week. Rule for every item below: it must make FynHelp **faster, more accurate, or more reliable** for a CA firm, and it must be provable in a one-hour pilot.

## 0. What the report changes

- **Confirmed:** Suvit is now Vyapar TaxOne. It sells *entry automation plus GST plus document collection* at an advertised ₹10,000 a year (listed ₹20,000, 50% off, GST extra, 7-day trial, no card). That price is the ceiling every firm will compare us to.
- **Their own weak signals:** WhatsApp is "Coming Soon" on the homepage but listed as included on the pricing page. They claim "100% accuracy", "zero duplicate entries", "80% time saved", and 10,000 firms, all unverified. The list of 30+ GST validations is not disclosed.
- **A fair look at their strengths:** a very low price, three input formats (Excel, PDF, scanned PDF) plus images, a Tally connector installed like a normal program, and a single bundle (documents, entry, GST, practice).
- **Where our connector loses today:** theirs is download, install, log in, set host and port, save, verify, add the company. Ours is install Node.js 18, create a JSON file, paste a token, run a script, and set Tally's port by hand. For a non-technical CA office that is a drop-off point before any value is shown.

## 1. Build now, in this order

### A. Reliability (weeks 1 to 2). Nothing else matters if this slips.

| # | Build | Why | Done when |
|---|---|---|---|
| 1 | Deploy the pending fixes and keep a **golden-corpus gate**: every merge runs the real Satkaarika, SSSL and demo files and fails on any drop | Today's real defects were all things a corpus would have caught | CI shows the counts per file, and a regression blocks the merge |
| 2 | Verify the real Gemini reader with the key, and read the admin AI panel daily | A reader nobody has verified is a claim, not a feature | Admin "live check" is green; a held-for-AI statement is read and tied end to end |
| 3 | Finish the open real-file items: SSSL's last identical-amount lines, Indian Bank CC statement, Axis CV loan statements | Each is a real firm's month | Devi's SSSL May at 465 or more of 469; every file in her folder reads or says exactly why not |
| 4 | **Open the app fast on a large firm**: send transactions on demand for the open document, not all at once | Opening time is the first impression every day | Largest firm opens in under 5 seconds on a normal connection |
| 5 | Make every promised background action app-driven, with the scheduler only as backup (retries done; follow-ups, Gmail polling next) | A silent scheduler is why retries "failed" | No user-visible promise depends on an outside timer |

### B. Close the gaps where they win (weeks 2 to 8)

| # | Build | Why it beats them |
|---|---|---|
| 6 | **Windows installer for the Tally connector**: sign-in with a 6-digit pairing code, auto-detects Tally on port 9000, tests the connection and shows status in the web app. Target: download, install, enter code, done. No Node.js, no JSON file | Their 9 steps become 4, and the connector stops being a drop-off point. Also removes the "port" and "host" concepts for most users |
| 7 | **Exception to entry**: for every "in the bank, not in the books" line, propose a voucher from the firm's rules, approve in bulk, send to Tally (or export the import file). Always approved by a person, always undoable | They post everything and leave checking to the clerk; we propose only what the bank proves is missing, a small list that is quick to verify |
| 8 | **Narration to ledger learning**: every correction teaches a firm-specific rule ("PHONEPE/RAMESH" goes to Staff Welfare), shown and editable | Their "AI ledger mapping" is the sales story; ours improves per firm and is inspectable |
| 9 | **Sales and purchase invoice reading checked against GSTR-2B** (two-sided) | Single-sided OCR is where "100% accuracy" claims fail; the portal is an independent check |
| 10 | **WhatsApp**: document reminders already send through the official Business API (client upload link, consent, daily cap, daytime window). Add **exception questions** to the client from the queue, and supplier follow-ups from the GST page, through the same sender with a Meta-approved Utility template | They have WhatsApp on one page and "coming soon" on another; ours is live for reminders, and questions are the next edge |
| 11 | **Scanned PDF and image reading** with every result tied out the same way as text statements | Parity with their three formats, with proof they lack |

### C. Differentiate where they are silent (weeks 6 to 12)

Their 17 open questions in the report are our checklist. Where we stand:

| Question | Us today | Action |
|---|---|---|
| Client-month closing, portfolio status | Have: ten-step close, per-client state | Polish |
| Partner dashboards | Partial | Weekly "who is behind and why" view |
| Source-linked MIS | Have | Keep |
| Bank statement control-total verification | Have (a unique strength) | Make it the headline |
| Fewer false-positive exceptions | Improved this week | Publish the match rate on real files |
| Exception ownership and history | Have | Keep |
| Firm rules and memory | Partial | Item 8 above |
| Ledger health (negative cash, suspense) | Not built | Cheap from the Day Book; build |
| TDS reconciliation | Partial | Later |
| Debtor and creditor scrutiny | Not built | Later |
| Own-account transfer reconciliation | Have | Keep |
| Audit trail of automated decisions | Partial | One-click "evidence pack" per month |
| Client-wise workflow analytics | Not built | Time per client-month, first-pass match rate |
| Role approvals and sign-off | Have (senior review needs a second partner seat) | Keep |
| Human approval for automated decisions | Have | Make it a visible principle |
| Other integrations | Tally and Zoho Books | Keep |

## 2. Do not build, and why

1. **Do not build GST filing now.** It needs a GST Suvidha Provider arrangement, carries direct liability, and is where their "5X faster" claim lives. Reconcile and prepare; partner with a licensed provider later if firms insist.
2. **Do not build a general accounting package or a full practice suite** (billing, compliance calendar, payroll). It dilutes the close-with-proof story and starts a feature war on their ground.
3. **Do not post to Tally without approval.** Blind auto-posting is their risk to carry, not ours.
4. **Do not use unofficial WhatsApp tools.** One ban ends the feature and the account.
5. **Do not chase a "400 banks" number.** Publish a coverage table of banks and layouts we have verified with real files, and grow it weekly.
6. **Do not add features while a real firm's month is failing.** Reliability items in section A come first, every time.
7. **Do not match an unlimited ₹10,000 price.** It starts a race we cannot win and signals the same value.
8. **Do not copy their claims** ("100% accuracy", "zero duplicates"). We can only promise what we can show.

## 3. Positioning: do and don't

| Do say | Don't say |
|---|---|
| "Close the month with proof." | "AI data entry", "Tally automation", "cheaper than Suvit" |
| "Every statement is checked against the bank's own totals. A missing line is held and named." | "100% accurate", "no errors", "fully automated" |
| "Of 700 lines, you decide on 12." | "Unlimited everything" |
| "Works with the entry tool you already use." (check layer first, then proposes missing entries) | "Replace your Tally workflow" or "Suvit alternative" as the headline |
| "Your team, one workspace: owners, history, sign-off." | Feature lists with no proof |
| "Run one real month in an hour and compare with what your team did." | A discount as the first offer |

**Pricing stance.** Anchor on the partner's outcome (clients closed on time), not on entries. Offer one free client-month pilot. Keep price tiers by active clients so a small firm can start low without a "forever unlimited" promise.

**Proof as marketing.** Publish the demo pack (done), a results page with real anonymised counts, and the "held statement" story. Their claims are marketing; ours can be checked in an hour.

## 4. Measures that tell us we are winning

- Statements tied without AI, as a percentage (target 90% or more on the corpus).
- First-pass match rate on real months (target 95% or more of bank lines).
- Exceptions per 100 lines and minutes per client-month, from pilot firms.
- Connector setup time and drop-off (target under 5 minutes, under 10% drop-off).
- Pilot to paid conversion.

## 5. What to verify before using any of this in a sales call

Run one real month through their 7-day trial and ours, with the same files, and record: lines read against the bank's own totals, entries needing correction, time to a signed month, and how a missing line shows up. Until then, treat every competitor claim as theirs, not ours.
