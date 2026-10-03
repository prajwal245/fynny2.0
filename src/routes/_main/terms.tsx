import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/terms")({
  head: () =>
    seo({
      title: "Terms of service",
      description:
        "The agreement between your CA firm and FynHelp: the service, your responsibilities, data ownership, fees, availability and liability. Governed by the laws of India.",
      path: "/terms",
      jsonLd: [breadcrumbLd([{ name: "Terms of service", path: "/terms" }])],
    }),
  component: TermsPage,
});
