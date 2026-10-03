import { createFileRoute } from "@tanstack/react-router";
import ContactPage from "@/pages/ContactPage";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Talk to FynHelp about pricing, the free Pilot for small practices, or moving your firm's month-end close onto FynHelp. A person replies within one working day.";

export const Route = createFileRoute("/_main/contact")({
  component: ContactPage,
  head: () =>
    seo({
      title: "Contact FynHelp: talk to the team",
      description,
      path: "/contact",
      jsonLd: [
        webPageLd({ type: "ContactPage", name: "Contact FynHelp", description, path: "/contact" }),
        breadcrumbLd([{ name: "Contact", path: "/contact" }]),
      ],
    }),
});
