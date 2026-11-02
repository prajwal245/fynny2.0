import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import SiteShell, { CtaBand, PageHero, Section } from "@/components/site/SiteShell";
import { C } from "@/lib/sitePalette";
import { isExternal, type PressEntry, type PressKind } from "@/lib/press";

/**
 * Media & press, laid out like a newsroom page: Media Assets (logos, images) first, then "In the News" as a
 * four-column grid of outlined cards: outlet logo, headline, and the date with an arrow.
 */
const CSS = `
.pp-assets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:40px; max-width:980px; margin:0 auto; }
.pp-asset { display:block; text-decoration:none; color:${C.ink}; }
.pp-asset-art { display:flex; align-items:center; justify-content:center; aspect-ratio:1.74; border-radius:18px; overflow:hidden; background:#171208; }
.pp-asset-art img { display:block; }
.pp-asset-art.photo img { width:100%; height:100%; object-fit:cover; }
.pp-asset-art.logo img { width:58%; height:auto; }
.pp-asset h3 { font-size:clamp(26px,3vw,32px); font-weight:600; letter-spacing:-.02em; margin:20px 0 6px; }
.pp-asset p { font-size:17px; color:${C.body}; margin:0 0 14px; }
.pp-dl { display:inline-flex; align-items:center; gap:10px; font-size:17px; font-weight:600; color:#A93838; text-decoration:none; }
.pp-dl:hover { gap:14px; }
.pp-dl { transition:gap .2s ease; }
.pp-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin:0 0 30px; }
.pp-chip { font-size:15.5px; font-weight:600; padding:10px 20px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.body}; cursor:pointer; }
.pp-chip:hover { border-color:rgba(169,56,56,.45); color:#A93838; }
.pp-chip[aria-pressed="true"] { background:${C.ink}; border-color:${C.ink}; color:#fff; }
.pp-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:20px; list-style:none; padding:0; margin:0; }
.pp-grid > li { display:flex; }
.pp-card { display:flex; flex-direction:column; width:100%; min-height:300px; padding:26px 24px 22px; background:#fff; border:1px solid ${C.line}; border-radius:8px; text-decoration:none; color:${C.ink};
  transition:border-color .2s ease, box-shadow .25s ease, transform .25s ease; }
.pp-card:hover, .pp-card:focus-visible { border-color:rgba(169,56,56,.5); box-shadow:0 18px 34px -26px rgba(23,18,8,.4); transform:translateY(-3px); outline:none; }
.pp-logo { height:44px; display:flex; align-items:center; margin-bottom:26px; }
.pp-logo img { max-height:40px; max-width:150px; width:auto; height:auto; object-fit:contain; display:block; }
.pp-logo img.pp-inv { filter:invert(1) hue-rotate(180deg); }
.pp-word { font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:22px; letter-spacing:-.01em; line-height:1.1; }
.pp-h { font-size:17.5px; line-height:1.5; font-weight:500; letter-spacing:-.01em; margin:0 0 20px; }
.pp-foot { margin-top:auto; display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:15px; color:${C.muted}; }
.pp-card:hover .pp-foot svg { color:#A93838; transform:translateX(3px); }
.pp-foot svg { transition:transform .2s ease, color .2s ease; color:${C.ink}; flex:0 0 auto; }
.pp-tag { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#A93838; margin-bottom:10px; }
.pp-more { display:flex; justify-content:center; margin-top:34px; }
.pp-btn { font-size:16px; font-weight:600; padding:13px 28px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.ink}; cursor:pointer; }
.pp-btn:hover { border-color:#A93838; color:#A93838; }
.pp-contact { text-align:center; font-size:17px; line-height:1.7; color:${C.body}; max-width:680px; margin:0 auto; }
.pp-contact a { color:#A93838; font-weight:600; }
@media (max-width:1100px){ .pp-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:820px){ .pp-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); } .pp-assets{ gap:28px; } }
@media (max-width:620px){ .pp-assets{ grid-template-columns:1fr; } .pp-grid{ grid-template-columns:1fr; } .pp-card{ min-height:0; } }
@media (prefers-reduced-motion: reduce){ .pp-card{ transition:none; } .pp-dl{ transition:none; } }
`;

const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const PAGE = 12;

function Logo({ p }: { p: PressEntry }) {
  return (
    <span className="pp-logo">
      {p.logo ? <img src={p.logo} alt={p.outlet} loading="lazy" className={p.logoInvert ? "pp-inv" : undefined} /> : <span className="pp-word">{p.outlet}</span>}
    </span>
  );
}

