import { createFileRoute } from "@tanstack/react-router";
import AboutPage from "@/pages/AboutPage";

export const Route = createFileRoute("/_main/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About FynHelp — the intelligence layer for Indian finance" },
      { name: "description", content: "Why FynHelp exists: agents that read invoices, statements and filings and turn them into decisions Indian businesses can act on this week." },
      { property: "og:title", content: "About FynHelp — the intelligence layer for Indian finance" },
      { property: "og:description", content: "Why FynHelp exists: agents that read invoices, statements and filings and turn them into decisions Indian businesses can act on this week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
