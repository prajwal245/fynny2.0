import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { PRESS, PRESS_HEADLINE, PRESS_POST_SLUG, pressLogo } from "@/content/press";
import { C } from "@/lib/sitePalette";

const CSS = `
.fi-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:14px; margin-top:36px; }
.fi-card { display:flex; flex-direction:column; justify-content:space-between; gap:18px; min-height:132px; padding:18px 18px 16px;
  background:#fff; border:1px solid rgba(23,18,8,.08); border-radius:16px; text-decoration:none; color:${C.ink};
  transition:border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
.fi-card:hover, .fi-card:focus-visible { border-color:rgba(169,56,56,.45); transform:translateY(-2px); box-shadow:0 14px 28px -22px rgba(23,18,8,.4); outline:none; }
.fi-logo { height:34px; display:flex; align-items:center; }
.fi-logo img { max-height:34px; max-width:150px; width:auto; object-fit:contain; display:block; }
.fi-word { font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:19px; letter-spacing:-.01em; line-height:1.1; }
.fi-read { display:inline-flex; align-items:center; gap:4px; font-size:12.5px; font-weight:600; color:${C.muted}; }
.fi-card:hover .fi-read { color:#A93838; }
.fi-head { font-size:14px; line-height:1.55; color:${C.body}; max-width:62ch; margin-top:14px; }
.fi-more { display:inline-block; margin-top:22px; font-size:14px; font-weight:600; color:#A93838; }
@media (prefers-reduced-motion: reduce){ .fi-card{ transition:none; } }
`;

export default function FeaturedIn() {
  return (
    <section className="fh-sec" id="featured-in" aria-labelledby="featured-in-title" style={{ background: C.pageAlt }}>
      <style>{CSS}</style>
      <div className="fh-wrap">
        <span className="fh-kicker">In the press</span>
        <h2 className="fh-h2" id="featured-in-title">
          Featured <span className="ital">in</span>
        </h2>
        <p className="fi-head">
          &ldquo;{PRESS_HEADLINE}&rdquo; was published by {PRESS.length} outlets.
        </p>
        <ul className="fi-grid" style={{ listStyle: "none", padding: 0 }}>
          {PRESS.map((p) => {
            const logo = pressLogo(p.id);
            return (
              <li key={p.id} style={{ display: "contents" }}>
                <a
                  className="fi-card"
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${p.outlet}: read the FynHelp launch article (opens in a new tab)`}
                >
                  <span className="fi-logo">
                    {logo ? <img src={logo} alt={p.outlet} loading="lazy" /> : <span className="fi-word">{p.outlet}</span>}
                  </span>
                  <span className="fi-read">
                    Read the article <ArrowUpRight size={14} aria-hidden="true" />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        <Link to={`/blog/${PRESS_POST_SLUG}`} className="fi-more">
          See all the coverage on our blog &rarr;
        </Link>
      </div>
    </section>
  );
}
