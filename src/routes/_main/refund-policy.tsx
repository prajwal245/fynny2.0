import { createFileRoute } from "@tanstack/react-router";
import { RefundPage } from "@/pages/LegalPage";
import { breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/refund-policy")({
  head: () =>
    seo({
      title: "Refund and cancellation policy",
      description:
        "How to cancel a FynHelp subscription, the 7-day refund on a first annual payment, billing errors, refund timelines through Razorpay, and GST credit notes.",
      path: "/refund-policy",
      jsonLd: [breadcrumbLd([{ name: "Refund and cancellation policy", path: "/refund-policy" }])],
    }),
  component: RefundPage,
});
