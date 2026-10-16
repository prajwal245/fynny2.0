import { createFileRoute } from "@tanstack/react-router";
import PricingPage from "@/pages/PricingPage";
import { PRICING_FAQS } from "@/content/faqs";
import { breadcrumbLd, faqLd, productLd, seo, softwareLd } from "@/lib/seo";

export const Route = createFileRoute("/_main/pricing")({
  component: PricingPage,
  head: () =>
    seo({
      title: "Pricing for CA firms: per client, unlimited users",
      description:
        "FynHelp pricing for CA firms: Essential ₹1,999, Firm ₹4,499 and Scale ₹9,999 a month + GST, priced per active client. Unlimited users, free trial from your first upload, no card needed.",
      path: "/pricing",
      image: "/og/pricing.png",
      imageAlt: "FynHelp pricing for CA firms",
      jsonLd: [softwareLd(), productLd(), faqLd(PRICING_FAQS), breadcrumbLd([{ name: "Pricing", path: "/pricing" }])],
    }),
});
