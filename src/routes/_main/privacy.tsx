import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/privacy")({
  head: () =>
    seo({
      title: "Privacy policy",
      description:
        "What FynHelp collects from CA firms, why, which providers process it, how Gmail data is used under Google's Limited Use rules, and how to have it deleted.",
      path: "/privacy",
      jsonLd: [breadcrumbLd([{ name: "Privacy policy", path: "/privacy" }])],
    }),
  component: PrivacyPage,
});
