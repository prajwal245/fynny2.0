/**
 * The site's footer links, in one place so the shared footer and any page with its own
 * footer (the accounting firms landing page) list the same destinations.
 *
 * Grouped the way a B2B buyer looks for things: what the product is, who it is for,
 * what to read before buying, who is behind it, and the legal and trust pages.
 * Every destination is a page that exists today.
 */
import { AGENTS } from "./agents";

export type FooterLink =
  { label: string; to: string } | { label: string; action: "cookies" };
export type FooterColumn = { heading: string; links: FooterLink[] };

export const FOOTER_TAGLINE =
  "Month-end close software for accounting firms. Documents in, matched books and a signed-off MIS out.";

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", to: "/pipeline" },
      ...AGENTS.map((a) => ({ label: a.name, to: `/agents/${a.slug}` })),
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Accounting firms", to: "/for/accounting-firms" },
      { label: "CA firms", to: "/ca-firms" },
      { label: "Finance teams", to: "/enterprise" },
      { label: "All use cases", to: "/use-cases" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", to: "/blog" },
      { label: "Product guide", to: "/guide" },
      {
        label: "Tally vs Zoho Books",
        to: "/blog/tally-vs-zoho-books-for-ca-firms",
      },
      {
        label: "ChatGPT vs FynHelp",
        to: "/blog/chatgpt-for-accounting-vs-fynhelp-ca-firms-india",
      },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Security", to: "/security" },
      { label: "Press", to: "/press" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Refunds and cancellation", to: "/refund-policy" },
      { label: "Cookie settings", action: "cookies" },
    ],
  },
];
