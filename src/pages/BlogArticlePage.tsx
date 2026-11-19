import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { ArrowLeft, Check, Clock, Eye, Link2, Linkedin, MessageCircle } from "lucide-react";
import { articleBodyHtml, cleanExcerpt, type BlogPost, type RelatedPost } from "@/lib/blog";
import { splitAtSection, withHeadingIds } from "@/lib/articleStructure";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";

const INK = "#171208";
const RED = "#C41E1E";
const BEIGE = "#F4EDDA";
const GOLD = "#8B6914";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "F";

/** A thin bar at the top that fills as the article is read. */
function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const on = () => {
      const el = document.querySelector(".fyn-article");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.5;
      setPct(Math.max(0, Math.min(100, ((-r.top + window.innerHeight * 0.2) / Math.max(total, 1)) * 100)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return <div aria-hidden="true" className="fa-progress"><i style={{ width: `${pct}%` }} /></div>;
}

function Share({ title, slug }: { title: string; slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => (typeof window !== "undefined" ? `${window.location.origin}/blog/${slug}` : `/blog/${slug}`);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the link is in the address bar */ }
  };
  const open = (href: string) => () => window.open(href, "_blank", "noopener,noreferrer");
  return (
    <div className="fa-share" role="group" aria-label="Share this article">
      <button type="button" onClick={open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`)} aria-label="Share on LinkedIn" title="LinkedIn"><Linkedin size={15} /></button>
      <button type="button" onClick={open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`)} aria-label="Share on WhatsApp" title="WhatsApp"><MessageCircle size={15} /></button>
      <button type="button" onClick={() => void copy()} aria-label="Copy link" title="Copy link">{copied ? <Check size={15} /> : <Link2 size={15} />}</button>
      <span aria-live="polite" style={{ fontSize: 12, color: "rgba(23,18,8,0.55)" }}>{copied ? "Link copied" : ""}</span>
    </div>
  );
}

function CtaCard({ where }: { where: string }) {
  return (
    <div className="fa-cta">
      <div className="fa-cta-t">Close your clients' month-end faster</div>
      <p>FynHelp reads bank statements and Tally exports, matches bank to books, and hands you only the lines that need a decision. Nothing is posted without your approval.</p>
      <Link to={SIGNUP_URL} onClick={() => trackCta("start", where)} className="fa-cta-b">Start free trial</Link>
      <span className="fa-cta-s">Free to start, no card needed</span>
    </div>
  );
}

