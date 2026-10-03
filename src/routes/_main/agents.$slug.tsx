import { createFileRoute, notFound } from "@tanstack/react-router";
import AgentPage from "@/pages/AgentPage";
import { AGENT_SEO, agentBySlug } from "@/components/site/agents";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/_main/agents/$slug")({
  // Unknown module names are a real 404, not an empty page Google could index.
  beforeLoad: ({ params }) => {
    if (!agentBySlug(params.slug)) throw notFound();
  },
  component: RouteComponent,
  head: ({ params }) => {
    const a = agentBySlug(params.slug);
    const s = AGENT_SEO[params.slug];
    if (!a || !s) return {};
    const path = `/agents/${a.slug}`;
    return seo({
      title: s.title,
      description: s.description,
      path,
      image: `/og/${a.slug}.png`,
      imageAlt: `FynHelp ${a.name}: ${s.keyword.toLowerCase()} for CA firms`,
      jsonLd: [
        webPageLd({ name: s.title, description: s.description, path }),
        breadcrumbLd([
          { name: "Product", path: "/pipeline" },
          { name: a.name, path },
        ]),
      ],
    });
  },
});

function RouteComponent() {
  const { slug } = Route.useParams();
  return <AgentPage slug={slug} />;
}
