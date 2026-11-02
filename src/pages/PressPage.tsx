import { useMemo, useState } from "react";
import { ArrowUpRight, Download, Mail } from "lucide-react";
import { Link } from "@/lib/router-compat";
import SiteShell, { CtaBand, PageHero, Reveal, Section } from "@/components/site/SiteShell";
import { C } from "@/lib/sitePalette";
import { isExternal, type PressEntry, type PressKind } from "@/lib/press";

/** Media & press: filter chips, a lead story, a grid of articles, media contact and brand assets. */
const CSS = `
.pp-chips { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 30px; }
.pp-chip { font-size:15px; font-weight:600; padding:10px 20px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.body}; cursor:pointer; transition:all .2s ease; }
.pp-chip:hover { border-color:rgba(169,56,56,.45); color:#A93838; }
.pp-chip[aria-pressed="true"] { background:${C.ink}; border-color:${C.ink}; color:#fff; }
.pp-lead { display:grid; grid-template-columns:1.05fr 1fr; background:#fff; border:1px solid ${C.line}; border-radius:24px; overflow:hidden; text-decoration:none; color:${C.ink}; margin-bottom:22px;
  box-shadow:0 1px 2px rgba(23,18,8,.04), 0 24px 44px -34px rgba(23,18,8,.35); transition:transform .3s ease, box-shadow .3s ease; }
.pp-lead:hover, .pp-lead:focus-visible { transform:translateY(-3px); box-shadow:0 2px 4px rgba(23,18,8,.05), 0 32px 52px -32px rgba(169,56,56,.35); outline:none; }
.pp-lead-art { display:flex; align-items:center; justify-content:center; min-height:260px; padding:32px; background:linear-gradient(135deg,#F7F1E6 0%,#EFE6D6 100%); }
.pp-lead-body { padding:36px 38px; display:flex; flex-direction:column; justify-content:center; gap:14px; }
.pp-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }
.pp-card { display:flex; flex-direction:column; background:#fff; border:1px solid ${C.line}; border-radius:20px; overflow:hidden; text-decoration:none; color:${C.ink};
  box-shadow:0 1px 2px rgba(23,18,8,.04); transition:transform .3s ease, box-shadow .3s ease, border-color .2s ease; }
.pp-card:hover, .pp-card:focus-visible { transform:translateY(-4px); border-color:rgba(169,56,56,.35); box-shadow:0 26px 40px -30px rgba(169,56,56,.4); outline:none; }
.pp-art { display:flex; align-items:center; justify-content:center; height:132px; padding:20px; background:linear-gradient(135deg,#F7F1E6 0%,#EFE6D6 100%); }
.pp-art img { max-height:52px; max-width:70%; width:auto; height:auto; object-fit:contain; display:block; }
.pp-art img.pp-inv { filter:invert(1) hue-rotate(180deg); }
.pp-word { font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:24px; letter-spacing:-.01em; text-align:center; line-height:1.15; }
.pp-body { padding:22px 24px 24px; display:flex; flex-direction:column; gap:12px; flex:1; }
.pp-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:13.5px; color:${C.muted}; font-weight:500; }
.pp-tag { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:4px 10px; border-radius:999px; background:rgba(169,56,56,.09); color:#A93838; }
.pp-h { font-size:19px; line-height:1.32; font-weight:600; letter-spacing:-.02em; margin:0; }
.pp-lead .pp-h { font-size:clamp(24px,3vw,32px); line-height:1.2; }
.pp-sum { font-size:15.5px; line-height:1.6; color:${C.body}; margin:0; }
.pp-read { margin-top:auto; display:inline-flex; align-items:center; gap:6px; font-size:15px; font-weight:600; color:#A93838; }
.pp-more { display:flex; justify-content:center; margin-top:34px; }
.pp-btn { font-size:15.5px; font-weight:600; padding:13px 26px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.ink}; cursor:pointer; }
.pp-btn:hover { border-color:#A93838; color:#A93838; }
.pp-two { display:grid; grid-template-columns:1.2fr 1fr; gap:22px; }
.pp-box { background:#fff; border:1px solid ${C.line}; border-radius:22px; padding:30px 32px; }
.pp-box h3 { font-size:22px; letter-spacing:-.02em; margin:0 0 10px; }
.pp-box p { font-size:16px; line-height:1.65; color:${C.body}; margin:0 0 12px; }
.pp-facts { display:grid; gap:0; margin:16px 0 0; }
.pp-facts div { display:flex; justify-content:space-between; gap:16px; padding:11px 0; border-top:1px solid ${C.lineSoft}; font-size:15.5px; }
.pp-facts dt { color:${C.muted}; } .pp-facts dd { margin:0; font-weight:600; text-align:right; }
.pp-assets { display:flex; flex-wrap:wrap; gap:12px; margin-top:14px; }
.pp-asset { display:inline-flex; align-items:center; gap:8px; font-size:15px; font-weight:600; padding:11px 18px; border-radius:12px; border:1px solid ${C.line}; background:${C.page}; color:${C.ink}; text-decoration:none; }
.pp-asset:hover { border-color:#A93838; color:#A93838; }
@media (max-width:980px){ .pp-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); } .pp-two{ grid-template-columns:1fr; } }
@media (max-width:720px){ .pp-lead{ grid-template-columns:1fr; } .pp-lead-art{ min-height:160px; } .pp-lead-body{ padding:24px 22px; } }
@media (max-width:560px){ .pp-grid{ grid-template-columns:1fr; } .pp-box{ padding:24px 22px; } }
@media (prefers-reduced-motion: reduce){ .pp-card,.pp-lead{ transition:none; } }
`;

