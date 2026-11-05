import { createFileRoute } from "@tanstack/react-router";
import EnterprisePage from "@/pages/EnterprisePage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/enterprise")({
  component: EnterprisePage,
  head: () =>
    seo({
      title: "Enterprise month-end automation for Indian finance teams",
      description:
        "Bank, GST and TDS reconciliation, intercompany matching and MIS commentary on your Tally, SAP or Zoho books. Coming soon. Get early access.",
      path: "/enterprise",
      jsonLd: [breadcrumbLd([{ name: "Enterprise", path: "/enterprise" }])],
    }),
});
