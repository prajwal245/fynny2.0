import { answer, cta, faq, type StaticPost } from "./shared";
import { PRESS, PRESS_HEADLINE, PRESS_POST_SLUG } from "@/content/press";

/** The launch coverage, listed in one place with the outlets' own links. */
const PRESS_PUBLISHED = "2026-11-02T00:00:00.000Z";

export const POSTS_C: StaticPost[] = [
  {
    slug: PRESS_POST_SLUG,
    title: "FynHelp in the news: why India's CA firms lose a week to reconciliation",
    excerpt:
      "FynHelp's launch has been published by 11 news outlets. Read the coverage, and what FynHelp does for CA firms at month-end.",
    seo_title: "FynHelp in the News: CA Firms Lose a Week to Reconciliation",
    seo_description:
      "FynHelp's launch coverage from 11 outlets: why CA firms in India lose a week each month to reconciliation, and how FynHelp's four agents win it back.",
    category: "News",
    tags: ["FynHelp in the news", "FynHelp launch", "CA firms reconciliation", "month-end close", "press"],
    reading_time_minutes: 3,
    published_at: PRESS_PUBLISHED,
    content: [
      answer(
        `FynHelp, month-end close software for chartered accountant (CA) firms in India, was covered by ${PRESS.length} news outlets under the headline &ldquo;${PRESS_HEADLINE}&rdquo;. FynHelp works on top of the ledger a firm already uses (Tally or Zoho Books) and handles the reconciliation work that fills the first week of every month.`
      ),
      `<h2>The coverage</h2><p>The launch article was published by these ${PRESS.length} outlets. Each link opens the outlet's own page.</p><ul>${PRESS.map(
        (p) => `<li><a href="${p.url}" rel="noopener noreferrer" target="_blank">${p.outlet}</a>: ${PRESS_HEADLINE}</li>`
      ).join("")}</ul>`,
      `<h2>What FynHelp does</h2>
<p>Four agents run each client's month. <a href="/agents/extract">Extract</a> reads bank statements and Tally or Zoho exports. <a href="/agents/recon">Recon</a> matches bank to books and leaves only real exceptions for a person. <a href="/agents/narrate">Narrate</a> drafts a monthly MIS where every figure links to its source lines. <a href="/agents/chaser">Chaser</a> follows up with clients for missing documents by email and WhatsApp. Only a partner can sign off a report.</p>`,
      `<h2>Try it</h2><p>Pricing is per active client with unlimited users. See <a href="/pricing">pricing</a>, or run the whole month on free <a href="/samples">sample files</a> first.</p>`,
      faq([
        ["Where was the FynHelp launch covered?", `The launch article, &ldquo;${PRESS_HEADLINE}&rdquo;, was published by ${PRESS.length} outlets: ${PRESS.map((p) => p.outlet).join(", ")}. Links to each are on this page.`],
        ["What is FynHelp?", "FynHelp is month-end close software for CA firms in India. It collects client documents, reconciles bank statements to Tally or Zoho books and drafts a source-traceable MIS that a partner signs off."],
        ["Does FynHelp replace Tally or Zoho Books?", "No. FynHelp works on top of the ledger a firm already uses. It never writes to Tally."],
        ["How is FynHelp priced?", "Per active client, with unlimited users. Plans start at ₹1,999 a month for 10 clients, excluding GST, and there is a free trial with no card."],
      ]),
      cta("See what the coverage describes on one of your own clients."),
    ].join("\n"),
  },
];
