import { createFileRoute } from "@tanstack/react-router";

// /blog/rss.xml: the newest articles as a feed, so readers, aggregators and AI crawlers can follow the blog. Built on request.
export const Route = createFileRoute("/blog/rss.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { buildBlogFeed } = await import("@/lib/blogFeed.server");
        return new Response(await buildBlogFeed(), {
          headers: {
            "content-type": "application/rss+xml; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
