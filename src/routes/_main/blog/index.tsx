import { createFileRoute } from "@tanstack/react-router";
import BlogPage from "@/pages/BlogPage";
import { fetchPublishedPosts } from "@/lib/blog";
import { breadcrumbLd, seo, webPageLd } from "@/lib/seo";

const description =
  "Practical guides for CA firms in India on month-end close, bank reconciliation, client MIS, GST and running a practice that does not stall at month-end.";

export const Route = createFileRoute("/_main/blog/")({
  loader: async () => ({ posts: await fetchPublishedPosts() }),
  head: () =>
    seo({
      title: "Blog: month-end close, reconciliation and MIS for CA firms",
      description,
      path: "/blog",
      image: "/og/blog.png",
      imageAlt: "The FynHelp blog for CA firms",
      jsonLd: [
        webPageLd({ type: "CollectionPage", name: "The FynHelp blog", description, path: "/blog" }),
        breadcrumbLd([{ name: "Blog", path: "/blog" }]),
      ],
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const { posts } = Route.useLoaderData();
  return <BlogPage posts={posts} />;
}
