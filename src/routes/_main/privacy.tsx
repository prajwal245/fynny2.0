import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/privacy")({
  head: () =>
    seo({
      title: "Privacy policy",
      description:
        "How FynHelp handles personal data under the DPDP Act and IT Act: what we collect, why, our sub-processors, Google API Limited Use, retention, security, breaches and your rights.",
      path: "/privacy",
      jsonLd: [breadcrumbLd([{ name: "Privacy policy", path: "/privacy" }])],
    }),
  component: PrivacyPage,
});
