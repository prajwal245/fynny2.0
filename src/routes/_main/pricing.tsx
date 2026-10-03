import { createFileRoute } from "@tanstack/react-router";
import PricingPage from "@/pages/PricingPage";
import { PRICING_FAQS } from "@/content/faqs";
import { breadcrumbLd, faqLd, seo, softwareLd } from "@/lib/seo";

export const Route = createFileRoute("/_main/pricing")({
  component: PricingPage,
  head: () =>
    seo({
      title: "Pricing for CA firms: per client, unlimited users",
      description:
        "FynHelp pricing for CA firms: free Pilot for up to 3 clients, then Starter ₹2,999, Professional ₹5,999 and Scale ₹12,999 a month. Unlimited users, no per-seat fees.",
      path: "/pricing",
      image: "/og/pricing.png",
      imageAlt: "FynHelp pricing for CA firms",
      jsonLd: [softwareLd(), faqLd(PRICING_FAQS), breadcrumbLd([{ name: "Pricing", path: "/pricing" }])],
    }),
});
