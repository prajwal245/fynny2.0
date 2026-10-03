import { createFileRoute, notFound } from "@tanstack/react-router";
import BlogArticlePage from "@/pages/BlogArticlePage";
import { fetchPost, fetchRelated, postDescription } from "@/lib/blog";
import { articleLd, breadcrumbLd, seo } from "@/lib/seo";

export const Route = createFileRoute("/_main/blog/$slug")({
  // Loaded on the server: the article, its title and schema are in the first HTML.
  loader: async ({ params }) => {
    const post = await fetchPost(params.slug);
    if (!post) throw notFound();
    return { post, related: await fetchRelated(post) };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { post } = loaderData;
    const path = `/blog/${post.slug}`;
    const description = postDescription(post);
    const title = (post.seo_title || post.title).trim();
    const image = post.og_image || post.cover_image_url || undefined;
    return seo({
      // Long headlines stand alone; short ones get the brand.
      title,
      rawTitle: title.length > 50,
      description,
      path,
      type: "article",
      image,
      imageAlt: post.title,
      article: { publishedTime: post.published_at, modifiedTime: post.updated_at, section: post.category, tags: post.tags },
      jsonLd: [
        articleLd({
          title: post.title,
          description,
          path,
          image,
          publishedTime: post.published_at,
          modifiedTime: post.updated_at,
          authorName: post.author_name,
          section: post.category,
          tags: post.tags,
        }),
        breadcrumbLd([
          { name: "Blog", path: "/blog" },
          { name: post.title, path },
        ]),
      ],
    });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { post, related } = Route.useLoaderData();
  return <BlogArticlePage post={post} related={related} />;
}
