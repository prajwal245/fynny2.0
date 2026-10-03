import { createFileRoute } from "@tanstack/react-router";
import CAFirmsPage from "@/pages/CAFirmsPage";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Workflow automation for CA firms managing 30 to 150 clients: collect documents, reconcile bank to Tally and Zoho, and deliver monthly MIS without the month-end scramble.";

export const Route = createFileRoute("/_main/ca-firms")({
  component: CAFirmsPage,
  head: () =>
    seo({
      title: "CA firm workflow automation: client MIS and reconciliation",
      description,
      path: "/ca-firms",
      jsonLd: [
        webPageLd({ name: "FynHelp for CA firms", description, path: "/ca-firms" }),
        breadcrumbLd([{ name: "For CA firms", path: "/ca-firms" }]),
      ],
    }),
});
