import { createFileRoute } from "@tanstack/react-router";
import GuidePage from "@/guide/GuidePage";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "Resource & Product Guide — FynHelp" },
      { name: "description", content: "How FynHelp's AI agents, CA workflows and reconciliation pipelines work, step by step, with the rules and thresholds the product runs on." },
    ],
  }),
  component: GuidePage,
});
