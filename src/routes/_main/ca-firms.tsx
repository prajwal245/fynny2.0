import { createFileRoute } from "@tanstack/react-router";
import CAFirmsPage from "@/pages/CAFirmsPage";
import { breadcrumbLd, productLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Practice software for CA firms with 30 to 150 clients: document collection, bank-to-Tally reconciliation and monthly MIS, priced per client entity.";

export const Route = createFileRoute("/_main/ca-firms")({
  component: CAFirmsPage,
  head: () =>
    seo({
      title: "CA firm workflow automation: client MIS and reconciliation",
      description,
      path: "/ca-firms",
      jsonLd: [
        productLd(),
        webPageLd({ name: "FynHelp for CA firms", description, path: "/ca-firms" }),
        breadcrumbLd([{ name: "For CA firms", path: "/ca-firms" }]),
      ],
    }),
});
