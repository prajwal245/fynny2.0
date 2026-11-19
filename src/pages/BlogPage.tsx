import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Search } from "lucide-react";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";
import Layout from "@/components/Layout";
import { listExcerpt, type ListPost } from "@/lib/blog";

const INK = "#171208";
const RED = "#C41E1E";

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const BlogPage = ({ posts }: { posts: ListPost[] }) => {
  // Category chips filter in place; there are no ?category= URLs to index twice.
  const [activeCat, setActiveCat] = useState<string>("All");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => p.category && set.add(p.category));
    return ["All", ...Array.from(set)];
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter((p) => activeCat === "All" || p.category === activeCat)
      .filter((p) => !q || `${p.title} ${p.category ?? ""} ${p.excerpt ?? ""}`.toLowerCase().includes(q));
  }, [posts, activeCat, query]);

  const featured = filtered.find((p) => p.is_featured) ?? filtered[0];
  const rest = filtered.filter((p) => p.id !== featured?.id);

  return (
    <Layout>

      <style>{`
        .bl-wrap { background: #EFE8D8; padding: 64px 0 96px; }
        .bl-eyebrow { font-family: Inter, sans-serif; font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: ${RED}; margin-bottom: 14px; }
        .bl-h1 { font-family: 'Clash Display', Georgia, serif; font-weight: 700; font-size: 46px; line-height: 1.08; letter-spacing: -0.025em; color: ${INK}; margin: 0 0 14px; }
        .bl-sub { font-family: 'Satoshi', Inter, sans-serif; font-size: 16.5px; color: rgba(23,18,8,0.62); max-width: 620px; margin: 0; }
        .bl-chips { display: flex; flex-wrap: wrap; gap: 9px; margin: 18px 0 36px; }
        .bl-search { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid rgba(23,18,8,0.12); border-radius: 12px; padding: 0 14px; margin-top: 30px; max-width: 560px; color: rgba(23,18,8,0.5); }
        .bl-search:focus-within { border-color: ${RED}; }
        .bl-search input { flex: 1; border: 0; outline: none; background: transparent; padding: 13px 0; font-family: Inter, sans-serif; font-size: 15px; color: ${INK}; min-width: 0; }
        .bl-search span { font-family: Inter, sans-serif; font-size: 12.5px; white-space: nowrap; }
        .bl-band { margin-top: 56px; background: ${INK}; color: #fff; border-radius: 18px; padding: 32px 36px; display: flex; gap: 24px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
        .bl-band h2 { font-family: 'Clash Display', Georgia, serif; font-weight: 600; font-size: 24px; margin: 0 0 6px; letter-spacing: -0.02em; }
        .bl-band p { margin: 0; font-family: Inter, sans-serif; font-size: 14.5px; color: rgba(255,255,255,0.72); max-width: 560px; line-height: 1.55; }
        .bl-band a { background: ${RED}; color: #fff; text-decoration: none; font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 9px; }
        .bl-chip { font-family: Inter, sans-serif; font-size: 13px; font-weight: 600; color: rgba(23,18,8,0.7); background: #fff; border: 1px solid rgba(23,18,8,0.12); border-radius: 100px; padding: 8px 17px; cursor: pointer; transition: all .18s ease; }
        .bl-chip:hover { border-color: rgba(196,30,30,0.4); color: ${RED}; }
        .bl-chip.on { background: rgba(196,30,30,0.08); border-color: ${RED}; color: ${RED}; }
        .bl-card { display: block; background: #fff; border: 1px solid rgba(23,18,8,0.08); border-radius: 16px; overflow: hidden; text-decoration: none; transition: transform .25s ease, box-shadow .25s ease; }
        .bl-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(23,18,8,0.09); }
        .bl-cover { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: linear-gradient(135deg, #E6DDC7 0%, #EFE8D8 100%); }
        .bl-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s cubic-bezier(.2,.8,.3,1); }
        .bl-card:hover .bl-cover img { transform: scale(1.04); }
        .bl-cover .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Clash Display', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(23,18,8,0.26); }
        .bl-body { padding: 20px 22px 22px; display: flex; flex-direction: column; gap: 10px; }
        .bl-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .bl-pill { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 100px; background: rgba(196,30,30,0.09); color: ${RED}; font-family: Inter, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
        .bl-dot { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: rgba(23,18,8,0.5); font-variant-numeric: tabular-nums; }
        .bl-title { font-family: 'Clash Display', Georgia, serif; font-weight: 600; font-size: 19px; letter-spacing: -0.02em; color: ${INK}; line-height: 1.26; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .bl-ex { font-family: 'Satoshi', Inter, sans-serif; font-size: 13.8px; color: rgba(23,18,8,0.62); line-height: 1.58; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .bl-read { display: inline-flex; align-items: center; gap: 7px; margin-top: 4px; color: ${RED}; font-family: Inter, sans-serif; font-weight: 700; font-size: 13px; }
        .bl-read .arw { transition: transform .25s ease; }
        .bl-card:hover .bl-read .arw { transform: translateX(4px); }
        .bl-featured { display: grid; grid-template-columns: 1.15fr 1fr; margin-bottom: 34px; }
        .bl-featured .bl-cover { aspect-ratio: auto; height: 100%; min-height: 320px; border-right: 1px solid rgba(23,18,8,0.07); }
        .bl-featured .bl-body { padding: 34px 36px; justify-content: center; gap: 14px; }
        .bl-featured .bl-title { font-size: 30px; line-height: 1.14; -webkit-line-clamp: 3; }
        .bl-featured .bl-ex { font-size: 15px; }
        .bl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
        .bl-empty { font-family: Inter, sans-serif; font-size: 14px; color: rgba(23,18,8,0.5); padding: 40px 0; }
        @media (max-width: 1024px) { .bl-grid { grid-template-columns: repeat(2, 1fr); } .bl-featured { grid-template-columns: 1fr; } .bl-featured .bl-cover { min-height: 0; aspect-ratio: 16/9; border-right: none; } .bl-featured .bl-body { padding: 24px; } .bl-featured .bl-title { font-size: 24px; } }
        @media (max-width: 640px) { .bl-grid { grid-template-columns: 1fr; } .bl-h1 { font-size: 34px; } }
      `}</style>

      <div className="bl-wrap">
        <div className="fyn-container">
          <div className="bl-eyebrow">Blog</div>
          <h1 className="bl-h1">Month-end close, reconciliation and MIS for CA firms</h1>
          <p className="bl-sub">Practical guides for chartered accountants in India: closing clients’ books faster, reconciling bank to Tally, producing MIS clients trust, and keeping GST on schedule.</p>

          <div className="bl-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles: GST, reconciliation, MIS" aria-label="Search articles" />
            <span aria-live="polite">{query || activeCat !== "All" ? `${filtered.length} article${filtered.length === 1 ? "" : "s"}` : ""}</span>
          </div>

          {categories.length > 1 && (
            <div className="bl-chips">
              {categories.map((c) => (
                <button key={c} type="button" className={`bl-chip${activeCat === c ? " on" : ""}`} onClick={() => setActiveCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="bl-empty">No articles in this category yet.</p>
          ) : (
            <>
              {featured && (
                <Link to={`/blog/${featured.slug}`} className="bl-card bl-featured">
                  <div className="bl-cover">
                    {featured.cover_image_url ? (
                      <img src={featured.cover_image_url} alt={featured.title} width={1280} height={720} fetchPriority="high" />
                    ) : (
                      <div className="ph">FynHelp</div>
                    )}
                  </div>
                  <div className="bl-body">
                    <div className="bl-meta">
                      {featured.category && <span className="bl-pill">{featured.category}</span>}
                      <span className="bl-dot">{formatDate(featured.published_at)}</span>
                      {featured.reading_time_minutes ? <span className="bl-dot">{featured.reading_time_minutes} min read</span> : null}
                    </div>
                    <h2 className="bl-title">{featured.title}</h2>
                    <p className="bl-ex">{listExcerpt(featured)}</p>
                    <span className="bl-read">Read article <span className="arw">→</span></span>
                  </div>
                </Link>
              )}

              <div className="bl-grid">
                {rest.map((p) => (
                  <Link key={p.id} to={`/blog/${p.slug}`} className="bl-card">
                    <div className="bl-cover">
                      {p.cover_image_url ? (
                        <img src={p.cover_image_url} alt={p.title} loading="lazy" />
                      ) : (
                        <div className="ph">FynHelp</div>
                      )}
                    </div>
                    <div className="bl-body">
                      <div className="bl-meta">
                        {p.category && <span className="bl-pill">{p.category}</span>}
                        <span className="bl-dot">{formatDate(p.published_at)}</span>
                        {p.reading_time_minutes ? <span className="bl-dot">{p.reading_time_minutes} min read</span> : null}
                      </div>
                      <h3 className="bl-title">{p.title}</h3>
                      <p className="bl-ex">{listExcerpt(p)}</p>
                      <span className="bl-read">Read article <span className="arw">→</span></span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          <section className="bl-band" aria-label="Try FynHelp">
            <div>
              <h2>Close your clients' month-end faster</h2>
              <p>FynHelp reads bank statements and Tally exports, proves what it read, matches bank to books and leaves you only the decisions. Nothing is posted without your approval.</p>
            </div>
            <Link to={SIGNUP_URL} onClick={() => trackCta("start", "blog-index")}>Start free trial</Link>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default BlogPage;
