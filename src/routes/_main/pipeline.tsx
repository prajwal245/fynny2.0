import { createFileRoute } from "@tanstack/react-router";
import PipelinePage from "@/pages/PipelinePage";

export const Route = createFileRoute("/_main/pipeline")({
  component: PipelinePage,
  head: () => ({
    meta: [
      { title: "The FynHelp pipeline — Extract, Recon, Narrate, Chaser" },
      { name: "description", content: "Four deliberate steps run on every client entity: documents extracted into structured lines, bank matched to books, narrations drafted with sources attached, and polite follow-ups sent automatically." },
      { property: "og:title", content: "The FynHelp pipeline — Extract, Recon, Narrate, Chaser" },
      { property: "og:description", content: "Four deliberate steps run on every client entity: Extract, Recon, Narrate and Chaser — visible, reviewable, and source-traceable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
