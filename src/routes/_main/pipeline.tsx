import { createFileRoute } from "@tanstack/react-router";
import PipelinePage from "@/pages/PipelinePage";
import { breadcrumbLd, seo, softwareLd, webPageLd } from "@/lib/seo";

const description =
  "Automated bank reconciliation for Tally and Zoho: Extract reads statements, Recon matches bank to books, Narrate drafts MIS, Chaser collects documents.";

export const Route = createFileRoute("/_main/pipeline")({
  component: PipelinePage,
  head: () =>
    seo({
      title: "How it works: month-end close automation for CA firms",
      description,
      path: "/pipeline",
      jsonLd: [
        webPageLd({ name: "How FynHelp works", description, path: "/pipeline" }),
        softwareLd(),
        breadcrumbLd([{ name: "Product", path: "/pipeline" }]),
      ],
    }),
});
