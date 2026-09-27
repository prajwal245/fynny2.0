import { createFileRoute } from "@tanstack/react-router";
import PricingPage from "@/pages/PricingPage";

export const Route = createFileRoute("/_main/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "FynHelp pricing — pay per active client, unlimited users" },
      { name: "description", content: "Pay for the clients you actually close. Starter ₹2,999, Professional ₹5,999, Scale ₹12,999 per month with unlimited users, the full Extract Recon Narrate pipeline, and a 30-day free trial." },
      { property: "og:title", content: "FynHelp pricing — pay per active client, unlimited users" },
      { property: "og:description", content: "Pay for the clients you actually close. Unlimited users and the full Extract Recon Narrate pipeline on every plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
