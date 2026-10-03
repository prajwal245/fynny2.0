/**
 * Blog data for route loaders, so articles render on the server: search
 * engines and link previews get the full text, title and Article schema in
 * the first response instead of "Loading article…".
 */
import { supabase } from "@/integrations/supabase/client";
import { sanitizeForStorage } from "@/lib/sanitizeHtml";
import { articleExcerpt, cleanArticleHtml } from "@/lib/cleanArticleHtml";
import { toDescription } from "@/lib/seo";

export interface ListPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  reading_time_minutes: number | null;
  published_at: string | null;
  cover_image_url: string | null;
  is_featured: boolean | null;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  author_name: string;
  author_role: string;
  tags: string[] | null;
  views: number;
  reading_time_minutes: number;
  published_at: string | null;
  cover_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  updated_at: string | null;
}

export type RelatedPost = Pick<ListPost, "slug" | "title" | "category" | "published_at" | "reading_time_minutes">;

// Some posts were pasted in with the SEO worksheet inside the excerpt field.
const SEO_BRIEF_RE = /(seo information|meta description|url slug|primary keyword|featured snippet)/i;
export const cleanExcerpt = (excerpt: string | null | undefined) =>
  excerpt && !SEO_BRIEF_RE.test(excerpt) ? excerpt.trim() : "";

export const listExcerpt = (p: ListPost) =>
  cleanExcerpt(p.excerpt) || articleExcerpt(p.content ?? "", 200, { title: p.title, coverImageUrl: p.cover_image_url });

export async function fetchPublishedPosts(): Promise<ListPost[]> {
  const { data } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, content, category, reading_time_minutes, published_at, cover_image_url, is_featured")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []) as ListPost[];
}

export async function fetchPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9-]{1,200}$/i.test(slug)) return null;
  const { data } = await supabase
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, category, author_name, author_role, tags, views, reading_time_minutes, published_at, cover_image_url, seo_title, seo_description, og_image, updated_at",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as BlogPost | null) ?? null;
}

/** Three more posts to read: same category first, then the newest. */
export async function fetchRelated(post: BlogPost): Promise<RelatedPost[]> {
  const cols = "slug, title, category, published_at, reading_time_minutes";
  const out: RelatedPost[] = [];
  if (post.category) {
    const { data } = await supabase
      .from("blog_posts")
      .select(cols)
      .eq("status", "published")
      .eq("category", post.category)
      .neq("slug", post.slug)
      .order("published_at", { ascending: false })
      .limit(3);
    out.push(...((data ?? []) as RelatedPost[]));
  }
  if (out.length < 3) {
    const { data } = await supabase
      .from("blog_posts")
      .select(cols)
      .eq("status", "published")
      .neq("slug", post.slug)
      .order("published_at", { ascending: false })
      .limit(6);
    for (const r of (data ?? []) as RelatedPost[]) {
      if (out.length >= 3) break;
      if (!out.some((o) => o.slug === r.slug)) out.push(r);
    }
  }
  return out;
}

const TRUSTED_EMBEDS = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com|loom\.com)\//i;

/**
 * Server-side clean-up for stored article HTML (DOMPurify needs a browser,
 * and without one it returns its input untouched). Content is already
 * sanitised when saved; this removes anything executable again.
 */
function serverSafeHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*>/gi, "")
    .replace(/<\/(object|embed|form|button|textarea|select)\s*>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, (m) => {
      const src = m.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
      return TRUSTED_EMBEDS.test(src) ? m.replace(/\s(srcdoc)\s*=\s*("[^"]*"|'[^']*')/gi, "") : "";
    })
    .replace(/\s(on[a-z]+|srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|xlink:href)\s*=\s*(["'])\s*(javascript|vbscript|data):[^"']*\2/gi, ' $1="#"');
}

/** The article body as safe HTML, identical in structure on server and client. */
export function articleBodyHtml(post: Pick<BlogPost, "content" | "title" | "cover_image_url">): string {
  const content = post.content ?? "";
  const isHtml = /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|img|figure|table|div|br|strong|em)\b/i.test(content);
  const raw = isHtml
    ? content
    : content
        .split("\n\n")
        .filter(Boolean)
        .map((para) => `<p>${para.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br />")}</p>`)
        .join("");
  const safe = typeof window === "undefined" ? serverSafeHtml(raw) : sanitizeForStorage(serverSafeHtml(raw));
  return cleanArticleHtml(safe, { title: post.title, coverImageUrl: post.cover_image_url });
}

/** Meta description for an article: the SEO field, else the excerpt, else the opening text. */
export function postDescription(post: BlogPost): string {
  return toDescription(post.seo_description || cleanExcerpt(post.excerpt) || articleBodyHtml(post));
}
