import { createFileRoute } from "@tanstack/react-router";
import V2Shell from "@/v2/Shell";

export const Route = createFileRoute("/v2")({
  head: () => ({
    meta: [
      { title: "FynHelp Practice OS — Version 2 preview" },
      { name: "description", content: "Preview of the new FynHelp practice dashboard for CA firms: portfolio, documents, review, reconciliation exceptions, MIS and chasers." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "FynHelp Practice OS — Version 2 preview" },
      { property: "og:description", content: "Preview of the new FynHelp practice dashboard for CA firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: V2Shell,
});
