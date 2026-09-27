import { createFileRoute } from "@tanstack/react-router";
import AgentPage from "@/pages/AgentPage";
import { agentBySlug } from "@/components/site/agents";

export const Route = createFileRoute("/_main/agents/$slug")({
  component: RouteComponent,
  head: ({ params }) => {
    const a = agentBySlug(params.slug);
    const title = a ? `${a.name} — FynHelp` : "AI finance agents — FynHelp";
    const description = a
      ? a.sub.slice(0, 155)
      : "Eight AI finance agents that read your books, reconcile them, and tell you what needs a decision.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
});

function RouteComponent() {
  const { slug } = Route.useParams();
  return <AgentPage slug={slug} />;
}
