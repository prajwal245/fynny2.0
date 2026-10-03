import { createFileRoute } from "@tanstack/react-router";
import ResourcesPage from "@/pages/ResourcesPage";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/resources")({
  component: ResourcesPage,
  // Older library page that duplicates the blog behind ?tab= filters: the blog is the indexed home for articles.
  head: () =>
    seo({
      title: "Resources",
      description: "Guides, templates and articles from FynHelp for CA practices.",
      path: "/resources",
      noindex: true,
    }),
});
