import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/terms")({
  head: () =>
    seo({
      title: "Terms and conditions",
      description:
        "Terms between your CA firm and FynHelp: the service, free trial, data ownership, fees and GST, liability, termination and grievance redressal, under Indian law.",
      path: "/terms",
      jsonLd: [breadcrumbLd([{ name: "Terms and conditions", path: "/terms" }])],
    }),
  component: TermsPage,
});
