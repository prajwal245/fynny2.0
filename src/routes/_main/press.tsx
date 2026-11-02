import { createFileRoute } from "@tanstack/react-router";
import PressPage from "@/pages/PressPage";
import { fetchPress, pressLd } from "@/lib/press";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "FynHelp in the news: media coverage and press releases about FynHelp, the month-end close software for CA firms in India, plus media contact and brand assets.";

export const Route = createFileRoute("/_main/press")({
  // Loaded on the server, so the coverage and its markup are in the first HTML.
  loader: async () => ({ items: await fetchPress() }),
  head: ({ loaderData }) =>
    seo({
      title: "Press & Media: FynHelp in the News",
      description,
      path: "/press",
      jsonLd: [
        webPageLd({ type: "CollectionPage", name: "FynHelp press and media", description, path: "/press" }),
        breadcrumbLd([{ name: "Press & media", path: "/press" }]),
        ...(loaderData?.items.length ? [pressLd(loaderData.items)] : []),
      ],
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const { items } = Route.useLoaderData();
  return <PressPage items={items} />;
}
