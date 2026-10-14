import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/terms")({
  head: () =>
    seo({
      title: "Terms and conditions",
      description:
        "The terms between your CA firm and FynHelp: the service, the free trial, data ownership and confidentiality, fees and GST, liability, termination and grievance redressal. Governed by the laws of India.",
      path: "/terms",
      jsonLd: [breadcrumbLd([{ name: "Terms and conditions", path: "/terms" }])],
    }),
  component: TermsPage,
});
