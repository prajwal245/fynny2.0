import { createFileRoute } from "@tanstack/react-router";
import EnterprisePage from "@/pages/EnterprisePage";
import { seo } from "@/lib/seo";

// Shared by direct link only: not indexed, no structured data.
export const Route = createFileRoute("/_main/enterprise")({
  component: EnterprisePage,
  head: () =>
    seo({
      title: "FynHelp for finance teams",
      description: "End the manual month-end. Keep your existing books.",
      path: "/enterprise",
      noindex: true,
    }),
});
