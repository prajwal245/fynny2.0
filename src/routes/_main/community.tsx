import { createFileRoute } from "@tanstack/react-router";
import CommunityPage from "@/pages/CommunityPage";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/community")({
  component: CommunityPage,
  // A "coming soon" page has nothing to rank for yet.
  head: () =>
    seo({
      title: "Community",
      description: "The FynHelp community for CA practices is coming soon.",
      path: "/community",
      noindex: true,
    }),
});