export default function BlogArticlePage({ post, related }: { post: BlogPost; related: RelatedPost[] }) {
  useEffect(() => {
    void supabase.rpc("increment_blog_views" as never, { p_slug: post.slug } as never);
  }, [post.slug]);

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const excerpt = cleanExcerpt(post.excerpt);
  const { html, toc } = useMemo(() => withHeadingIds(articleBodyHtml(post)), [post]);
  const hasAnswerBox = /class\s*=\s*["'][^"']*\banswer\b/i.test(html);
  // The article's own answer box, or its excerpt, becomes the "In short" block. The first paragraph is never copied up: it is already the opening of the article.
  const inShort = hasAnswerBox ? "" : excerpt.length >= 40 ? excerpt : "";
  const [bodyA, bodyB] = useMemo(() => splitAtSection(html), [html]);
  const updated = post.updated_at && post.published_at && formatDate(post.updated_at) !== formatDate(post.published_at) ? post.updated_at : null;
  const author = post.author_name || "FynHelp team";

  return (
    <Layout>
      <ReadingProgress />
      <div style={{ background: BEIGE, minHeight: "100vh" }}>
        <div className="fa-wrap">
          <nav aria-label="Breadcrumb" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.55)", marginBottom: 24 }}>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <li><Link to="/" style={{ color: "inherit", textDecoration: "none" }}>Home</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link to="/blog" style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /> Blog</Link></li>
              {post.category && (<><li aria-hidden="true">/</li><li aria-current="page" style={{ color: INK }}>{post.category}</li></>)}
            </ol>
          </nav>

          <header className="fa-head">
            {post.category && <span className="fa-pill">{post.category}</span>}
            <h1 className="fa-h1">{post.title}</h1>
            <div className="fa-byline" data-testid="byline">
              <span className="fa-av" aria-hidden="true">{initials(author)}</span>
              <span>
                <b>{author}</b>{post.author_role ? <span className="fa-role">, {post.author_role}</span> : null}
                <span className="fa-meta">
                  <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
                  {updated && <> · Updated <time dateTime={updated}>{formatDate(updated)}</time></>}
                  {" · "}{post.reading_time_minutes} min read
                </span>
              </span>
            </div>
            {inShort ? (
              <aside className="fa-short" data-speakable="true" aria-label="In short"><b>In short</b><p>{inShort}</p></aside>
            ) : excerpt ? (
              <p className="fa-lede" data-speakable="true">{excerpt}</p>
            ) : null}
          </header>

          {post.cover_image_url && (
            <img src={post.cover_image_url} alt={post.title} width={1280} height={720} fetchPriority="high" className="fa-cover" />
          )}

          <div className="fa-grid">
            <article>
              {toc.length > 2 && (
                <details className="fa-toc-m">
                  <summary>On this page</summary>
                  <ol>{toc.map((t) => <li key={t.id} className={t.level === 3 ? "l3" : ""}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
                </details>
              )}
          <style>{`
            .fa-wrap { max-width: 1120px; margin: 0 auto; padding: 36px 24px 90px; }
            .fa-progress { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 60; background: transparent; }
            .fa-progress i { display: block; height: 100%; background: ${RED}; transition: width .08s linear; }
            .fa-head { max-width: 820px; margin: 0 0 30px; }
            .fa-pill { display: inline-block; font-family: Inter, sans-serif; font-size: 12px; font-weight: 700; color: ${RED}; background: rgba(196,30,30,0.08); padding: 4px 12px; border-radius: 99px; letter-spacing: 0.04em; margin-bottom: 14px; }
            .fa-h1 { font-family: 'Clash Display', Georgia, serif; font-weight: 700; font-size: 44px; letter-spacing: -0.025em; color: ${INK}; line-height: 1.1; margin: 0 0 20px; }
            .fa-byline { display: flex; gap: 12px; align-items: center; font-family: Inter, sans-serif; font-size: 14px; color: rgba(23,18,8,0.75); margin-bottom: 22px; }
            .fa-av { width: 40px; height: 40px; border-radius: 99px; background: ${INK}; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: none; }
            .fa-role { color: rgba(23,18,8,0.6); }
            .fa-meta { display: block; font-size: 12.5px; color: rgba(23,18,8,0.55); margin-top: 2px; }
            .fa-lede { font-family: Inter, sans-serif; font-size: 19px; line-height: 1.6; color: rgba(23,18,8,0.72); margin: 0; }
            .fa-short { background: #fff; border: 1px solid rgba(23,18,8,0.1); border-left: 4px solid ${RED}; border-radius: 12px; padding: 16px 20px; }
            .fa-short b { display: block; font-family: Inter, sans-serif; font-size: 11.5px; letter-spacing: .1em; text-transform: uppercase; color: ${RED}; margin-bottom: 6px; }
            .fa-short p { margin: 0; font-family: Inter, sans-serif; font-size: 16.5px; line-height: 1.6; color: ${INK}; }
            .fa-cover { width: 100%; max-width: 820px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 16px; display: block; margin: 0 0 34px; border: 1px solid rgba(23,18,8,0.08); }
            .fa-grid { display: grid; grid-template-columns: minmax(0, 720px) 300px; gap: 56px; align-items: start; }
            .fa-side { position: sticky; top: 92px; display: grid; gap: 18px; font-family: Inter, sans-serif; }
            .fa-toc { background: #fff; border: 1px solid rgba(23,18,8,0.08); border-radius: 14px; padding: 16px 18px; }
            .fa-toc h2, .fa-toc-m summary { font-size: 11.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(23,18,8,0.5); margin: 0 0 10px; }
            .fa-toc ol, .fa-toc-m ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
            .fa-toc a, .fa-toc-m a { color: rgba(23,18,8,0.72); text-decoration: none; font-size: 13.5px; line-height: 1.4; }
            .fa-toc a:hover, .fa-toc-m a:hover { color: ${RED}; }
            .fa-toc li.l3, .fa-toc-m li.l3 { padding-left: 12px; }
            .fa-toc-m { display: none; background: #fff; border: 1px solid rgba(23,18,8,0.08); border-radius: 12px; padding: 12px 16px; margin-bottom: 26px; font-family: Inter, sans-serif; }
            .fa-toc-m summary { cursor: pointer; margin: 0; }
            .fa-toc-m ol { margin-top: 10px; }
            .fa-share { display: flex; align-items: center; gap: 8px; }
            .fa-share button { width: 34px; height: 34px; border-radius: 99px; border: 1px solid rgba(23,18,8,0.14); background: #fff; color: ${INK}; display: grid; place-items: center; cursor: pointer; }
            .fa-share button:hover { border-color: ${RED}; color: ${RED}; }
            .fa-cta { background: ${INK}; color: #fff; border-radius: 14px; padding: 20px 20px 18px; font-family: Inter, sans-serif; }
            .fa-cta-t { font-family: 'Clash Display', Georgia, serif; font-weight: 600; font-size: 18px; line-height: 1.25; margin-bottom: 8px; }
            .fa-cta p { margin: 0 0 14px; font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,0.78); }
            .fa-cta-b { display: block; text-align: center; background: ${RED}; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 11px; border-radius: 8px; }
            .fa-cta-s { display: block; text-align: center; font-size: 11.5px; color: rgba(255,255,255,0.55); margin-top: 8px; }
            .fa-inline { margin: 36px 0; }
            .fa-inline .fa-cta { display: grid; gap: 4px; }
            .fa-author { display: flex; gap: 14px; align-items: center; background: #fff; border: 1px solid rgba(23,18,8,0.08); border-radius: 14px; padding: 18px 20px; margin-top: 44px; font-family: Inter, sans-serif; }
            .fa-author p { margin: 2px 0 0; font-size: 13.5px; color: rgba(23,18,8,0.65); line-height: 1.5; }
            .fa-related { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; list-style: none; padding: 0; margin: 0; }
            @media (max-width: 1020px) { .fa-grid { grid-template-columns: minmax(0, 1fr); } .fa-side { display: none; } .fa-toc-m { display: block; } .fa-h1 { font-size: 34px; } .fa-related { grid-template-columns: 1fr; } }
            .fyn-article { font-family: Georgia, serif; font-size: 17.5px; color: rgba(23,18,8,0.86); line-height: 1.78; }
            .fyn-article h2, .fyn-article h3 { scroll-margin-top: 90px; }
            .fyn-article > *:first-child { margin-top: 0; }
            .fyn-article p { margin: 0 0 24px 0; }
            .fyn-article h1, .fyn-article h2 { font-weight: 700; font-size: 24px; color: ${INK}; line-height: 1.3; margin: 36px 0 16px 0; }
            .fyn-article h3 { font-weight: 700; font-size: 20px; color: ${INK}; margin: 30px 0 14px 0; }
            .fyn-article h4, .fyn-article h5, .fyn-article h6 { font-weight: 700; font-size: 17px; color: ${INK}; margin: 26px 0 12px 0; }
            .fyn-article ul, .fyn-article ol { margin: 0 0 24px 0; padding-left: 26px; }
            .fyn-article ul { list-style: disc; } .fyn-article ol { list-style: decimal; }
            .fyn-article li::marker { color: ${RED}; font-weight: 600; }
            .fyn-article figure.diagram { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .fyn-article figure.diagram img { min-width: 720px; }
            @media (min-width: 760px) { .fyn-article figure.diagram img { min-width: 0; } }
            .fyn-article li { margin-bottom: 10px; }
            .fyn-article a { color: ${RED}; text-decoration: underline; }
            .fyn-article strong { color: ${INK}; }
            .fyn-article .answer { margin: 0 0 28px; padding: 18px 20px; border-radius: 14px; background: rgba(196,30,30,0.05); border: 1px solid rgba(196,30,30,0.16); font-size: 17px; line-height: 1.6; color: ${INK}; font-style: normal; }
            .fyn-article .answer strong:first-child { display: block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: ${RED}; margin-bottom: 6px; }
            .fyn-article .table-wrap { overflow-x: auto; margin: 0 0 24px; }
            .fyn-article blockquote { margin: 28px 0; padding: 4px 0 4px 20px; border-left: 3px solid ${RED}; font-style: italic; color: rgba(23,18,8,0.7); }
            .fyn-article img, .fyn-article iframe, .fyn-article video { max-width: 100%; border-radius: 10px; margin: 12px 0 24px; display: block; }
            .fyn-article figure { margin: 0 0 24px 0; }
            .fyn-article figure img { margin: 0 0 8px; border: 1px solid rgba(23,18,8,0.10); background: #fff; }
            .fyn-article figcaption { font-size: 13.5px; line-height: 1.5; color: rgba(23,18,8,0.6); }
            .fyn-article kbd { font-family: "JetBrains Mono", monospace; font-size: 0.85em; padding: 1px 6px; border-radius: 6px; border: 1px solid rgba(23,18,8,0.2); background: #fff; }
            .fyn-article figcaption { font-family: Inter, sans-serif; font-size: 12.5px; color: rgba(23,18,8,0.5); margin-top: 8px; text-align: center; }
            .fyn-article pre { background: rgba(23,18,8,0.05); border-radius: 10px; padding: 16px; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; margin: 0 0 24px 0; }
            .fyn-article code { font-family: 'JetBrains Mono', monospace; font-size: 13.5px; background: rgba(23,18,8,0.06); padding: 2px 5px; border-radius: 4px; }
            .fyn-article pre code { background: none; padding: 0; }
            .fyn-article hr { border: none; border-top: 1px solid rgba(23,18,8,0.12); margin: 36px 0; }
            .fyn-article table { width: 100%; border-collapse: collapse; margin: 0 0 24px 0; font-family: Inter, sans-serif; font-size: 14px; }
            .fyn-article th, .fyn-article td { border: 1px solid rgba(23,18,8,0.12); padding: 10px 12px; text-align: left; }
            .fyn-article th { background: rgba(23,18,8,0.04); font-weight: 600; color: ${INK}; }
          `}</style>
              <div className="fyn-article" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyA }} />
              {bodyB && (
                <>
                  <div className="fa-inline"><CtaCard where="blog-article-inline" /></div>
                  <div className="fyn-article" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyB }} />
                </>
              )}

              <section className="fa-author" aria-label="About the author">
                <span className="fa-av" aria-hidden="true">{initials(author)}</span>
                <div>
                  <b>{author}</b>{post.author_role ? <span className="fa-role">, {post.author_role}</span> : null}
                  <p>FynHelp is an intelligence layer on top of Tally and Zoho Books for Indian CA firms: it reads statements, proves what it read, reconciles to the books and leaves the decisions to people.</p>
                </div>
              </section>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, flexWrap: "wrap", fontFamily: "Inter, sans-serif", fontSize: 13, color: "rgba(23,18,8,0.6)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={13} /> {post.reading_time_minutes} min read</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Eye size={13} /> {post.views.toLocaleString("en-IN")} views</span>
                {(post.tags?.length ?? 0) > 0 && post.tags!.map((t) => <span key={t} style={{ color: GOLD, background: "rgba(139,105,20,0.1)", padding: "2px 8px", borderRadius: 6, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{t}</span>)}
              </div>
            </article>

            <aside className="fa-side" aria-label="Article tools">
              {toc.length > 2 && (
                <nav className="fa-toc" aria-label="On this page">
                  <h2>On this page</h2>
                  <ol>{toc.map((t) => <li key={t.id} className={t.level === 3 ? "l3" : ""}><a href={`#${t.id}`}>{t.text}</a></li>)}</ol>
                </nav>
              )}
              <Share title={post.title} slug={post.slug} />
              <CtaCard where="blog-article-side" />
            </aside>
          </div>

          {related.length > 0 && (
            <section aria-labelledby="related-h" style={{ marginTop: 64 }}>
              <h2 id="related-h" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(23,18,8,0.5)", margin: "0 0 14px" }}>Keep reading</h2>
              <ul className="fa-related">
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


        </div>
      </div>
    </Layout>
  );
}
