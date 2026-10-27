import { PUBLISHED, answer, cta, faq, table, type StaticPost } from "./shared";

export const POSTS_A: StaticPost[] = [
  {
    slug: "bank-reconciliation-in-tally-prime",
    title: "Bank reconciliation in TallyPrime: step by step, and where it breaks",
    excerpt:
      "How to reconcile a bank ledger in TallyPrime, what the reconciliation screen shows, why it slows down at scale, and a faster routine for CA firms handling many clients.",
    seo_title: "Bank Reconciliation in TallyPrime: Step-by-Step Guide",
    seo_description:
      "How to do bank reconciliation in TallyPrime step by step, what the Balance as per Company Books screen means, and how CA firms speed it up across many clients.",
    category: "Reconciliation",
    tags: ["bank reconciliation in tally", "tallyprime", "bank reconciliation statement", "CA firms"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "In TallyPrime you reconcile a bank ledger from Banking, then Bank Reconciliation: pick the bank ledger, set the period, and enter the bank date against every entry that has cleared. What is left unmarked is what the bank has not yet shown. It works for one account. It slows down when a firm does it for dozens of clients every month."
      ),
      `<p>Bank reconciliation is the check that the bank balance in your books matches the bank's own statement. For a CA firm it is also the first thing that goes wrong at month-end: statements arrive late, narrations do not match, and a junior ticks entries one by one. This guide walks through the TallyPrime way, then shows where the time goes.</p>`,
      `<h2>The steps in TallyPrime</h2>
<ol>
<li><strong>Open the reconciliation screen.</strong> From the Gateway of Tally go to Banking, then Bank Reconciliation, and choose the bank ledger you want to reconcile.</li>
<li><strong>Set the period.</strong> Choose the month (or the dates) you are reconciling. Transactions in the period are listed with their voucher dates and amounts.</li>
<li><strong>Compare with the bank statement.</strong> Keep the bank statement beside you. For every line that appears on the statement, find the matching entry in Tally.</li>
<li><strong>Enter the bank date.</strong> Against each matched entry, enter the date the bank cleared it. Cleared entries move out of the unreconciled list.</li>
<li><strong>Read the summary.</strong> The screen shows the balance as per company books, the amounts not reflected in the bank, and the balance as per bank. When the last figure equals your bank statement's closing balance, the account is reconciled.</li>
<li><strong>Chase what is left.</strong> Entries still unmarked are cheques issued but not presented, deposits not yet credited, or entries that are wrong. Each needs an explanation, not just a tick.</li>
</ol>
<p>Newer TallyPrime releases also offer options to import a bank statement and auto-match, so check what your release supports. Whatever the route, a person still has to explain the exceptions.</p>`,
      `<h2>What the three figures mean</h2>`,
      table(
        ["Figure on the screen", "What it tells you"],
        [
          ["Balance as per company books", "What your Tally bank ledger says at the period end."],
          ["Amounts not reflected in the bank", "Entries you have made that the bank has not cleared yet, such as cheques issued but not presented."],
          ["Balance as per bank", "The company-books balance adjusted for those pending entries. It should equal the statement's closing balance."],
        ]
      ),
      `<h2>Where it breaks for a CA firm</h2>
<ul>
<li><strong>Volume.</strong> A busy client has hundreds of bank lines a month. Matching them by eye, across 30 clients, is the junior's whole week.</li>
<li><strong>Narrations do not match.</strong> The bank writes "NEFT-HDFC-RAMESH TRADERS-0912", the ledger says "Ramesh Traders". Exact search finds nothing.</li>
<li><strong>One payment, many entries.</strong> A single bank credit can settle three invoices, or three small payments can be one entry. Tick-by-tick matching cannot handle it cleanly.</li>
<li><strong>Entries that were never made.</strong> Bank charges, interest and direct debits appear on the statement but not in the books. They have to be created before the account can tie.</li>
<li><strong>Statements arrive late and in odd formats.</strong> PDF, Excel, sometimes a phone photo. Getting them in is its own task. See <a href="/blog/client-document-collection-reminder-templates-ca-firms">how to ask clients for documents without chasing</a>.</li>
</ul>`,
      `<h2>A faster routine</h2>
<ol>
<li>Collect all bank statements for the month first, so nobody reconciles from half a picture.</li>
<li>Match the easy lines automatically: exact amount and date, then same-day, then close narrations.</li>
<li>Apply your firm's repeat rules, for example "monthly rent always goes to this ledger".</li>
<li>Handle split payments as a group, not line by line.</li>
<li>Give every leftover line a reason: no matching entry, amount differs, duplicate, or timing.</li>
<li>Have a second person review only the exceptions, with a note on each.</li>
</ol>
<p>This is the order FynHelp's <a href="/agents/recon">Recon agent</a> follows: exact, same-day, close match, your firm's rules, then split payments. What does not match stays visible with a reason code, and a person decides.</p>`,
      `<h2>Related reading</h2><p>Need the statement format itself? See <a href="/blog/bank-reconciliation-statement-format-example">bank reconciliation statement: format and example</a>. Doing GST as well? <a href="/blog/gstr-2b-reconciliation-with-books">GSTR-2B reconciliation with your books</a> uses the same habits.</p>`,
      faq([
        ["Where is bank reconciliation in TallyPrime?", "Under Banking, then Bank Reconciliation. Choose the bank ledger and the period, then enter the bank date against each cleared entry."],
        ["Why do my balances not match after reconciling?", "The usual causes are entries missing from the books (bank charges, interest), a wrong amount or date on an entry, a duplicate, or a cheque that has not cleared. Work through the unreconciled list and give each item a reason."],
        ["Can bank reconciliation be automated?", "Matching can be automated for exact and close matches and for repeat rules. Exceptions still need a person to decide, which is the part worth spending time on."],
        ["How often should a CA firm reconcile client bank accounts?", "Monthly is the norm, done soon after the statement arrives, so differences are fixed while the details are fresh."],
      ]),
      cta("Bring in a bank statement and a Tally export and see the matched and unmatched lines in minutes."),
    ].join("\n"),
  },
  {
    slug: "bank-reconciliation-statement-format-example",
    title: "Bank reconciliation statement: format, example and common mismatches",
    excerpt:
      "What a bank reconciliation statement is, the standard format, a worked example with the usual timing differences, and the reasons the two balances differ.",
    seo_title: "Bank Reconciliation Statement: Format & Example",
    seo_description:
      "Bank reconciliation statement (BRS) format with a worked example, the standard reasons the cash book and passbook differ, and how to fix each one.",
    category: "Reconciliation",
    tags: ["bank reconciliation statement", "BRS format", "cash book vs passbook", "reconciliation example"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "A bank reconciliation statement (BRS) explains the difference between the balance in your cash book and the balance in the bank's passbook or statement. It lists each reason for the gap, such as cheques issued but not yet presented or deposits not yet credited, and ends with both balances agreeing."
      ),
      `<p>Two records of the same bank account will rarely agree on any given day. The business records a cheque when it writes it; the bank records it when it is cashed. A BRS is the page that explains the gap, so that nothing is hiding in it.</p>`,
      `<h2>The standard format</h2>`,
      table(
        ["Item", "Amount (₹)"],
        [
          ["Balance as per cash book (bank ledger)", "A"],
          ["Add: cheques issued but not yet presented", "+"],
          ["Add: interest or amounts credited by the bank, not yet in the books", "+"],
          ["Less: cheques deposited but not yet credited by the bank", "−"],
          ["Less: bank charges and direct debits not yet in the books", "−"],
          ["Balance as per bank statement", "B (should equal the statement)"],
        ]
      ),
      `<p>Whether an item is added or subtracted depends on the starting point. The rule that never changes: after you adjust for every difference, the two balances must agree.</p>`,
      `<h2>A worked example</h2>
<p>On 31 August the cash book shows ₹1,50,000. The bank statement shows ₹1,66,500. You find four differences:</p>`,
      table(
        ["Difference", "What it does to the two balances"],
        [
          ["Cheque of ₹20,000 issued on 29 August, not yet presented", "The bank still shows the money, so the bank balance is higher by ₹20,000"],
          ["Cheque of ₹8,000 deposited on 30 August, not yet credited", "The books show the money, the bank does not yet, so the bank balance is lower by ₹8,000"],
          ["Bank charges of ₹500 debited, not yet in the books", "The books are higher by ₹500"],
          ["Interest of ₹5,000 credited by the bank, not yet in the books", "The books are lower by ₹5,000"],
        ]
      ),
      `<p>Start from the cash book: ₹1,50,000. Add the interest not yet booked (₹5,000) and subtract the bank charges not yet booked (₹500): the corrected cash-book balance is ₹1,54,500. To compare with the bank, add the cheque issued but not presented (₹20,000) and subtract the deposit not yet credited (₹8,000): ₹1,54,500 + ₹20,000 − ₹8,000 = ₹1,66,500. That equals the bank statement, so the account is reconciled. The two items that belong in the books (interest and charges) must then be entered as vouchers.</p>`,
      `<h2>Why the two balances differ</h2>
<ul>
<li><strong>Timing differences.</strong> Cheques issued but not presented; cheques or cash deposited but not yet credited. These fix themselves when the bank catches up.</li>
<li><strong>Items only the bank knows.</strong> Charges, interest, direct debits, standing instructions, direct credits from customers. These need a voucher in the books.</li>
<li><strong>Errors.</strong> A wrong amount, a transposed figure, a duplicate or a missed entry, in the books or occasionally at the bank.</li>
<li><strong>Dishonoured cheques.</strong> A received cheque that bounced: the books still show the receipt.</li>
</ul>`,
      `<h2>Good habits</h2>
<ol>
<li>Reconcile every month, soon after the statement arrives.</li>
<li>Carry forward the pending items and clear them next month.</li>
<li>Investigate any pending cheque that is more than a few months old.</li>
<li>Keep a short note against every exception, so a reviewer does not have to ask.</li>
</ol>
<p>Doing this for many clients is the heavy part. See <a href="/blog/bank-reconciliation-in-tally-prime">how to reconcile in TallyPrime</a>, and <a href="/blog/bank-reconciliation-automation-ca-firms-india">how CA firms automate it</a>.</p>`,
      faq([
        ["What is the purpose of a bank reconciliation statement?", "To explain the difference between the bank balance in your books and on the bank's statement, so every difference is accounted for and errors are found."],
        ["Is a bank reconciliation statement part of the books of account?", "It is a working statement prepared from the books and the bank statement. It supports the balance shown in the books; it is not a ledger."],
        ["How do you correct a bank charge found during reconciliation?", "Pass a voucher for the charge in the bank ledger. It then stops being a reconciling item."],
        ["How often should a BRS be prepared?", "Monthly at minimum. Businesses with many transactions often do it weekly."],
      ]),
      cta("Upload a bank statement and your books, and get the matched lines and the exception list ready for review."),
    ].join("\n"),
  },
  {
    slug: "gstr-2a-vs-gstr-2b-difference",
    title: "GSTR-2A vs GSTR-2B: the difference, and which one to use for ITC",
    excerpt:
      "GSTR-2A and GSTR-2B both show supplier data, but one changes and one is fixed for the month. How they differ and why 2B is the one to reconcile against.",
    seo_title: "GSTR-2A vs GSTR-2B: Difference and Which to Use",
    seo_description:
      "GSTR-2A vs GSTR-2B explained: static vs dynamic, what each contains, and why CA firms reconcile input tax credit against GSTR-2B every month.",
    category: "GST",
    tags: ["GSTR-2A vs GSTR-2B", "GSTR-2B", "input tax credit", "GST reconciliation"],
    reading_time_minutes: 6,
    published_at: PUBLISHED,
    content: [
      answer(
        "GSTR-2A is a dynamic view that keeps updating as your suppliers file, so it can change after you look at it. GSTR-2B is a static statement generated for each month, with the input tax credit available to you for that month. Reconcile your purchase register against GSTR-2B, because that is the fixed record your claim is checked against."
      ),
      `<p>Both statements are auto-drafted from what your suppliers report. The difference is timing. One is a moving target; the other is a snapshot. That single difference decides which one belongs in a monthly reconciliation.</p>`,
      `<h2>The differences at a glance</h2>`,
      table(
        ["", "GSTR-2A", "GSTR-2B"],
        [
          ["Nature", "Dynamic. Updates whenever a supplier files or amends.", "Static. Generated once for the month and does not change."],
          ["When it is ready", "Any time, and it keeps changing.", "Generated after the filing cut-off each month, around mid-month."],
          ["Includes ITC guidance", "No. It lists documents.", "Yes. It shows whether ITC is available, and flags items such as blocked credit or reversals."],
          ["Best used for", "Looking up what a supplier has filed so far.", "Claiming and reconciling ITC for the month."],
        ]
      ),
      `<p>Check the GST portal for the exact generation dates and the latest rules, since they can be revised.</p>`,
      `<h2>Why reconcile against 2B</h2>
<ul>
<li><strong>It does not move.</strong> You and your reviewer are looking at the same numbers, now and next week.</li>
<li><strong>It carries the ITC position.</strong> It shows what is available, not available and reversible, so you do not have to work that out from raw documents.</li>
<li><strong>It matches how the claim is tested.</strong> Credit that does not appear in 2B is credit you should be cautious about claiming.</li>
</ul>`,
      `<h2>A monthly routine</h2>
<ol>
<li>Download GSTR-2B for the month once it is generated.</li>
<li>Match each line to your purchase register by supplier GSTIN, invoice number and amount.</li>
<li>List what is in 2B but not in the books (missing purchase entries) and what is in the books but not in 2B (supplier has not filed, or an error).</li>
<li>Chase suppliers for the second list, with the invoice details ready.</li>
<li>Claim only what is supported, and carry the rest forward with a note.</li>
</ol>
<p>The causes of mismatches are covered in <a href="/blog/itc-mismatch-gstr-2b-books-reasons">eight reasons your books and GSTR-2B do not match</a>, and the full routine in <a href="/blog/gstr-2b-reconciliation-with-books">GSTR-2B reconciliation with your books</a>.</p>`,
      faq([
        ["Is GSTR-2A still useful?", "Yes, as a live look at what suppliers have filed so far, for example when chasing a supplier. For the monthly claim and reconciliation, use GSTR-2B."],
        ["Why does GSTR-2A change but 2B does not?", "GSTR-2A updates whenever supplier filings change. GSTR-2B is generated as a fixed statement for a given month."],
        ["Can GSTR-2B be edited?", "No. If a supplier files late, the document appears in a later month's statement."],
        ["What if a supplier's invoice is missing from 2B?", "Ask the supplier to report it, and hold the credit until it appears. Keep the invoice and the follow-up on file."],
      ]),
      cta("Match GSTR-2B to your purchase register alongside the bank reconciliation for each client."),
    ].join("\n"),
  },
  {
    slug: "itc-mismatch-gstr-2b-books-reasons",
    title: "8 reasons your books and GSTR-2B do not match (and how to fix each)",
    excerpt:
      "The most common causes of an input tax credit mismatch between your purchase register and GSTR-2B, with a practical fix for each, so reconciliation stops being detective work.",
    seo_title: "ITC Mismatch: 8 Reasons Books and GSTR-2B Differ",
    seo_description:
      "Why your purchase register and GSTR-2B do not match: late supplier filing, GSTIN or invoice-number errors, timing and more, with a fix for each cause.",
    category: "GST",
    tags: ["ITC mismatch", "GSTR-2B reconciliation", "GST mismatch", "input tax credit"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "Most mismatches between your books and GSTR-2B come from eight causes: the supplier has not filed or filed late, a wrong GSTIN, a different invoice number or date, a different amount or tax split, a missing purchase entry, a timing difference across months, credit notes and amendments, and blocked or ineligible credit. Sorting the differences by cause turns reconciliation into a short checklist."
      ),
      `<p>When the purchase register and GSTR-2B disagree, the instinct is to open both side by side and look. That works for ten invoices, not three hundred. Group the differences by cause instead; each cause has a different owner and a different fix.</p>`,
      `<h2>The eight causes</h2>`,
      table(
        ["Cause", "What you see", "Fix"],
        [
          ["1. Supplier has not filed or filed late", "Invoice in your books, not in 2B", "Chase the supplier. Hold the credit until it appears."],
          ["2. Wrong GSTIN", "Supplier shows under a different GSTIN, or not at all", "Correct the GSTIN in your books, or ask the supplier to correct their return."],
          ["3. Invoice number or date differs", "Same purchase, different number format (for example leading zeros or a prefix)", "Normalise numbers before matching; correct the books if they were typed wrongly."],
          ["4. Amount or tax split differs", "Taxable value or IGST/CGST/SGST split differs", "Check the invoice. Fix whichever side is wrong."],
          ["5. Purchase not entered", "Invoice in 2B, missing from books", "Enter the purchase if it is genuine and received."],
          ["6. Timing across months", "Invoice dated in one month, appears in another", "Match across adjacent months before calling it a mismatch."],
          ["7. Credit notes and amendments", "Differences that net off across documents", "Match credit notes to their original invoices."],
          ["8. Blocked or ineligible credit", "Present in 2B, but not claimable", "Do not claim. Record why, so the next reviewer does not reopen it."],
        ]
      ),
      `<h2>A faster way to work through it</h2>
<ol>
<li><strong>Normalise first.</strong> Clean up GSTINs and invoice numbers on both sides before matching, so formatting does not create false mismatches.</li>
<li><strong>Match exact, then close.</strong> Exact on GSTIN, invoice number and amount; then close, allowing for small differences and adjacent months.</li>
<li><strong>Bucket what is left</strong> into the eight causes above.</li>
<li><strong>Send one list per supplier</strong> rather than many one-off messages.</li>
<li><strong>Write the reason</strong> against every item you leave unclaimed.</li>
</ol>`,
      `<h2>Make it a monthly habit</h2>
<p>Do it every month, soon after GSTR-2B is generated, not at year-end. See <a href="/blog/gstr-2a-vs-gstr-2b-difference">GSTR-2A vs GSTR-2B</a> for why 2B is the one to use, and <a href="/blog/gstr-2b-reconciliation-with-books">the full reconciliation routine</a>. For the compliance calendar around it, see the <a href="/blog/compliance-calendar-fy-2026-27">FY 2026-27 compliance calendar</a>.</p>`,
      faq([
        ["What is an ITC mismatch?", "A difference between the input tax credit your books show and what GSTR-2B shows for the same period."],
        ["Should I claim credit that is not in GSTR-2B?", "Be cautious. Credit that does not appear in 2B is credit you may not be able to support. Hold it until the supplier reports it, and keep the evidence."],
        ["How do I handle a supplier who never files?", "Escalate with the invoice details, and consider whether continuing to buy from them is worth the credit risk. Record every follow-up."],
        ["How often should I reconcile GSTR-2B?", "Every month, after the statement is generated and before the return is filed."],
      ]),
      cta("Reconcile each client's books to GSTR-2B and the bank in the same month-end pass."),
    ].join("\n"),
  },
  {
    slug: "what-is-mis-report-format-for-small-business",
    title: "What is an MIS report? Format, contents and a monthly template",
    excerpt:
      "What an MIS report is, what a good monthly one contains for a small business client, and a simple template a CA firm can offer as a paid monthly service.",
    seo_title: "What Is an MIS Report? Format and Monthly Template",
    seo_description:
      "What an MIS report is, the sections a monthly MIS for a small business should have, a simple format, and how CA firms turn it into a recurring service.",
    category: "MIS",
    tags: ["MIS report", "MIS report format", "monthly MIS", "management reporting"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "An MIS (management information system) report is a monthly pack that tells the owner how the business did: profit and loss, cash, receivables and payables, and a few numbers that explain why. A good one fits on a few pages, compares with the previous month, and every figure can be traced to the entries behind it."
      ),
      `<p>Most small businesses get their numbers once a year, at filing time, long after anything can be changed. An MIS gives them the same numbers every month, while there is still time to act. For a CA firm, it is also a service clients will pay for.</p>`,
      `<h2>What a monthly MIS contains</h2>`,
      table(
        ["Section", "What it answers"],
        [
          ["Profit and loss for the month", "Did we make money? Revenue, cost of goods, expenses, and profit, against last month."],
          ["Cash and bank position", "What cash do we have, and what came in and went out?"],
          ["Receivables ageing", "Who owes us money, and how overdue is it?"],
          ["Payables ageing", "Whom do we owe, and what is due soon?"],
          ["Top movements", "Which three or four lines changed the most, and why?"],
          ["Commentary", "A short plain-language note: what happened and what to do about it."],
        ]
      ),
      `<h2>A simple format</h2>
<ol>
<li><strong>Page 1, headline.</strong> Revenue, profit, cash, and the change from last month, in four boxes.</li>
<li><strong>Page 2, profit and loss.</strong> This month, last month, and the difference.</li>
<li><strong>Page 3, cash, receivables and payables.</strong> With ageing buckets such as 0-30, 31-60 and over 60 days.</li>
<li><strong>Page 4, commentary.</strong> Three to five sentences the owner will actually read.</li>
</ol>`,
      `<h2>What makes an MIS trustworthy</h2>
<ul>
<li><strong>It is built from reconciled books.</strong> If the bank has not been reconciled, the cash figure is a guess.</li>
<li><strong>Every figure can be traced.</strong> A partner signing it should be able to click a number and see the entries behind it. See <a href="/agents/narrate">how Narrate drafts an MIS</a> from matched lines only.</li>
<li><strong>It is the same format every month,</strong> so the owner learns where to look.</li>
<li><strong>A person has signed it off.</strong> Drafting can be automated; accountability cannot.</li>
</ul>`,
      `<h2>Turning it into a service</h2>
<p>For a CA firm, a monthly MIS is a natural recurring service: the books are already being closed, so the extra work is review and a short conversation. See <a href="/blog/virtual-cfo-services-india-ca-firm-how-to-start">how a CA firm can start offering virtual CFO services</a> and the <a href="/blog/month-end-close-checklist-ca-firms">month-end close checklist</a>.</p>`,
      faq([
        ["What does MIS stand for?", "Management information system. In accounting practice it usually means the monthly management report: profit and loss, cash and the key numbers behind them."],
        ["How is an MIS different from financial statements?", "Financial statements are prepared for filing and are annual. An MIS is monthly, shorter, and focused on decisions."],
        ["Who should prepare an MIS?", "The team that closes the books prepares it, and a partner or senior reviews and signs it off."],
        ["How long should a monthly MIS be?", "Three to five pages. If the owner will not read it, it is too long."],
      ]),
      cta("Close the month and draft a source-linked MIS for each client from the same reconciled books."),
    ].join("\n"),
  },
];
