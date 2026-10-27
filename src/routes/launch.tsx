import { createFileRoute } from "@tanstack/react-router";
import { breadcrumbLd, seo } from "@/lib/seo";
import LaunchPage from "@/pages/launch/LaunchPage";

export const Route = createFileRoute("/launch")({
  head: () =>
    seo({
      title: "Launch offer: 30 days free for the first 100 CA firms",
      description:
        "FynHelp reviews the client books your firm already handles, flags what needs attention and gives your team clear insights. The first 100 CA firms get 30 days free.",
      path: "/launch",
      jsonLd: [breadcrumbLd([{ name: "Launch offer", path: "/launch" }])],
    }),
  component: LaunchPage,
});
