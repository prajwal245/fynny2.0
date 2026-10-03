import { useEffect } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { ArrowLeft, Clock, Eye } from "lucide-react";
import { articleBodyHtml, cleanExcerpt, type BlogPost, type RelatedPost } from "@/lib/blog";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";


const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";

export default function BlogArticlePage({ post, related }: { post: BlogPost; related: RelatedPost[] }) {
  useEffect(() => {
    void supabase.rpc("increment_blog_views" as never, { p_slug: post.slug } as never);
  }, [post.slug]);

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const html = articleBodyHtml(post);
  const excerpt = cleanExcerpt(post.excerpt);

  return (
    <Layout>
      <div style={{ background: BEIGE, minHeight: "100vh" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
          <nav aria-label="Breadcrumb" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.55)", marginBottom: 28 }}>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <li><Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link></li>
              <li aria-hidden="true">/</li>
              <li>
                <Link to="/blog" style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <ArrowLeft size={14} /> Blog
                </Link>
              </li>
            </ol>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: RED, background: "rgba(196,30,30,0.08)", padding: "4px 12px", borderRadius: 99, letterSpacing: "0.04em" }}>
              {post.category}
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}><time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time></span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "rgba(23,18,8,0.5)" }}>{post.reading_time_minutes} min read</span>
          </div>

          <h1 style={{ fontFamily: "'Clash Display', Georgia, serif", fontWeight: 700, fontSize: 40, letterSpacing: "-0.02em", color: INK, lineHeight: 1.14, margin: "0 0 16px 0" }}>{post.title}</h1>

          {excerpt && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, color: "rgba(23,18,8,0.65)", lineHeight: 1.6, margin: "0 0 28px 0" }}>{excerpt}</p>
          )}


          {post.cover_image_url && (
            <img
              src={post.cover_image_url}
              alt={post.title}
              width={1280}
              height={720}
              fetchPriority="high"
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 16, display: "block", marginBottom: 32, border: "1px solid rgba(23,18,8,0.08)" }}
            />
          )}

          {(post.tags?.length ?? 0) > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              {post.tags!.map(t => (
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
          {/* Cleaned on the server, sanitised again in the browser; keep the server copy on hydration. */}
          <div className="fyn-article" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />

          {related.length > 0 && (
            <section aria-labelledby="related-h" style={{ marginTop: 56 }}>
              <h2 id="related-h" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(23,18,8,0.5)", margin: "0 0 14px" }}>Keep reading</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link to={`/blog/${r.slug}`} style={{ display: "block", background: "white", border: "1px solid rgba(23,18,8,0.08)", borderRadius: 12, padding: "14px 18px", textDecoration: "none" }}>
                      <span style={{ display: "block", fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: INK, lineHeight: 1.35 }}>{r.title}</span>
                      <span style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "rgba(23,18,8,0.5)", marginTop: 4 }}>
                        {[r.category, r.reading_time_minutes ? `${r.reading_time_minutes} min read` : null].filter(Boolean).join(" · ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="product-h" style={{ marginTop: 40, fontFamily: "Inter, sans-serif", fontSize: 14.5, color: "rgba(23,18,8,0.7)", lineHeight: 1.7 }}>
            <h2 id="product-h" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(23,18,8,0.5)", margin: "0 0 10px" }}>How FynHelp helps</h2>
            <p style={{ margin: 0 }}>
              FynHelp runs a CA firm's month-end close in four steps:{" "}
              <Link to="/agents/extract" style={{ color: RED }}>bank statement and Tally export extraction</Link>,{" "}
              <Link to="/agents/recon" style={{ color: RED }}>bank reconciliation</Link>,{" "}
              <Link to="/agents/narrate" style={{ color: RED }}>source-traceable MIS reports</Link> and{" "}
              <Link to="/agents/chaser" style={{ color: RED }}>automated document follow-ups</Link>. See{" "}
              <Link to="/pricing" style={{ color: RED }}>pricing for CA firms</Link>.
            </p>
          </section>


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
