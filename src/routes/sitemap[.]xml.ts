import { createFileRoute } from "@tanstack/react-router";

// /sitemap.xml — built on request so new blog posts appear without a deploy.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { buildSitemap } = await import("@/lib/sitemap.server");
        return new Response(await buildSitemap(), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
