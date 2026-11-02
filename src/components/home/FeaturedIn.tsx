import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { isExternal, withLogos, type PressEntry } from "@/lib/press";
import { C } from "@/lib/sitePalette";

/**
 * "Featured in": an endless, slow rail of outlet logos, each linking to the
 * outlet's own article. Pauses on hover and keyboard focus, fades at the
 * edges, and becomes a plain wrapped grid for people who prefer no motion.
 */
const CSS = `
.fi-rail { margin-top:44px; overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent); }
.fi-track { display:flex; gap:18px; width:max-content; padding:6px 0 10px; animation:fi-scroll 44s linear infinite; }
.fi-rail:hover .fi-track, .fi-rail:focus-within .fi-track { animation-play-state:paused; }
@keyframes fi-scroll { to { transform:translateX(calc(-50% - 9px)); } }
.fi-card { flex:0 0 auto; width:248px; height:148px; display:flex; flex-direction:column; justify-content:space-between;
  padding:20px 22px 16px; background:#fff; border:1px solid rgba(23,18,8,.07); border-radius:18px; text-decoration:none; color:${C.ink};
  box-shadow:0 1px 2px rgba(23,18,8,.04), 0 18px 34px -26px rgba(23,18,8,.28);
  transition:transform .35s cubic-bezier(.2,.7,.2,1), border-color .25s ease, box-shadow .35s ease; }
.fi-card:hover, .fi-card:focus-visible { transform:translateY(-4px); border-color:rgba(169,56,56,.4); box-shadow:0 2px 4px rgba(23,18,8,.05), 0 26px 40px -24px rgba(169,56,56,.38); outline:none; }
.fi-card:focus-visible { outline:2px solid #A93838; outline-offset:3px; }
.fi-logo { height:48px; display:flex; align-items:center; }
.fi-logo img { max-height:44px; max-width:168px; width:auto; height:auto; object-fit:contain; display:block; }
.fi-logo img.fi-light { filter:invert(1) hue-rotate(180deg); }
.fi-word { font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:21px; letter-spacing:-.01em; line-height:1.1; }
.fi-read { display:inline-flex; align-items:center; gap:5px; font-size:14px; font-weight:600; color:${C.muted}; transition:color .25s ease, gap .25s ease; }
.fi-card:hover .fi-read, .fi-card:focus-visible .fi-read { color:#A93838; gap:8px; }
.fi-head { font-size:16.5px; line-height:1.6; color:${C.body}; max-width:62ch; margin-top:14px; }
.fi-more { display:inline-block; margin-top:20px; font-size:15.5px; font-weight:600; color:#A93838; }
@media (max-width:640px){ .fi-card{ width:210px; height:136px; padding:16px 18px 14px; } .fi-track{ gap:14px; } }
@media (prefers-reduced-motion: reduce){
  .fi-rail { -webkit-mask-image:none; mask-image:none; }
  .fi-track { animation:none; width:auto; flex-wrap:wrap; }
  .fi-dup { display:none; }
  .fi-card { transition:none; }
}
`;

export default function FeaturedIn({ items }: { items: PressEntry[] }) {
  const logos = withLogos(items);
  // Nothing to show: no empty section.
  if (logos.length === 0) return null;
  // Two identical halves make the loop seamless; the second half is hidden from assistive tech and the tab order.
  const halves = [0, 1];
  return (
    <section className="fh-sec" id="featured-in" aria-labelledby="featured-in-title" style={{ background: C.pageAlt }}>
      <style>{CSS}</style>
      <div className="fh-wrap">
        <span className="fh-kicker">In the press</span>
        <h2 className="fh-h2" id="featured-in-title">
          Featured <span className="ital">in</span>
        </h2>
        <p className="fi-head">
          FynHelp&rsquo;s launch has been covered by {items.filter((p) => p.kind === "news").length} news outlets. Tap a logo to read the article.
        </p>
      </div>
      <div className="fi-rail">
        <div className="fi-track">
          {halves.map((h) =>
            logos.map((p) => {
              const logo = p.logo;
              const dup = h === 1;
              return (
                <a
                  key={`${h}-${p.id}`}
                  className={`fi-card${dup ? " fi-dup" : ""}`}
                  href={p.url}
                  target={isExternal(p.url) ? "_blank" : undefined}
                  rel={isExternal(p.url) ? "noopener noreferrer" : undefined}
                  aria-label={`${p.outlet}: ${p.headline} (opens in a new tab)`}
                  aria-hidden={dup || undefined}
                  tabIndex={dup ? -1 : undefined}
                >
                  <span className="fi-logo">
                    {logo ? (
                      <img src={logo} alt={dup ? "" : p.outlet} loading="lazy" className={p.logoInvert ? "fi-light" : undefined} />
                    ) : (
                      <span className="fi-word">{p.outlet}</span>
                    )}
                  </span>
                  <span className="fi-read">
                    Read the article <ArrowUpRight size={14} aria-hidden="true" />
                  </span>
                </a>
              );
            }),
          )}
        </div>
      </div>
      <div className="fh-wrap">
        <Link to="/press" className="fi-more">
          Press &amp; media: all {items.length} articles &rarr;
        </Link>
      </div>
    </section>
  );
}
