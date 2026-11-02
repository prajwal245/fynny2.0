import { answer, cta, faq, type StaticPost } from "./shared";
import { PRESS, PRESS_POST_SLUG } from "@/content/press";

/** The launch coverage, listed in one place with the outlets' own links, grouped by headline. */
const PRESS_PUBLISHED = "2026-11-02T00:00:00.000Z";
const PRESS_UPDATED = "2026-11-02T07:46:31.000Z";

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
        ["Does FynHelp replace Tally or Zoho Books?", "No. FynHelp works on top of the ledger a firm already uses. It never writes to Tally."],
        ["How is FynHelp priced?", "Per active client, with unlimited users. Plans start at ₹1,999 a month for 10 clients, excluding GST, and there is a free trial with no card."],
      ]),
      cta("See what the coverage describes on one of your own clients."),
    ].join("\n"),
  },
];
