import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbLd, seo } from "@/lib/seo";
import LaunchPage from "@/pages/launch/LaunchPage";

export const Route = createFileRoute("/launch")({
  head: () =>
    seo({
      title: "Launch offer: 30 days free for the first 100 CA firms",
      description:
        "Month-end close for CA firms: FynHelp collects client documents, reconciles bank to Tally or Zoho and drafts a source-traceable MIS. The first 100 firms get 30 days free.",
      path: "/launch",
      jsonLd: [breadcrumbLd([{ name: "Launch offer", path: "/launch" }])],
    }),
  component: LaunchPage,
});
