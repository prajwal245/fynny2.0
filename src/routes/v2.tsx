import { createFileRoute } from "@tanstack/react-router";
import V2Shell from "@/v2/Shell";

export const Route = createFileRoute("/v2")({
  head: () => ({
    meta: [
      { title: "FynHelp — Practice OS for CA firms" },
      { name: "description", content: "FynHelp for CA firms: collect client documents, reconcile bank and books, and prepare source-traceable MIS." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "FynHelp — Practice OS for CA firms" },
      { property: "og:description", content: "Collect documents, reconcile bank and books, and prepare source-traceable MIS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: V2Shell,
});
