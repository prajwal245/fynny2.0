import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbLd, seo } from "@/lib/seo";
import GuidePage from "@/guide/GuidePage";

export const Route = createFileRoute("/guide")({
  head: () =>
    seo({
      title: "Product guide: how FynHelp closes the month",
      description:
        "How FynHelp's agents work for CA firms: document intake, the five recon stages, MIS drafting and client chasing, with the exact rules and thresholds.",
      path: "/guide",
      jsonLd: [breadcrumbLd([{ name: "Product guide", path: "/guide" }])],
    }),
  component: GuidePage,
});
