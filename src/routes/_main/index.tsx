import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";
import { HOME_FAQS } from "@/content/faqs";
import { faqLd, seo, softwareLd, webPageLd } from "@/lib/seo";

const description =
  "Month-end close software for CA firms in India: collect client documents, reconcile bank to Tally or Zoho, draft source-linked MIS. 14-day free trial.";

export const Route = createFileRoute("/_main/")({
  head: () =>
    seo({
      title: "FynHelp — Month-end close software for CA firms in India",
      rawTitle: true,
      description,
      path: "/",
      jsonLd: [softwareLd(), webPageLd({ name: "FynHelp", description, path: "/" }), faqLd(HOME_FAQS)],
    }),
  component: Index,
});
