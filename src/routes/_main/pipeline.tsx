import { createFileRoute } from "@tanstack/react-router";
import PipelinePage from "@/pages/PipelinePage";
import { breadcrumbLd, seo, softwareLd, webPageLd } from "@/lib/seo";

const description =
  "How FynHelp automates a CA firm's month-end close: Extract reads statements and Tally exports, Recon matches bank to books, Narrate drafts the MIS, and Chaser collects missing documents.";

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
