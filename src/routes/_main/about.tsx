import { createFileRoute } from "@tanstack/react-router";
import AboutPage from "@/pages/AboutPage";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "FynHelp is a Bengaluru team building practice software for Indian CA firms: the layer between client documents and the Tally or Zoho ledger that makes month-end close a review.";

export const Route = createFileRoute("/_main/about")({
  component: AboutPage,
  head: () =>
    seo({
      title: "About FynHelp: practice software for Indian CA firms",
      description,
      path: "/about",
      jsonLd: [
        webPageLd({ type: "AboutPage", name: "About FynHelp", description, path: "/about" }),
        breadcrumbLd([{ name: "About", path: "/about" }]),
      ],
    }),
});
