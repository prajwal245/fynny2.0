import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbLd, seo } from "@/lib/seo";
import LaunchPage from "@/pages/launch/LaunchPage";

export const Route = createFileRoute("/launch")({
  head: () =>
    seo({
      title: "FynHelp — Month-end close for CA firms, run by agents",
      rawTitle: true,
      description:
        "FynHelp chases clients on WhatsApp, reads documents, reconciles bank to Tally or Zoho and drafts the MIS. Your team reviews. The partner signs.",
      path: "/launch",
      jsonLd: [breadcrumbLd([{ name: "Launch offer", path: "/launch" }])],
    }),
  component: LaunchPage,
});