function Card({ p }: { p: PressEntry }) {
  const inner = (
    <>
      <Logo p={p} />
      {p.kind === "release" && <span className="pp-tag">Press release</span>}
      <h3 className="pp-h">{p.headline}</h3>
      <span className="pp-foot">
        <time dateTime={p.publishedOn}>{longDate(p.publishedOn)}</time>
        <ArrowRight size={20} aria-hidden="true" />
      </span>
    </>
  );
  return isExternal(p.url) ? (
    <a className="pp-card" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.outlet}: ${p.headline} (opens in a new tab)`}>{inner}</a>
  ) : (
    <Link className="pp-card" to={p.url}>{inner}</Link>
  );
}

export default function PressPage({ items }: { items: PressEntry[] }) {
  const [kind, setKind] = useState<"all" | PressKind>("all");
  const [shown, setShown] = useState(PAGE);
  const hasRelease = items.some((p) => p.kind === "release");
  const list = useMemo(() => (kind === "all" ? items : items.filter((p) => p.kind === kind)), [items, kind]);
  const outlets = new Set(items.filter((p) => p.kind === "news").map((p) => p.outlet)).size;

  return (
    <SiteShell>
      <style>{CSS}</style>
      <PageHero
        kicker="Press & media"
        title="FynHelp in the"
        italic="news"
        sub={`Coverage of FynHelp, the month-end close software for CA firms in India${outlets ? `, from ${outlets} outlets` : ""}, with logos and images for the media.`}
        center
      />

      <Section id="media-assets" title="Media" italic="assets" center>
        <div className="pp-assets">
          <a className="pp-asset" href="/press/fynhelp-logos.zip" download>
            <div className="pp-asset-art logo"><img src="/press/fynhelp-logo-cream.png" alt="FynHelp logo" width={519} height={99} /></div>
            <h3>Logos</h3>
            <p>Please use our official FynHelp logos, unaltered.</p>
            <span className="pp-dl">Download logos <ArrowRight size={20} aria-hidden="true" /></span>
          </a>
          <a className="pp-asset" href="/press/fynhelp-product-images.zip" download>
            <div className="pp-asset-art photo"><img src="/launch/portfolio.jpg" alt="The FynHelp portfolio view" loading="lazy" /></div>
            <h3>Images</h3>
            <p>Product screenshots, high resolution.</p>
            <span className="pp-dl">Download images <ArrowRight size={20} aria-hidden="true" /></span>
          </a>
        </div>
      </Section>

      <Section id="coverage" title="FynHelp:" italic="in the news" center>
        {hasRelease && (
          <div className="pp-chips" role="group" aria-label="Filter by type">
            <button className="pp-chip" aria-pressed={kind === "all"} onClick={() => { setKind("all"); setShown(PAGE); }}>All</button>
            <button className="pp-chip" aria-pressed={kind === "news"} onClick={() => { setKind("news"); setShown(PAGE); }}>In the news</button>
            <button className="pp-chip" aria-pressed={kind === "release"} onClick={() => { setKind("release"); setShown(PAGE); }}>Press releases</button>
          </div>
        )}
        {list.length === 0 ? (
          <p className="pp-contact">Nothing here yet.</p>
        ) : (
          <ul className="pp-grid" style={{ marginTop: 36 }}>
            {list.slice(0, shown).map((p) => (
              <li key={p.id}><Card p={p} /></li>
            ))}
          </ul>
        )}
        {list.length > shown && (
          <div className="pp-more"><button className="pp-btn" onClick={() => setShown((n) => n + PAGE)}>Show more</button></div>
        )}
      </Section>

      <Section id="contact" alt>
        <p className="pp-contact">
          <b>About FynHelp.</b> FynHelp is month-end close software for chartered accountant (CA) firms in India, based in Bengaluru. It collects client documents, reconciles bank statements to Tally or Zoho books, and drafts a source-traceable MIS that a partner signs off.
          <br />
          For interviews, quotes or a product walkthrough, write to <a href="mailto:support@fynhelp.com?subject=Media%20enquiry">support@fynhelp.com</a>.
        </p>
      </Section>

      <CtaBand title="See what the coverage" italic="is about" lead="Run a month-end close on your own client, free for the first 14 days." location="press" />
    </SiteShell>
  );
}
