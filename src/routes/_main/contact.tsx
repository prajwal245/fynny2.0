import { createFileRoute } from "@tanstack/react-router";
import ContactPage from "@/pages/ContactPage";

export const Route = createFileRoute("/_main/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact FynHelp — talk to a human, not a ticket queue" },
      { name: "description", content: "Questions on pricing, the free Pilot program, or onboarding your firm's book of clients — FynHelp replies within one working day." },
      { property: "og:title", content: "Contact FynHelp — talk to a human, not a ticket queue" },
      { property: "og:description", content: "Questions on pricing, the free Pilot program, or onboarding your firm's book of clients — FynHelp replies within one working day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});
