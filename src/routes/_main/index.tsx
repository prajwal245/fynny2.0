import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

const title = "FynHelp — Exception-only close for CA firms";
const description =
  "FynHelp sits on top of Tally, Zoho and bank feeds: it classifies documents, auto-matches what's correct, and gives your team an exception-only review queue. Every number is one click from source.";

export const Route = createFileRoute("/_main/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: "https://www.fynhelp.com/" }],
  }),
  component: Index,
});
