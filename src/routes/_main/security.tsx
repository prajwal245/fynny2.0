import { createFileRoute } from "@tanstack/react-router";
import PublicSecurityPage from "@/pages/SecurityPage";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "How FynHelp protects your clients' financial data: firm-level isolation, private file storage, short-lived links, read-only Gmail access and a full audit trail on every action.";

export const Route = createFileRoute("/_main/security")({
  component: PublicSecurityPage,
  head: () =>
    seo({
      title: "Security and data protection for CA firms",
      description,
      path: "/security",
      image: "/og/security.png",
      imageAlt: "FynHelp security for CA firms",
      jsonLd: [
        webPageLd({ name: "FynHelp security", description, path: "/security" }),
        breadcrumbLd([{ name: "Security", path: "/security" }]),
      ],
    }),
});
