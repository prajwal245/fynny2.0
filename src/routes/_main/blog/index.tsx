import { createFileRoute } from "@tanstack/react-router";
import BlogPage from "@/pages/BlogPage";
import { fetchPublishedPosts } from "@/lib/blog";
import { absoluteUrl, breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Practical guides for CA firms in India on month-end close, bank reconciliation, client MIS, GST and running a practice that does not stall at month-end.";

export const Route = createFileRoute("/_main/blog/")({
  loader: async () => ({ posts: await fetchPublishedPosts() }),
  head: ({ loaderData }) => {
    const head = seo({
      title: "Blog: month-end close, reconciliation and MIS for CA firms",
      description,
      path: "/blog",
      image: "/og/blog.png",
      imageAlt: "The FynHelp blog for CA firms",
      jsonLd: [
        webPageLd({ type: "CollectionPage", name: "The FynHelp blog", description, path: "/blog" }),
        breadcrumbLd([{ name: "Blog", path: "/blog" }]),
        // The list of articles, in order, so crawlers and answer engines see what the blog covers.
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: (loaderData?.posts ?? []).slice(0, 30).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/blog/${p.slug}`), name: p.title })),
        },
      ],
    });
    return { ...head, links: [...head.links, { rel: "alternate", type: "application/rss+xml", title: "The FynHelp blog", href: "/blog/rss.xml" }] };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { posts } = Route.useLoaderData();
  return <BlogPage posts={posts} />;
}
