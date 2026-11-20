import { answer, cta, faq, figure, table, type StaticPost } from "./shared";
import { PRESS, PRESS_POST_SLUG } from "@/content/press";

/** The launch coverage, listed in one place with the outlets' own links, grouped by headline. */
const PRESS_PUBLISHED = "2026-11-02T00:00:00.000Z";
const PRESS_UPDATED = "2026-11-03T05:51:28.000Z";

const headlines = [...new Set(PRESS.map((p) => p.headline))];
const outlets = (h: string) => PRESS.filter((p) => p.headline === h);

const coverage = headlines
  .map(
    (h) =>
      `<h3>${h}</h3><ul>${outlets(h)
        .map((p) => `<li><a href="${p.url}" rel="noopener noreferrer" target="_blank">${p.outlet}</a></li>`)
        .join("")}</ul>`,
  )
  .join("");

export const POSTS_C: StaticPost[] = [
  {
    slug: PRESS_POST_SLUG,
    title: "FynHelp in the news: launch coverage for India's CA firms",
    excerpt: `FynHelp's launch has been covered by ${PRESS.length} news outlets under ${headlines.length} headlines. Read the coverage, and what FynHelp does for CA firms at month-end.`,
    seo_title: "FynHelp in the News: Launch Coverage for CA Firms",
    seo_description: `FynHelp's launch coverage from ${PRESS.length} outlets: CA firms losing a week to reconciliation, the junior accountant's changing job, and how FynHelp's four agents help.`,
    category: "News",
    tags: ["FynHelp in the news", "FynHelp launch", "CA firms reconciliation", "month-end close", "press"],
    reading_time_minutes: 3,
    published_at: PRESS_PUBLISHED,
    updated_at: PRESS_UPDATED,
    content: [
      answer(
        `FynHelp, month-end close software for chartered accountant (CA) firms in India, has been covered by ${PRESS.length} news outlets under ${headlines.length} headlines, including &ldquo;${headlines[0]}&rdquo;. FynHelp works on top of the ledger a firm already uses (Tally or Zoho Books) and handles the reconciliation work that fills the first week of every month.`
      ),
      `<h2>The coverage</h2><p>Each link opens the outlet's own article.</p>${coverage}`,
      `<h2>What FynHelp does</h2>
<p>Four agents run each client's month. <a href="/agents/extract">Extract</a> reads bank statements and Tally or Zoho exports. <a href="/agents/recon">Recon</a> matches bank to books and leaves only real exceptions for a person. <a href="/agents/narrate">Narrate</a> drafts a monthly MIS where every figure links to its source lines. <a href="/agents/chaser">Chaser</a> follows up with clients for missing documents by email and WhatsApp. Only a partner can sign off a report.</p>`,
      `<h2>Try it</h2><p>Pricing is per active client with unlimited users. See <a href="/pricing">pricing</a>, or run the whole month on free <a href="/samples">sample files</a> first.</p>`,
      faq([
        ["Where was the FynHelp launch covered?", `The launch has been covered by ${PRESS.length} outlets: ${PRESS.map((p) => p.outlet).join(", ")}. Links to each article are on this page.`],
        ["What were the coverage headlines?", `${headlines.map((h) => `&ldquo;${h}&rdquo;`).join("; ")}.`],
        ["What is FynHelp?", "FynHelp is month-end close software for CA firms in India. It collects client documents, reconciles bank statements to Tally or Zoho books and drafts a source-traceable MIS that a partner signs off."],
        ["Does FynHelp replace Tally or Zoho Books?", "No. FynHelp works on top of the ledger a firm already uses. It reads by default, and writes into Tally only entries your partner has approved, and only if writing is switched on at the connector."],
        ["How is FynHelp priced?", "Per active client, with unlimited users. Plans start at ₹1,999 a month for 10 clients, excluding GST, and there is a free trial with no card."],
      ]),
      cta("See what the coverage describes on one of your own clients."),
    ].join("\n"),
  },
  {
    slug: "chatgpt-for-accounting-vs-fynhelp-ca-firms-india",
    title: "ChatGPT for Accounting vs FynHelp: an AI assistant or a month-end close system?",
    excerpt: "A general AI assistant in your team's hands is better than a secret free tool. But a month-end close needs proof, not just answers. Where each fits in an Indian CA firm, and how to use both safely.",
    seo_title: "ChatGPT for Accounting vs FynHelp for CA Firms",
    seo_description: "An AI assistant answers questions; a month-end close system proves the books. ChatGPT for Accounting vs FynHelp for Indian CA firms, and when to use each.",
    category: "Comparisons",
    tags: ["ChatGPT for accounting", "AI for CA firms", "AI assistant vs accounting software", "month-end close", "client data security", "FynHelp vs ChatGPT"],
    reading_time_minutes: 8,
    published_at: "2026-11-20T09:00:00.000Z",
    cover_image_url: "/blog/ai-assistant-vs-close-system/cover.png",
    og_image: "/blog/ai-assistant-vs-close-system/cover.png",
    content: [
      answer(
        "A general AI assistant such as ChatGPT or Claude is a very good thinking partner: it drafts, explains and summarises files you give it. FynHelp is something else: month-end close software that reads a client&rsquo;s bank statements and Tally or Zoho exports, proves every match with code, and leaves only real exceptions for a person to approve. Most CA firms will want both, with the assistant for thinking and FynHelp for the numbers that a partner signs."
      ),
      `<h2>The story: two versions of the same Tuesday</h2>
<p><em>An illustration, not a real client.</em></p>
<h3>Version one: the quick answer</h3>
<p>It is the 9th. Meera, a junior accountant at a CA firm, has a client&rsquo;s Day Book of a few thousand vouchers, three bank statements and a GST workbook. The partner wants the close by Friday. A free AI assistant is one browser tab away, so she pastes the files in and types, &ldquo;What doesn&rsquo;t match?&rdquo;</p>
<p>The answer is fast, confident and well written. It lists a dozen differences. She sends them on.</p>
<p>On Thursday the partner asks her to run it again with one corrected statement. The list is different. Two items have vanished, three new ones have appeared, and one voucher type was never in the analysis at all. A small opening difference was rounded away. Nobody can say which figure came from which line, and nobody can say, afterwards, what the tool actually saw. The client&rsquo;s books also now sit in a personal account the firm does not control.</p>
<p>None of this is the assistant&rsquo;s fault. It was built to be a helpful conversation partner, not an accounting control.</p>
<h3>Version two: the proved close</h3>
<p>Same Tuesday, same files. This time they go into FynHelp. The AI reads the statements and exports into lines. Then code takes over: every statement&rsquo;s opening plus movement must equal its closing, every line can be used once, every match must net to zero. Where a statement does not add up, it says so before anything is matched.</p>
<p>Meera opens the client and sees the short list that is left: the real exceptions. Each one links to the bank line and the voucher behind it. She re-runs the month after the corrected statement arrives and gets the same matches, minus the one that is now fixed. On Friday the partner reviews exceptions, confirms the ledger map, and signs. The month is locked with a fingerprint of its inputs, and the access log shows who opened what.</p>
<p>Same people, same files, same deadline. The difference is that the second version leaves a proof behind.</p>`,
      `<h2>First, the part the AI vendors get right</h2>
<p>Teams that are given no sanctioned AI tool will find their own. A free, personal-account tool used on client files is the real risk: client data in an account the firm does not control, with no record of what was shared. Under India&rsquo;s Digital Personal Data Protection Act, 2023 and your professional duty of confidentiality, &ldquo;nothing&rdquo; is not a safe policy either.</p>
<p>So the sensible first step is a sanctioned assistant, set up with the tightest settings your plan allows, used on the files you choose to give it. Think of it in levels:</p>
<ul>
<li><strong>Level 0:</strong> works on files you provide, with little or no web access.</li>
<li><strong>Level 1:</strong> can read the web.</li>
<li><strong>Level 2:</strong> can write to other systems. Powerful, and dangerous without precautions.</li>
<li><strong>Level 3:</strong> controls the whole computer.</li>
</ul>
${figure("/blog/ai-assistant-vs-close-system/levels.svg", "Four levels of AI access: Level 0 files only, Level 1 reads the web, Level 2 writes to other systems, Level 3 controls the computer", "Start at Level 0 for client work and move up one level at a time, only with a reason.", 1200, 500)}
<p>For client work, start at Level 0 and move up only with a reason. We agree with that progression, and we think it applies to every tool in the firm, ours included.</p>`,
      `<h2>Where a general assistant stops</h2>
<p>A month-end close is not a question to answer. It is a set of statements to prove. These are the places a conversation falls short:</p>
${figure("/blog/ai-assistant-vs-close-system/flow.svg", "FynHelp's rule: AI reads documents into lines, code proves the arithmetic, people approve the result", "FynHelp separates reading, proving and approving, so the model never decides a match.", 1200, 440)}
<ul>
<li><strong>Arithmetic you can rely on.</strong> A language model reads and writes well. It should not be the thing that adds a ledger or decides that two amounts are the same transaction. FynHelp&rsquo;s rule is: AI reads, code proves, people approve. The AI turns a PDF or a spreadsheet into lines. Code then checks that every statement&rsquo;s opening plus movement equals its closing, every match nets to zero, and every line is used once.</li>
<li><strong>The same answer twice.</strong> Run the same bank statement and Day Book through FynHelp again, from scratch, and you get the same matches. That is tested on real client files before a release goes out.</li>
<li><strong>Every figure traces to a line.</strong> A partner signing an MIS needs to click a number and see the voucher and the bank line behind it.</li>
<li><strong>A record of who did what.</strong> Reads, downloads, exports, confirmations and period locks are logged per client. A locked month records a fingerprint of every input and tells you if one changes afterwards.</li>
<li><strong>Maker and checker.</strong> Mapping Tally ledgers to their families (rent, professional fees, input GST) is a suggestion until a partner or manager confirms it.</li>
<li><strong>Chasing the client.</strong> Following up for missing documents by email and WhatsApp, and filing what comes back to the right client, is a workflow, not a prompt.</li>
</ul>`,
      `<h2>What &ldquo;proves&rdquo; looks like on real books</h2>
<p>We test FynHelp on real client files from CA firms, not only on samples. Some of what that turns up, in general terms:</p>
<ul>
<li>An older Day Book export that quietly missed 72 vouchers of two voucher types. The newer export read in full, and every voucher balanced.</li>
<li>A Trial Balance whose opening debits and credits differ by under a rupee. FynHelp reproduces that exact difference from the ledgers and checks it against the figure Tally itself quotes, rather than trusting it.</li>
<li>TDS taken as credit in the books above what the deductor&rsquo;s Form 26AS shows, by section and by deductor. Books above 26AS is credit that cannot be claimed yet.</li>
<li>A GST credit ledger that does not close against the Tally input ledgers, with the ledgers it counted listed so the CA can correct the choice.</li>
</ul>
<p>An assistant can discuss any of these once you point at them. The value of a close system is that it finds them without being asked, the same way, every month.</p>`,
      `<h2>Side by side</h2>`,
      table(
        ["", "General AI assistant (ChatGPT, Claude)", "FynHelp"],
        [
          ["What it is", "A conversation partner that works on what you give it", "Month-end close software for CA firms, working on top of Tally or Zoho Books"],
          ["Best at", "Drafting, explaining, summarising, ideas, one-off analysis", "Reconciling bank to books, GST and TDS checks, opening balances, ageing, MIS"],
          ["How numbers are checked", "By the model, in the conversation", "By code: balances, nets to zero, each line used once"],
          ["Same files, same result", "Not guaranteed", "Yes, tested on real files"],
          ["Source trace for a figure", "Only if you ask and verify", "Every figure links to its source lines"],
          ["Audit trail per client", "Chat history in an account", "Access log, ledger-map confirmations, period lock with input fingerprint"],
          ["Writes to your books", "Depends on the connectors you switch on", "Off by default for review work; the Tally connector reads, and posts only entries a partner has approved if you turn writing on"],
          ["Setup effort", "Many settings to dial in so the defaults are not too open", "Built for the CA workflow: client, month, documents, close"],
          ["Pricing", "A monthly seat per person", "Per active client with unlimited users"],
        ],
      ),
      `<h2>Use both, with one rule</h2>
<p>If you only get one thing from this article, let it be this: <strong>use the assistant for thinking and FynHelp for numbers a partner will sign.</strong></p>
<ul>
<li>Use an assistant, locked down, to draft a client email, explain a section, outline a note on a notice, or summarise a long circular.</li>
<li>Use FynHelp to take the client&rsquo;s documents through reconciliation, GST and TDS review, and to produce the MIS where every figure is traceable.</li>
<li>Do not paste a whole client&rsquo;s books into a general assistant and treat the answer as the close.</li>
</ul>`,
      `<h2>How FynHelp keeps client work controlled</h2>
<ul>
<li>AI is used only to read documents into lines, with caps on calls and tokens so a bad file cannot run up a bill. Code, not the model, does the checking.</li>
<li>The QC checks are read-only: nothing is posted to Tally or Zoho from them.</li>
<li>Only a partner can sign off a report. Only a partner or manager can confirm a ledger map or fill the party master. Only a partner can lock a month.</li>
<li>Every read, download and export is logged.</li>
</ul>
<p>That is a closed system built for one job. It is a different thing from an open assistant that you have to configure, and it is why the two sit side by side rather than against each other.</p>`,
      faq([
        ["What is ChatGPT for Accounting?", "It is an offering that puts a general AI assistant in front of accounting teams. It is a conversation tool for drafting, explaining and analysing the files you give it, rather than a close system that proves a client&rsquo;s books."],
        ["Is a general AI assistant safe to use on client data?", "It can be, if the firm sanctions it, uses a business plan, locks down the settings, and keeps it at the lowest access level that does the job. A free personal account used on client files is the risky case, because the firm has no control over it."],
        ["Can ChatGPT or Claude reconcile a bank statement to Tally?", "They can help you reason about a few lines you paste in. Reconciling a full year reliably needs checks that run in code: opening plus movement equals closing, each line used once, each match netting to zero, and the same result on a re-run. That is what FynHelp does."],
        ["Does FynHelp replace Tally or Zoho Books?", "No. It works on top of the ledger you already use. For review work it only reads. If you switch writing on at the Tally connector, it posts only entries a partner has approved."],
        ["How does FynHelp control access to client data?", "It keeps an access log of reads, downloads and exports per client, limits sign-off, ledger confirmation and month locks to the right roles, and lets a partner lock a month with a fingerprint of its inputs."],
        ["Should my firm use both?", "For most firms, yes. Use a locked-down assistant for drafting and thinking, and FynHelp for reconciliation, GST and TDS checks, and the MIS a partner signs."],
      ]),
      `<h2>Where to start</h2>
<p>Run a full month on our free <a href="/samples">sample files</a> first, read how the <a href="/agents/recon">Recon</a> agent proves each match, or see how reconciliation fits the whole <a href="/blog/month-end-close-checklist-ca-firms">month-end close checklist</a>. Pricing is per active client with unlimited users: see <a href="/pricing">pricing</a>.</p>`,
      cta("Take one client&rsquo;s bank statement and Day Book through it and see which lines need a person."),
    ].join("\n"),
  },
];
