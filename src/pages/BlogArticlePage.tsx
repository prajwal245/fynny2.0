import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { ArrowLeft, Clock, Eye } from "lucide-react";
import { sanitizeForStorage } from "@/lib/sanitizeHtml";
import { cleanArticleHtml } from "@/lib/cleanArticleHtml";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";


const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author_name: string;
  author_role: string;
  tags: string[];
  views: number;
  reading_time_minutes: number;
  published_at: string;
  cover_image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image?: string | null;
  updated_at?: string | null;
}

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, content, category, author_name, author_role, tags, views, reading_time_minutes, published_at, cover_image_url, seo_title, seo_description, og_image, updated_at")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPost(data as BlogPost);
      setLoading(false);
      await supabase.rpc("increment_blog_views" as any, { p_slug: slug });
    })();
  }, [slug]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  if (loading) {
    return (
      <Layout>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: BEIGE }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.5)" }}>Loading article…</div>
        </div>
      </Layout>
    );
  }

  if (notFound || !post) {
    return (
      <Layout>
        <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BEIGE, gap: 16 }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: INK, margin: 0 }}>Article not found</h1>
          <Link to="/resources?tab=blog" style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: RED, textDecoration: "none" }}>Back to blog</Link>
        </div>
      </Layout>
    );
  }

  const isHtml = /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|img|figure|table|div|br|strong|em)\b/i.test(post.content);
  const html = isHtml
    ? cleanArticleHtml(sanitizeForStorage(post.content), { title: post.title, coverImageUrl: post.cover_image_url })
    : cleanArticleHtml(
        post.content
          .split("\n\n")
          .filter(Boolean)
          .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
          .join(""),
        { title: post.title, coverImageUrl: post.cover_image_url },
      );

  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  // Some posts were pasted in with the SEO worksheet inside the excerpt field.
  const seoBrief = /(seo information|meta description|url slug|primary keyword|featured snippet)/i;
  const cleanExcerpt = post.excerpt && !seoBrief.test(post.excerpt) ? post.excerpt : "";
  const metaTitle = (post.seo_title || post.title || "").slice(0, 65);
  const metaDesc = (post.seo_description || cleanExcerpt || plain).slice(0, 158);
  const canonical = `https://www.fynhelp.com/blog/${post.slug}`;
  const image = post.og_image || post.cover_image_url || null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: metaDesc,
    ...(image ? { image: [image] } : {}),
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { "@type": "Person", name: post.author_name },
    publisher: { "@type": "Organization", name: "FynHelp" },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: post.category,
    keywords: (post.tags || []).join(", "),
  };

  return (
    <Layout>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonical} />
        {image && <meta property="og:image" content={image} />}
        <meta property="article:published_time" content={post.published_at} />
        {post.category && <meta property="article:section" content={post.category} />}
        {post.author_name && <meta property="article:author" content={post.author_name} />}
        <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDesc} />
        {image && <meta name="twitter:image" content={image} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>
      <div style={{ background: BEIGE, minHeight: "100vh" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
          <Link to="/resources?tab=blog" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.55)", textDecoration: "none", marginBottom: 28 }}>
            <ArrowLeft size={15} /> Back to blog
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: RED, background: "rgba(196,30,30,0.08)", padding: "4px 12px", borderRadius: 99, letterSpacing: "0.04em" }}>
              {post.category}
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{formatDate(post.published_at)}</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{post.reading_time_minutes} min read</span>
          </div>

          <h1 style={{ fontFamily: "'Clash Display', Georgia, serif", fontWeight: 700, fontSize: 40, letterSpacing: "-0.02em", color: INK, lineHeight: 1.14, margin: "0 0 16px 0" }}>{post.title}</h1>

          {cleanExcerpt && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, color: "rgba(23,18,8,0.65)", lineHeight: 1.6, margin: "0 0 28px 0" }}>{cleanExcerpt}</p>
          )}


          {post.cover_image_url && (
            <img
              src={post.cover_image_url}
              alt={post.title}
              loading="lazy"
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 16, display: "block", marginBottom: 32, border: "1px solid rgba(23,18,8,0.08)" }}
            />
          )}

          {post.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {post.tags.map(t => (
                <span key={t} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: GOLD, background: "rgba(139,105,20,0.1)", padding: "3px 8px", borderRadius: 6 }}>{t}</span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 0", borderTop: "1px solid rgba(23,18,8,0.08)", borderBottom: "1px solid rgba(23,18,8,0.08)", marginBottom: 40, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)", display: "flex", alignItems: "center", gap: 5 }}><Clock size={13} /> {post.reading_time_minutes} min read</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)", display: "flex", alignItems: "center", gap: 5 }}><Eye size={13} /> {post.views.toLocaleString("en-IN")} views</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{formatDate(post.published_at)}</span>
            </div>
          </div>

          <style>{`
            .fyn-article { font-family: Georgia, serif; font-size: 17px; color: rgba(23,18,8,0.85); line-height: 1.75; }
            .fyn-article > *:first-child { margin-top: 0; }
            .fyn-article p { margin: 0 0 24px 0; }
            .fyn-article h1, .fyn-article h2 { font-weight: 700; font-size: 24px; color: ${INK}; line-height: 1.3; margin: 36px 0 16px 0; }
            .fyn-article h3 { font-weight: 700; font-size: 20px; color: ${INK}; margin: 30px 0 14px 0; }
            .fyn-article h4, .fyn-article h5, .fyn-article h6 { font-weight: 700; font-size: 17px; color: ${INK}; margin: 26px 0 12px 0; }
            .fyn-article ul, .fyn-article ol { margin: 0 0 24px 0; padding-left: 26px; }
            .fyn-article li { margin-bottom: 10px; }
            .fyn-article a { color: ${RED}; text-decoration: underline; }
            .fyn-article strong { color: ${INK}; }
            .fyn-article blockquote { margin: 28px 0; padding: 4px 0 4px 20px; border-left: 3px solid ${RED}; font-style: italic; color: rgba(23,18,8,0.7); }
            .fyn-article img, .fyn-article iframe, .fyn-article video { max-width: 100%; border-radius: 10px; margin: 12px 0 24px; display: block; }
            .fyn-article figure { margin: 0 0 24px 0; }
            .fyn-article figcaption { font-family: Inter, sans-serif; font-size: 12.5px; color: rgba(23,18,8,0.5); margin-top: 8px; text-align: center; }
            .fyn-article pre { background: rgba(23,18,8,0.05); border-radius: 10px; padding: 16px; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; margin: 0 0 24px 0; }
            .fyn-article code { font-family: 'JetBrains Mono', monospace; font-size: 13.5px; background: rgba(23,18,8,0.06); padding: 2px 5px; border-radius: 4px; }
            .fyn-article pre code { background: none; padding: 0; }
            .fyn-article hr { border: none; border-top: 1px solid rgba(23,18,8,0.12); margin: 36px 0; }
            .fyn-article table { width: 100%; border-collapse: collapse; margin: 0 0 24px 0; font-family: Inter, sans-serif; font-size: 14px; }
            .fyn-article th, .fyn-article td { border: 1px solid rgba(23,18,8,0.12); padding: 10px 12px; text-align: left; }
            .fyn-article th { background: rgba(23,18,8,0.04); font-weight: 600; color: ${INK}; }
          `}</style>
          <div className="fyn-article" dangerouslySetInnerHTML={{ __html: html }} />


          <div style={{ background: "white", border: "1px solid rgba(23,18,8,0.08)", borderRadius: 12, padding: 24, marginTop: 48, textAlign: "center" }}>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 18, color: INK, marginBottom: 8 }}>Close your clients' month-end with four agents</div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "rgba(23,18,8,0.65)", marginBottom: 20 }}>FynHelp reads statements and Tally exports, matches bank to books and drafts the MIS. Free to start, no card needed.</p>
            <Link to={SIGNUP_URL} onClick={() => trackCta("start", "blog-article")} style={{ display: "inline-block", padding: "11px 28px", background: RED, color: "white", fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, borderRadius: 8, textDecoration: "none" }}>Start free</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
