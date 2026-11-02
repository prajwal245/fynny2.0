import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";
import { HOME_FAQS } from "@/content/faqs";
import { fetchPress, pressLd } from "@/lib/press";
import { faqLd, seo, softwareLd, webPageLd } from "@/lib/seo";

const description =
  "Month-end close software for CA firms in India: collect client documents, reconcile bank to Tally or Zoho, draft source-linked MIS. 14-day free trial.";

export const Route = createFileRoute("/_main/")({
  // Press articles for the "Featured in" strip and its markup, loaded on the server.
  loader: async () => ({ press: await fetchPress() }),
  head: ({ loaderData }) =>
    seo({
      title: "FynHelp — Month-end close software for CA firms in India",
      rawTitle: true,
      description,
      path: "/",
      jsonLd: [softwareLd(), webPageLd({ name: "FynHelp", description, path: "/" }), faqLd(HOME_FAQS), ...(loaderData?.press.length ? [pressLd(loaderData.press)] : [])],
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const { press } = Route.useLoaderData();
  return <Index press={press} />;
}
