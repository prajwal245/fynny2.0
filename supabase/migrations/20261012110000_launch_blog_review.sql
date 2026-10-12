-- Launch content review.
-- 1. Take down two posts that are not true of the product: a client case study
--    with figures we cannot verify, and a post promoting an "AI CFO" that is
--    not part of FynHelp. They become drafts, so an admin can still edit them.
update public.blog_posts
   set status = 'draft'
 where slug in ('how-we-cut-dso-67-to-41-days', '5-signs-you-need-ai-cfo');

-- 2. A step-by-step walkthrough of one month-end close on the public sample
--    files, with screenshots served from /guide.
insert into public.blog_posts
  (title, slug, excerpt, content, category, tags, status, published_at,
   author_name, author_role, reading_time_minutes, cover_image_url,
   seo_title, seo_description, is_featured)
values (
  'Your first month-end close in FynHelp, step by step',
  'month-end-close-walkthrough-sample-files',
  'Sign up, upload a bank statement and the Tally books, clear the exceptions and get a signed-off MIS, using free sample files. Every screenshot is the real product.',
  $walk$<p>This is a full walkthrough of one month-end close in FynHelp, start to finish, using the free sample files anyone can download. You will sign up, add a client, upload a bank statement and the Tally books, let the agents match them, decide the few lines that do not match, and finish with a monthly MIS a partner signs off. Every screenshot below was taken on those same files, so what you see is exactly what you will get.</p>

<p>It takes about fifteen minutes. You do not need any real client data.</p>

<h2>Before you start: download the sample files</h2>
<p>Open <a href="/samples">fynhelp.com/samples</a> and download the files in the <strong>July 2026 walkthrough pack</strong>. They describe one fictional company, Sample Client Pvt Ltd, for July 2026:</p>
<ul>
<li><strong>R01</strong>: HDFC bank statement, 17 lines</li>
<li><strong>R02</strong>: the Tally bank ledger for the same account (the books)</li>
<li><strong>R05</strong>: GST purchase register, with one deliberately mistyped GSTIN</li>
<li><strong>R07</strong>: TDS register under sections 194C, 194I and 194J</li>
<li><strong>R08</strong>: payroll sheet with PF and ESI</li>
<li><strong>R09</strong>: Razorpay settlement report</li>
<li><strong>R12</strong> and <strong>R13</strong>: the August statement and ledger, for step 9</li>
</ul>

<h2>Step 1. Create your account and firm</h2>
<p>Click <strong>Start free</strong> on the home page. Enter your name, work email and a password, then name your firm and city. The person who creates the firm is its owner and works as a <strong>Partner</strong>.</p>
<figure><img src="/guide/01-sign-up.jpg" alt="Sign-up form with full name, work email and password" loading="lazy" /><figcaption>Sign up with your work email.</figcaption></figure>
<figure><img src="/guide/02-firm.jpg" alt="Firm details: firm name and city" loading="lazy" /><figcaption>Name your firm. You can change it later in Settings.</figcaption></figure>

<h2>Step 2. Add your first client</h2>
<p>Add the client whose books you close. For this walkthrough use <em>Sample Client Pvt Ltd</em>. The GSTIN is optional; if you enter one, FynHelp checks its last character (the check digit), so a typo is caught before it reaches a register.</p>
<figure><img src="/guide/03-client.jpg" alt="Add client form with client name and contact email" loading="lazy" /><figcaption>The contact email is where Chaser sends document reminders.</figcaption></figure>

<h2>Step 3. Upload the bank statement</h2>
<p>Upload <strong>R01_hdfc_bank_statement_jul2026.csv</strong>. The Extract agent reads every line into a date, an amount and a counterparty. Lines it is unsure of wait in the <strong>Review Queue</strong>; here all 17 are clean.</p>
<p>If the month selected at the top of the screen is not July 2026, FynHelp tells you the file's lines belong to July and offers <strong>Open July 2026</strong>. Click it. Recon and the MIS always work on the month selected at the top.</p>
<figure><img src="/guide/04-first-statement.jpg" alt="First document uploaded: 17 transactions structured, with a notice that the lines are from July 2026" loading="lazy" /><figcaption>17 transactions read. The notice on the right points you to the month the file belongs to.</figcaption></figure>

<h2>Step 4. Add the books</h2>
<p>Open the client and the <strong>Recon</strong> tab. Recon needs both sides: the bank and the books for the same month. Click <strong>Upload books</strong> and choose <strong>R02_bank_ledger_tally_jul2026.csv</strong>. The file is named "bank ledger" on purpose: FynHelp recognises a Tally ledger by its contents, files it as the books, and reads Tally's Debit column as money in.</p>
<figure><img src="/guide/05-recon-needs-books.jpg" alt="Recon tab asking for the books for July 2026 with Upload books, Ask the client and Connect Gmail buttons" loading="lazy" /><figcaption>No books yet, so Recon tells you exactly what it needs.</figcaption></figure>
<p>No books from the client? <strong>Ask the client</strong> creates a reminder that Chaser follows up by email on day 0, 3 and 7, with a WhatsApp quick-send link, and escalates to the partner after two unanswered follow-ups.</p>

<h2>Step 5. Upload the registers and reports</h2>
<p>On the <strong>Documents</strong> tab, drop in R05, R07, R08 and R09 together. FynHelp works out what each file is. Registers and reports are kept as registers with their totals and checks; they do not add bank or book lines, so they never change the match.</p>
<figure><img src="/guide/06-documents.jpg" alt="Documents tab listing six files, all parsed" loading="lazy" /><figcaption>Six files, all read. Click any one to see what was found.</figcaption></figure>
<p>Click the TDS register. It shows TDS of ₹18,500 split by section (194I ₹8,500, 194C ₹400, 194J ₹9,600) and confirms each rate matches its section.</p>
<figure><img src="/guide/07-tds-register-checks.jpg" alt="TDS register: amount paid, TDS by section and a passed rate check" loading="lazy" /><figcaption>TDS rates checked against the section on every entry.</figcaption></figure>
<p>Now the GST purchase register. Taxable value, IGST, CGST and SGST are totalled, and one supplier's GSTIN fails the check-digit test. That is the deliberate typo in the sample file, and the kind of error that otherwise surfaces months later as an ITC mismatch.</p>
<figure><img src="/guide/08-gst-register-checks.jpg" alt="GST purchase register totals with one GSTIN flagged as failing the check-character test" loading="lazy" /><figcaption>One GSTIN flagged: OM-552 (27AABCO1234M1ZA).</figcaption></figure>
<p>The payroll sheet flags an employee whose ESI is deducted above the ₹21,000 wage limit, and the Razorpay report is read as gross ₹50,000, fees ₹1,000, GST on fees ₹180 and net ₹48,820.</p>

<h2>Step 6. Run the reconciliation</h2>
<p>Back on <strong>Recon</strong>, click <strong>Run recon for July 2026</strong>. Bank lines are matched to book lines in passes: exact amount and date first, then the same day, then close amounts and similar names, then your firm's rules, then split payments. In the sample, 13 of the 17 bank lines match. Four do not, and each becomes an exception with a reason.</p>
<figure><img src="/guide/09-recon-results.jpg" alt="Recon results: 17 bank, 13 book, 13 matched, 4 unmatched" loading="lazy" /><figcaption>13 matched automatically. 4 need a person.</figcaption></figure>

<h2>Step 7. Resolve the exceptions</h2>
<p>Open the <strong>Exception Queue</strong>. Every line has a reason code, a plain-language explanation, and the agent's best suggestion. You have three choices on each: match it, mark it reconciled elsewhere, or ignore it. Each choice needs a short note when it matters, and the note is kept on the audit trail.</p>
<p><strong>Amount mismatch.</strong> The bank paid Office Mart ₹4,750; the books say ₹4,450. Same party, same date, ₹300 apart. The agent proposes the match. Write why the amounts differ, for example "Paid ₹300 extra; credit note expected", and click <strong>Match with difference</strong>.</p>
<figure><img src="/guide/10-match-with-difference.jpg" alt="Resolve exception drawer: amount mismatch of ₹300 with a required note" loading="lazy" /><figcaption>A match with a difference always carries a note.</figcaption></figure>
<p>Three remain.</p>
<figure><img src="/guide/11-exception-queue.jpg" alt="Exception queue with three lines: bank charges, savings interest and a ₹42,000 payment" loading="lazy" /><figcaption>Bank charges, interest, and one payment with no book entry.</figcaption></figure>
<p><strong>Savings interest (₹1,245).</strong> Not booked monthly. Click <strong>Ignore</strong> with the note "Savings interest, booked at year end".</p>
<figure><img src="/guide/12-ignore-with-note.jpg" alt="Ignoring the savings interest line with a note" loading="lazy" /><figcaption>Ignored lines leave the MIS but stay on the record.</figcaption></figure>
<p><strong>Bank charges (₹590).</strong> Already booked by a journal. Click <strong>Reconciled elsewhere</strong> with the note "Booked by journal JV-14".</p>
<p><strong>Meera Textiles (₹42,000).</strong> No entry in the books at all. Leave it open; that is a question for the client, not something to guess. The MIS will leave it out and say so.</p>

<h2>Step 8. Generate the MIS and sign it off</h2>
<p>Open the <strong>MIS</strong> tab and click <strong>Generate MIS</strong>. The Narrate agent builds the report from matched lines only.</p>
<figure><img src="/guide/13-generate-mis.jpg" alt="Generate MIS dialog" loading="lazy" /><figcaption>Generate the MIS for the month selected at the top.</figcaption></figure>
<figure><img src="/guide/14-mis-report.jpg" alt="MIS report: revenue ₹4,13,000, expenses ₹4,67,480.50, net -₹54,480.50" loading="lazy" /><figcaption>The banner says one bank line is not reconciled and is left out.</figcaption></figure>
<p>Scroll down for the statutory due dates that follow from the month's payments (TDS by 7 August, PF and ESI by 15 August, GSTR-3B by 20 August), cash that moved but is not income or expense (taxes and advances), and three insights. Each insight names the transactions it is based on.</p>
<figure><img src="/guide/15-mis-report-more.jpg" alt="Statutory dates, items not counted as revenue or expenses, and three cited insights" loading="lazy" /><figcaption>Every insight has a button that opens its transactions.</figcaption></figure>
<p>Click <strong>Revenue</strong>. The drawer lists the six transactions behind ₹4,13,000, including the ₹1,180 the payment gateway kept as fees, added back from the settlement report, with a total that ties.</p>
<figure><img src="/guide/16-source-transactions.jpg" alt="Source transactions behind revenue with a total of ₹4,13,000" loading="lazy" /><figcaption>Every figure opens the lines behind it.</figcaption></figure>
<p>As the partner, click <strong>Sign off</strong>. FynHelp shows what you are accepting (one open exception, one unreconciled line left out) and asks you to confirm. Download the signed-off report as <strong>PDF</strong> or <strong>Excel</strong> to send to the client.</p>
<figure><img src="/guide/17-sign-off.jpg" alt="Sign-off confirmation listing open items" loading="lazy" /><figcaption>Sign-off states exactly what is still open.</figcaption></figure>
<figure><img src="/guide/18-signed-off.jpg" alt="Signed off by the partner, with PDF and Excel buttons" loading="lazy" /><figcaption>Signed off, with the name and date on the record. Reopen if something changes.</figcaption></figure>

<h2>Step 9. The next month remembers</h2>
<p>Switch the month at the top to <strong>August 2026</strong> and upload R12 and R13. When the same bank charge appears again, the exception carries a <strong>Learned</strong> tag: the agent shows what your team decided in July, who decided it and the note they left, and offers <strong>Use the same decision</strong>. Nothing is applied until someone confirms.</p>
<figure><img src="/guide/21-learned-decision.jpg" alt="August exception showing what the team decided in July, with a Use the same decision button" loading="lazy" /><figcaption>Decisions are remembered for this client only, and never applied silently.</figcaption></figure>

<h2>Partners and juniors</h2>
<p>The <strong>Portfolio</strong> shows every client's status for the month and what needs you. Switch <strong>Working as</strong> to <strong>Junior</strong> to see the preparer's view: documents, review, exceptions and MIS drafts. Settings, connections, what the agents remember and sign-off stay with partners, and the server enforces it.</p>
<figure><img src="/guide/19-portfolio.jpg" alt="Portfolio with client status and a Needs you list" loading="lazy" /><figcaption>The partner's portfolio.</figcaption></figure>
<figure><img src="/guide/20-junior-view.jpg" alt="Junior view of the portfolio" loading="lazy" /><figcaption>The same firm, working as a junior.</figcaption></figure>

<h2>Doing it with a real client</h2>
<ol>
<li>Export the client's bank statement as CSV or Excel from net banking (PDF works too), and the Tally day book or bank ledger for the same month.</li>
<li>Add the client, pick the month at the top, and upload both.</li>
<li>Upload the GST and TDS registers, payroll and gateway reports if you have them.</li>
<li>Run recon, clear the exception queue with notes, generate the MIS, and sign it off.</li>
</ol>
<p>Questions or a file that does not read correctly? Write to <a href="mailto:support@fynhelp.com">support@fynhelp.com</a>; a founder reads every email. Or <a href="/v2/onboarding?mode=signup">start free</a> and try the sample files now.</p>$walk$,
  'CA resources',
  array['bank reconciliation','MIS','Tally','walkthrough','GST','TDS'],
  'published',
  now(),
  'FynHelp team',
  'Product',
  9,
  '/guide/09-recon-results.jpg',
  'Month-end close walkthrough with sample files | FynHelp',
  'Step by step, with screenshots: reconcile a bank statement to Tally books, resolve exceptions and get a signed-off MIS, using free sample files.',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  category = excluded.category,
  tags = excluded.tags,
  status = excluded.status,
  author_name = excluded.author_name,
  author_role = excluded.author_role,
  reading_time_minutes = excluded.reading_time_minutes,
  cover_image_url = excluded.cover_image_url,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  is_featured = excluded.is_featured;

-- 3. The 43B(h) post described a receivables-ageing dashboard FynHelp does not
--    have. Say what the product actually does instead.
update public.blog_posts
   set content = replace(
         content,
         'The receivables aging dashboard flags every outstanding invoice by days outstanding. When an invoice crosses 30 days from a buyer who is likely a large company, FYNHelp surfaces a reminder with the Section 43B(h) context. You do not need to track this manually.',
         'FynHelp does not track MSME payment deadlines for you. What it does: every payment in the bank statement is matched to the books with its date, so when you review a client''s month you can see which supplier bills were paid and when, and check them against the 15 and 45 day limits.'
       ),
       title = replace(title, 'FYNHelp', 'FynHelp')
 where slug = 'section-43b-h-msme-payment-law';

update public.blog_posts
   set content = replace(content, 'Where FYNHelp helps', 'Where FynHelp fits')
 where slug = 'section-43b-h-msme-payment-law';
