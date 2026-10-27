import { PUBLISHED, answer, cta, faq, table, type StaticPost } from "./shared";

export const POSTS_B: StaticPost[] = [
  {
    slug: "client-document-collection-reminder-templates-ca-firms",
    title: "How CA firms can collect client documents without chasing: reminder templates",
    excerpt:
      "Why client documents arrive late, a three-step reminder schedule that works, and copy-and-paste WhatsApp and email templates for bank statements, invoices and registers.",
    seo_title: "Client Document Reminder Templates for CA Firms",
    seo_description:
      "Reminder message templates for CA firms to collect bank statements and invoices from clients on WhatsApp and email, with a simple day 0, 3 and 7 schedule.",
    category: "CA resources",
    tags: ["client document reminder", "CA firm WhatsApp message", "collect documents from clients", "month-end close"],
    reading_time_minutes: 6,
    published_at: PUBLISHED,
    content: [
      answer(
        "Clients send documents late because asking is easy to ignore and sending is a chore. Make asking specific, repeatable and easy to answer: name the exact document and month, give one way to send it, and follow up on a fixed schedule, for example day 0, day 3 and day 7. Templates for each step are below."
      ),
      `<p>Every month-end starts the same way: someone on your team is waiting for a bank statement. The close cannot start, the junior waits, and the partner hears "client has not sent it yet". Chasing by hand takes hours across 30 clients, and it is the part of the job nobody enjoys.</p>`,
      `<h2>Why documents arrive late</h2>
<ul>
<li><strong>The request is vague.</strong> "Send the documents" leaves the client guessing which ones, for which month.</li>
<li><strong>Sending is awkward.</strong> Logging in to a portal, finding the file and emailing it takes longer than replying "will do".</li>
<li><strong>There is no consequence or rhythm.</strong> One request, then silence, then a panic call on the 28th.</li>
</ul>`,
      `<h2>A three-step schedule</h2>`,
      table(
        ["When", "Tone", "Goal"],
        [
          ["Day 0", "Friendly and specific", "Ask for the exact document and month, and say what it is for."],
          ["Day 3", "Gentle reminder", "Remind once, make replying easy, offer help."],
          ["Day 7", "Clear and firm", "Say what is blocked without it, and that the close will wait."],
        ]
      ),
      `<p>After day 7, hand over to a person to call. Automated follow-ups should stop the moment the document arrives.</p>`,
      `<h2>WhatsApp templates (copy and adapt)</h2>
<p><strong>Day 0</strong></p>
<blockquote>Hello Ramesh ji, this is Rao &amp; Co. For Sharma Traders we are still waiting for the August bank statement. Please reply here with the file attached. Thank you.</blockquote>
<p><strong>Day 3</strong></p>
<blockquote>Hello Ramesh ji, a gentle reminder from Rao &amp; Co. We are still waiting for the August bank statement for Sharma Traders. A photo or PDF reply here is fine. Thank you.</blockquote>
<p><strong>Day 7</strong></p>
<blockquote>Hello Ramesh ji, this is a final reminder from Rao &amp; Co. Without the August bank statement we cannot complete Sharma Traders' month-end. Please send it today, or tell us when we can expect it.</blockquote>`,
      `<h2>Email template</h2>
<blockquote><strong>Subject:</strong> August bank statement for Sharma Traders<br /><br />Hello Ramesh ji,<br /><br />To close the books for August we need the bank statement for Sharma Traders (all accounts, 1 to 31 August). PDF, Excel or a clear photo is fine; just reply to this email with it attached.<br /><br />Thank you,<br />Rao &amp; Co</blockquote>`,
      `<h2>What makes these work</h2>
<ol>
<li><strong>One document, one month, one action.</strong> No ambiguity.</li>
<li><strong>Reply-to-send.</strong> The easiest path is to answer the message itself.</li>
<li><strong>Same wording every time.</strong> Clients learn what a request from you looks like.</li>
<li><strong>A clear next step.</strong> What is blocked, and by when.</li>
<li><strong>Respect for opt-outs.</strong> If a client asks you to stop messaging on WhatsApp, stop, and use email or a call.</li>
</ol>`,
      `<h2>Automating the follow-ups</h2>
<p>The schedule above is easy to write and hard to keep up with across dozens of clients. FynHelp's <a href="/agents/chaser">Chaser agent</a> sends the same three steps by email and WhatsApp, stops when the document arrives, and hands the client to you if the follow-ups go unanswered. See also <a href="/blog/month-end-close-checklist-ca-firms">the month-end close checklist</a>.</p>`,
      faq([
        ["What is the best way to ask clients for documents?", "Name the exact document and month, give one easy way to send it (reply to the message), and follow up on a fixed schedule."],
        ["Is it fine to use WhatsApp for client reminders?", "It works well because clients answer it quickly. Use clear templates, send in working hours, and stop messaging anyone who asks you to."],
        ["How many reminders should I send?", "Three is a good rhythm: day 0, day 3 and day 7. After that, call."],
        ["How do I stop chasing manually?", "Use a schedule and automate it, so reminders go out on time and stop as soon as the document arrives."],
      ]),
      cta("Let the Chaser follow up on missing documents on the day 0, 3 and 7 schedule, while your team gets on with review."),
    ].join("\n"),
  },
  {
    slug: "tally-vs-zoho-books-for-ca-firms",
    title: "Tally vs Zoho Books for CA firms: how to choose, and how to work with both",
    excerpt:
      "A practical comparison of TallyPrime and Zoho Books for a CA practice, where each fits, and why many firms end up supporting both.",
    seo_title: "Tally vs Zoho Books for CA Firms: How to Choose",
    seo_description:
      "Tally vs Zoho Books for CA firms: how they differ on deployment, bank feeds, GST and collaboration, who each suits, and how to support clients on both.",
    category: "Comparisons",
    tags: ["Tally vs Zoho Books", "accounting software for CA firms", "TallyPrime", "Zoho Books"],
    reading_time_minutes: 6,
    published_at: PUBLISHED,
    content: [
      answer(
        "Tally suits businesses and accountants who want a fast, familiar desktop tool that runs on their own PC or a hosted server. Zoho Books suits businesses that want cloud access, bank feeds and online collaboration. For a CA firm the real answer is usually both, because clients choose their own software."
      ),
      `<p>A CA firm rarely chooses a client's accounting software; the client already has one. The useful question is which to recommend to new clients, and how to work efficiently with whichever they use.</p>`,
      `<h2>How they differ</h2>`,
      table(
        ["", "TallyPrime", "Zoho Books"],
        [
          ["Where it runs", "Desktop on a PC or server, or hosted (Tally on Cloud).", "In the browser, with mobile apps."],
          ["Familiarity", "Very widely used by Indian accountants and businesses.", "Newer to many accounting teams, familiar to cloud-first businesses."],
          ["Bank data", "Statements are typically exported and reconciled, with import options in newer releases.", "Bank feeds and statement import inside the product."],
          ["Collaboration", "Share data files or use remote access and connectors.", "Invite the accountant to the same online organisation."],
          ["GST workflows", "Mature GST features, widely understood.", "GST features built in, with connected filing options."],
          ["Working with a CA firm", "Send an export (XML or Excel) each month.", "Give access, or export reports."],
        ]
      ),
      `<p>Features and plans change often; check each vendor's current documentation before deciding.</p>`,
      `<h2>When each tends to fit</h2>
<ul>
<li><strong>Tally fits</strong> traders and manufacturers with an in-house accountant used to Tally, high transaction volumes, and no strong need for remote access.</li>
<li><strong>Zoho Books fits</strong> service businesses and startups that want to see their numbers from anywhere and have the accountant work in the same system.</li>
</ul>
<p>Neither is "better" in general. The better software is the one the client will keep current.</p>`,
      `<h2>Working with both without doubling the work</h2>
<ol>
<li><strong>Standardise what you ask for.</strong> Every client sends the same pack each month: bank statements, the ledger export, and registers.</li>
<li><strong>Normalise on your side.</strong> Convert Tally XML, Excel and Zoho exports into one structure, so your team reviews the same way for every client.</li>
<li><strong>Reconcile the same way.</strong> Match bank to books by the same passes whichever system holds the books.</li>
<li><strong>Review exceptions only,</strong> with the same reason codes for every client.</li>
</ol>
<p>FynHelp is built for this: it reads Tally exports (see <a href="/blog/tally-export-to-fynhelp">how to export from Tally</a> and <a href="/blog/tally-on-cloud-to-fynhelp">Tally on Cloud</a>) and connects to Zoho Books (<a href="/blog/connect-zoho-books-to-fynhelp">how to connect Zoho Books</a>), without replacing either.</p>`,
      faq([
        ["Should a CA firm recommend Tally or Zoho Books?", "Recommend the one the client's team will actually keep up to date. Tally suits desktop-first teams; Zoho Books suits teams that want cloud access."],
        ["Can a CA firm work with clients on both?", "Yes. Standardise the monthly pack and the review process so the software behind it matters less."],
        ["Does using FynHelp mean switching accounting software?", "No. FynHelp works on top of the books the client already keeps in Tally or Zoho."],
        ["Is Tally on Cloud the same as Zoho Books?", "No. Tally on Cloud is Tally hosted on a remote server; Zoho Books is a cloud-native product."],
      ]),
      cta("Keep clients on whichever software they use, and review them all the same way."),
    ].join("\n"),
  },
  {
    slug: "virtual-cfo-services-india-ca-firm-how-to-start",
    title: "Virtual CFO services in India: how a CA firm can start (scope, deliverables, pricing logic)",
    excerpt:
      "What virtual CFO services include, a simple starter scope built on the monthly close, how to think about pricing, and how to deliver it without adding headcount.",
    seo_title: "Virtual CFO Services in India: How a CA Firm Can Start",
    seo_description:
      "How a CA firm can start offering virtual CFO services to small businesses in India: scope, a starter deliverable built on the monthly MIS, and pricing logic.",
    category: "CA resources",
    tags: ["virtual CFO services", "CA firm advisory services", "outsourced CFO India", "monthly MIS"],
    reading_time_minutes: 8,
    published_at: PUBLISHED,
    content: [
      answer(
        "A virtual CFO service gives a small business a senior finance person's attention, without a full-time hire. The easiest way for a CA firm to start is to build it on work you already do: a reliable monthly close, a short MIS, and a monthly conversation with the owner about what the numbers mean."
      ),
      `<p>Small businesses need more than a filing at year-end. They need to know whether they are making money, whether they can afford to hire, and when cash will run short. A CA firm that already knows the books is well placed to answer. The obstacle is time: the team is busy closing books.</p>`,
      `<h2>What a starter scope looks like</h2>`,
      table(
        ["Deliverable", "What the client gets"],
        [
          ["Monthly close", "Books reconciled and up to date, with bank and GST matched."],
          ["Monthly MIS", "A short pack: profit and loss, cash, receivables and payables, and commentary. See <a href=\"/blog/what-is-mis-report-format-for-small-business\">what a good MIS contains</a>."],
          ["Monthly review call", "30 minutes with the owner: what changed, what to do."],
          ["Simple cash view", "A short look at the coming weeks of cash, based on receivables and payables."],
          ["Quarterly review", "Trends, budget against actual, and decisions for the next quarter."],
        ]
      ),
      `<h2>How to think about pricing</h2>
<ul>
<li><strong>Price on value and effort, not hours.</strong> A fixed monthly fee, tied to the client's size and the scope above.</li>
<li><strong>Tier by complexity.</strong> Transaction volume, number of bank accounts and the need for forecasting are the usual drivers.</li>
<li><strong>Know your cost to serve.</strong> If the close and MIS are mostly automated, the marginal cost of each extra client is small, which is where the margin comes from.</li>
</ul>
<p>We do not quote a market price here, because rates vary by city, client size and scope. Work out your own cost per client per month and the value you deliver, then price from there.</p>`,
      `<h2>Delivering it without adding staff</h2>
<ol>
<li><strong>Standardise intake.</strong> Same documents, same month, same schedule for every client. See <a href="/blog/client-document-collection-reminder-templates-ca-firms">reminder templates</a>.</li>
<li><strong>Automate the matching.</strong> Let software do exact and close matches; spend human time on exceptions.</li>
<li><strong>Draft the MIS from reconciled data,</strong> so it takes minutes, not days, and every number is traceable.</li>
<li><strong>Keep the partner's time for judgement:</strong> reviewing, signing off and talking to the owner.</li>
</ol>`,
      `<h2>Starting small</h2>
<p>Pick three or four clients you already know well, offer them the monthly MIS and review call as a paid pilot, and refine the format before you offer it to everyone. Many firms find that once clients see a clear monthly pack, they ask for more.</p>`,
      faq([
        ["What is a virtual CFO?", "An outsourced finance professional who provides a business with CFO-level guidance such as reporting, cash planning and decision support, on a part-time or retainer basis."],
        ["Can a CA firm offer virtual CFO services?", "Yes. A CA firm already holds the books and the client relationship, so it is well placed to add monthly reporting and advisory."],
        ["What is the first service to offer?", "A monthly MIS with a short review call. It builds on the close you already do."],
        ["How do I avoid hiring more staff?", "Standardise intake, automate matching and drafting, and use partner time only for review and conversation."],
      ]),
      cta("Close every client's month faster and draft the MIS from the reconciled books, so advisory has room to grow."),
    ].join("\n"),
  },
  {
    slug: "practice-management-software-ca-firms-india",
    title: "Software for CA firms in India: what to look for (a buyer's checklist)",
    excerpt:
      "A practical checklist for choosing software for a CA practice: what to ask about intake, reconciliation, review queues, sign-off, security and price, and the red flags.",
    seo_title: "Software for CA Firms in India: Buyer's Checklist",
    seo_description:
      "A buyer's checklist for CA firm software in India: intake, reconciliation, role-based review, sign-off, traceability, security and the pricing questions to ask.",
    category: "Comparisons",
    tags: ["software for CA firms", "practice management software India", "CA firm automation", "month-end close software"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "Choose software for a CA firm by the work that eats your team's week: collecting documents, reconciling, review and sign-off. Ask whether it works on top of the books your clients already keep, shows exceptions instead of everything, splits work by role, keeps a trail to source, and prices fairly as you add clients."
      ),
      `<p>Software demos show happy paths. Your firm's problems are the unhappy ones: the client who sends a photo of a statement, the narration that matches nothing, the figure a partner cannot defend. Use this checklist to test for those.</p>`,
      `<h2>The checklist</h2>`,
      table(
        ["Area", "Questions to ask"],
        [
          ["Works with your clients' software", "Does it read Tally exports, Zoho Books and Excel? Does it ask clients to switch?"],
          ["Document intake", "Can clients send files by email or WhatsApp? Does it read PDFs, scans and photos?"],
          ["Reconciliation", "How does it match? What happens to what does not match? Is every match traceable?"],
          ["Exceptions, not everything", "Does the team review only the exceptions, with a reason on each?"],
          ["Roles and review", "Can juniors prepare and partners review and sign off? Is sign-off restricted?"],
          ["Trail to source", "Can you click a figure and see the entries and documents behind it?"],
          ["Client follow-up", "Does it chase missing documents, and stop when they arrive?"],
          ["Security and data", "How is each firm's data kept separate? Can you export it?"],
          ["Pricing", "Per user, per client, or flat? What happens when you add 10 clients? Are users unlimited?"],
        ]
      ),
      `<h2>Red flags</h2>
<ul>
<li><strong>"It replaces your accounting software."</strong> Your clients will not switch for your convenience.</li>
<li><strong>Black-box numbers.</strong> If a figure cannot be traced to source, a partner cannot defend it.</li>
<li><strong>Per-user pricing that punishes growth.</strong> Adding a junior should not raise the bill.</li>
<li><strong>No human in the loop.</strong> Anything that signs off, or sends to clients, without review.</li>
<li><strong>No way to try it on your own files.</strong> A demo on perfect data proves little.</li>
</ul>`,
      `<h2>How to run a pilot</h2>
<ol>
<li>Pick three real clients, including a messy one.</li>
<li>Run one full month-end through the tool, start to finish.</li>
<li>Time each step against your current process.</li>
<li>Check that every number in the output can be traced.</li>
<li>Ask the partner whether they would sign it.</li>
</ol>
<p>FynHelp offers free <a href="/samples">sample files</a> and a <a href="/blog/month-end-close-walkthrough-sample-files">walkthrough</a> so you can see one close on made-up data before using your own. For comparisons, see <a href="/blog/best-bank-reconciliation-software-ca-firms-india">the best bank reconciliation software for CA firms</a> and <a href="/pricing">pricing</a>.</p>`,
      faq([
        ["What software do CA firms use in India?", "Most use Tally or Zoho Books for books, Excel for working papers, and a mix of tools for practice management and reconciliation."],
        ["Do I need to move my clients to new accounting software?", "Not with tools that work on top of Tally or Zoho. Beware of anything that requires migration."],
        ["How should I price-check software?", "Calculate the monthly cost at your current client count and at double, and check that users are not charged separately."],
        ["How long should a trial be?", "Long enough to run one full month-end on real client data."],
      ]),
      cta("Run one real client's month-end through FynHelp and judge it on your own files."),
    ].join("\n"),
  },
  {
    slug: "how-ca-firms-grow-without-hiring",
    title: "How CA firms can take on more clients without hiring: where the hours really go",
    excerpt:
      "Where a CA firm's month-end hours go, which steps can be automated safely, and how to grow the client list without growing the team at the same pace.",
    seo_title: "How CA Firms Can Grow Without Hiring More Staff",
    seo_description:
      "Where a CA firm's month-end hours go and which steps to automate: collection, matching, drafting and follow-up, so you can take more clients with the same team.",
    category: "Month-end close",
    tags: ["CA firm productivity", "grow CA practice", "month-end close", "automation for CA firms"],
    reading_time_minutes: 7,
    published_at: PUBLISHED,
    content: [
      answer(
        "A CA firm's month-end hours go mostly to collecting documents, matching bank to books, and re-checking work, not to judgement. Automate the collecting, the matching and the first draft, keep humans on exceptions and sign-off, and the same team can carry more clients without longer days."
      ),
      `<p>Every new client adds hours at month-end. If each client needs the same manual steps, growth means hiring at the same rate, and margins stay flat. The way out is to find which steps are the same every month, and take the time out of those.</p>`,
      `<h2>Where the hours go</h2>`,
      table(
        ["Step", "Why it eats time", "What helps"],
        [
          ["Collecting documents", "Waiting, chasing, getting files in odd formats.", "A fixed schedule with automatic follow-up, and easy reply-to-send."],
          ["Reading documents", "Re-typing statements and registers.", "Automatic extraction into structured lines, with unsure lines flagged."],
          ["Matching bank to books", "Hundreds of lines, mostly easy.", "Exact, close and rule-based matching, with exceptions listed."],
          ["Review and rework", "Back and forth with no record of why.", "A reason code and a note on each exception, and role-based queues."],
          ["Drafting the report", "Rebuilding numbers each month.", "A draft built from matched lines, with every figure traceable."],
        ]
      ),
      `<h2>What to automate, and what not to</h2>
<ul>
<li><strong>Automate:</strong> follow-up reminders, reading documents, exact and close matching, and the first draft of the report.</li>
<li><strong>Keep with people:</strong> deciding exceptions, reviewing, signing off, and talking to the client.</li>
</ul>
<p>The aim is not to remove judgement. It is to spend all of it on the 5% of lines that need it, instead of 100% of the lines.</p>`,
      `<h2>A simple capacity check</h2>
<ol>
<li>Pick a typical client. Time each step in the table, for one month.</li>
<li>Note which steps are the same every month.</li>
<li>Estimate how much of that time automation could cover.</li>
<li>Multiply the saved time by your client count to see how many more clients the same team could carry.</li>
</ol>
<p>Use your own numbers: every firm's mix is different, and we do not quote an average that your firm may not match.</p>`,
      `<h2>Growing the fee, not just the client count</h2>
<p>Time saved at month-end can go into a paid monthly review for each client. See <a href="/blog/what-is-mis-report-format-for-small-business">what a monthly MIS includes</a> and <a href="/blog/virtual-cfo-services-india-ca-firm-how-to-start">how to start offering virtual CFO services</a>. On pricing, every FynHelp plan includes unlimited users, so growing the team does not raise the bill; see <a href="/pricing">plans</a>.</p>`,
      faq([
        ["How can a CA firm handle more clients without hiring?", "Automate the repeat work (collection, reading, matching, first drafts) and spend people's time on exceptions, review and client conversations."],
        ["Is automation safe for accounting work?", "It is safe when every automated match is traceable, uncertain items go to a person, and nothing is signed off without review."],
        ["What should be automated first?", "Document follow-up and bank reconciliation, since they are the most repetitive and take the most time."],
        ["Will automation reduce the quality of work?", "Not if exceptions and sign-off stay with people. Consistent matching and traceable figures often improve quality."],
      ]),
      cta("See how much of a client's month-end can be matched, chased and drafted for you."),
    ].join("\n"),
  },
];