const date = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const PAGE = 9;

function Art({ p }: { p: PressEntry }) {
  return p.logo ? <img src={p.logo} alt={p.outlet} loading="lazy" className={p.logoInvert ? "pp-inv" : undefined} /> : <span className="pp-word">{p.outlet}</span>;
}

function LinkOut({ p, className, children }: { p: PressEntry; className: string; children: React.ReactNode }) {
  const ext = isExternal(p.url);
  return ext ? (
    <a className={className} href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`${p.outlet}: ${p.headline} (opens in a new tab)`}>{children}</a>
  ) : (
    <Link className={className} to={p.url}>{children}</Link>
  );
}

export default function PressPage({ items }: { items: PressEntry[] }) {
  const [kind, setKind] = useState<"all" | PressKind>("all");
  const [shown, setShown] = useState(PAGE);
  const hasRelease = items.some((p) => p.kind === "release");
  const list = useMemo(() => (kind === "all" ? items : items.filter((p) => p.kind === kind)), [items, kind]);
  const [lead, ...rest] = list;
  const visible = rest.slice(0, shown);
  const outlets = new Set(items.filter((p) => p.kind === "news").map((p) => p.outlet)).size;

  return (
    <SiteShell>
      <style>{CSS}</style>
      <PageHero
        kicker="Press & media"
        title="FynHelp in the"
        italic="news"
        sub={`Coverage of FynHelp, the month-end close software for CA firms in India${outlets ? `, from ${outlets} outlets` : ""}. Press releases, media contact and brand assets are below.`}
      />

      <Section id="coverage">
        <div className="pp-chips" role="group" aria-label="Filter by type">
          <button className="pp-chip" aria-pressed={kind === "all"} onClick={() => { setKind("all"); setShown(PAGE); }}>All</button>
          <button className="pp-chip" aria-pressed={kind === "news"} onClick={() => { setKind("news"); setShown(PAGE); }}>In the news</button>
          {hasRelease && <button className="pp-chip" aria-pressed={kind === "release"} onClick={() => { setKind("release"); setShown(PAGE); }}>Press releases</button>}
        </div>

        {lead ? (
          <Reveal>
            <LinkOut p={lead} className="pp-lead">
              <div className="pp-lead-art"><div style={{ maxWidth: 260 }}><Art p={lead} /></div></div>
              <div className="pp-lead-body">
                <div className="pp-meta">
                  <span className="pp-tag">{lead.kind === "release" ? "Press release" : "In the news"}</span>
                  <span>{lead.outlet}</span><span aria-hidden="true">·</span><time dateTime={lead.publishedOn}>{date(lead.publishedOn)}</time>
                </div>
                <h2 className="pp-h">{lead.headline}</h2>
                {lead.summary && <p className="pp-sum">{lead.summary}</p>}
                <span className="pp-read">Read the article <ArrowUpRight size={16} aria-hidden="true" /></span>
              </div>
            </LinkOut>
          </Reveal>
        ) : (
          <p className="fh-lead">Nothing here yet.</p>
        )}

        {visible.length > 0 && (
          <ul className="pp-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {visible.map((p) => (
              <li key={p.id} style={{ display: "flex" }}>
                <LinkOut p={p} className="pp-card">
                  <div className="pp-art"><Art p={p} /></div>
                  <div className="pp-body">
                    <div className="pp-meta">
                      {p.kind === "release" && <span className="pp-tag">Press release</span>}
                      <span>{p.outlet}</span><span aria-hidden="true">·</span><time dateTime={p.publishedOn}>{date(p.publishedOn)}</time>
                    </div>
                    <h3 className="pp-h">{p.headline}</h3>
                    {p.summary && <p className="pp-sum">{p.summary}</p>}
                    <span className="pp-read">Read the article <ArrowUpRight size={16} aria-hidden="true" /></span>
                  </div>
                </LinkOut>
              </li>
            ))}
          </ul>
        )}
        {rest.length > shown && (
          <div className="pp-more"><button className="pp-btn" onClick={() => setShown((n) => n + PAGE)}>Show more</button></div>
        )}
      </Section>

      <Section id="media-kit" kicker="For journalists" title="Media contact" italic="and brand assets" alt>
        <div className="pp-two">
          <div className="pp-box">
            <h3>About FynHelp</h3>
            <p>FynHelp is month-end close software for chartered accountant (CA) firms in India. It collects client documents, reconciles bank statements to Tally or Zoho books, and drafts a source-traceable MIS that a partner signs off.</p>
            <dl className="pp-facts">
              <div><dt>Product</dt><dd>Four agents: Extract, Recon, Narrate, Chaser</dd></div>
              <div><dt>Works with</dt><dd>Tally and Zoho Books</dd></div>
              <div><dt>Built for</dt><dd>CA firms in India</dd></div>
              <div><dt>Based in</dt><dd>Bengaluru, India</dd></div>
              <div><dt>Website</dt><dd>fynhelp.com</dd></div>
            </dl>
          </div>
          <div className="pp-box">
            <h3>Media enquiries</h3>
            <p>For interviews, quotes or a product walkthrough, write to us and a founder will reply.</p>
            <a className="pp-asset" href="mailto:support@fynhelp.com?subject=Media%20enquiry"><Mail size={18} aria-hidden="true" /> support@fynhelp.com</a>
            <h3 style={{ marginTop: 26 }}>Brand assets</h3>
            <p>Logos for use alongside coverage of FynHelp. Please use them unaltered.</p>
            <div className="pp-assets">
              <a className="pp-asset" href="/press/fynhelp-logo-red.png" download><Download size={18} aria-hidden="true" /> Logo, for light backgrounds</a>
              <a className="pp-asset" href="/press/fynhelp-logo-cream.png" download><Download size={18} aria-hidden="true" /> Logo, for dark backgrounds</a>
              <a className="pp-asset" href="/press/fynhelp-icon-red.png" download><Download size={18} aria-hidden="true" /> Icon</a>
            </div>
          </div>
        </div>
      </Section>

      <CtaBand title="See what the coverage" italic="is about" lead="Run a month-end close on your own client, free for the first 14 days." location="press" />
    </SiteShell>
  );
}
