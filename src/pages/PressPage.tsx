import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import SiteShell, { CtaBand, Section } from "@/components/site/SiteShell";
import { C } from "@/lib/sitePalette";
import { isExternal, type PressEntry, type PressKind } from "@/lib/press";

/**
 * Media & press, laid out like a newsroom page: Media Assets (logos, images) first, then "In the News" as a
 * four-column grid of outlined cards: outlet logo, headline, and the date with an arrow.
 */
const CSS = `
.pp-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin:0 0 30px; }
.pp-chip { font-size:15.5px; font-weight:600; padding:10px 20px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.body}; cursor:pointer; }
.pp-chip:hover { border-color:rgba(169,56,56,.45); color:#A93838; }
.pp-chip[aria-pressed="true"] { background:${C.ink}; border-color:${C.ink}; color:#fff; }
.pp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:22px; list-style:none; padding:0; margin:0; }
.pp-grid > li { display:flex; }
.pp-card { display:flex; flex-direction:column; width:100%; padding:30px 28px 24px; background:#fff; border:1px solid ${C.line}; border-radius:12px; color:${C.ink};
  transition:border-color .2s ease, box-shadow .25s ease; }
.pp-card:hover { border-color:rgba(169,56,56,.4); box-shadow:0 18px 34px -26px rgba(23,18,8,.4); }
.pp-h { font-size:clamp(20px,2.2vw,23px); line-height:1.4; font-weight:600; letter-spacing:-.015em; margin:0 0 22px; }
.pp-by { font-size:12.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${C.muted}; margin:0 0 12px; }
.pp-outlets { display:flex; flex-wrap:wrap; gap:10px; list-style:none; padding:0; margin:0 0 24px; }
.pp-pill { display:inline-flex; align-items:center; gap:10px; min-height:48px; padding:8px 16px 8px 12px; border-radius:999px; background:${C.page}; border:1px solid ${C.line}; color:${C.ink}; text-decoration:none; font-size:15.5px; font-weight:600;
  transition:border-color .2s ease, color .2s ease; }
.pp-pill:hover, .pp-pill:focus-visible { border-color:#A93838; color:#A93838; outline:none; }
.pp-pill img { max-height:24px; max-width:84px; width:auto; height:auto; object-fit:contain; display:block; }
.pp-pill img.pp-inv { filter:invert(1) hue-rotate(180deg); }
.pp-foot { margin-top:auto; display:flex; align-items:center; gap:10px; font-size:15px; color:${C.muted}; }
.pp-tag { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#A93838; margin-bottom:10px; }
.pp-more { display:flex; justify-content:center; margin-top:34px; }
.pp-btn { font-size:16px; font-weight:600; padding:13px 28px; border-radius:999px; background:#fff; border:1px solid ${C.line}; color:${C.ink}; cursor:pointer; }
.pp-btn:hover { border-color:#A93838; color:#A93838; }
.pp-contact { text-align:center; font-size:17px; line-height:1.7; color:${C.body}; max-width:680px; margin:0 auto; }
.pp-contact a { color:#A93838; font-weight:600; }
@media (max-width:560px){ .pp-card{ padding:24px 20px 20px; } }
@media (prefers-reduced-motion: reduce){ .pp-card,.pp-pill{ transition:none; } }
`;

const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const PAGE = 12;

/** One headline, once: every outlet that ran it is a link underneath, so the same title is never repeated. */
interface Story {
  key: string;
  headline: string;
  kind: PressKind;
  publishedOn: string;
  outlets: PressEntry[];
}

function groupStories(items: PressEntry[]): Story[] {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const map = new Map<string, Story>();
  for (const p of items) {
    const key = `${p.kind}:${norm(p.headline)}`;
    const g = map.get(key);
    if (g) {
      g.outlets.push(p);
      if (p.publishedOn > g.publishedOn) g.publishedOn = p.publishedOn;
    } else {
      map.set(key, { key, headline: p.headline, kind: p.kind, publishedOn: p.publishedOn, outlets: [p] });
    }
  }
  return [...map.values()].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
}

function OutletLink({ p }: { p: PressEntry }) {
  const inner = (
    <>
      {p.logo ? <img src={p.logo} alt="" loading="lazy" className={p.logoInvert ? "pp-inv" : undefined} /> : null}
      <span>{p.outlet}</span>
      {isExternal(p.url) ? <ArrowUpRight size={16} aria-hidden="true" /> : null}
    </>
  );
  const label = `${p.outlet}: ${p.headline}${isExternal(p.url) ? " (opens in a new tab)" : ""}`;
  return isExternal(p.url) ? (
    <a className="pp-pill" href={p.url} target="_blank" rel="noopener noreferrer" aria-label={label}>{inner}</a>
  ) : (
    <Link className="pp-pill" to={p.url} aria-label={label}>{inner}</Link>
  );
}

function StoryCard({ s }: { s: Story }) {
  return (
    <article className="pp-card">
      {s.kind === "release" && <span className="pp-tag">Press release</span>}
      <h3 className="pp-h">{s.headline}</h3>
      <p className="pp-by">{s.outlets.length > 1 ? `Read it on ${s.outlets.length} outlets` : "Read the article"}</p>
      <ul className="pp-outlets">
        {s.outlets.map((p) => (
          <li key={p.id}><OutletLink p={p} /></li>
        ))}
      </ul>
      <span className="pp-foot">
        <time dateTime={s.publishedOn}>{longDate(s.publishedOn)}</time>
      </span>
    </article>
  );
}

export default function PressPage({ items }: { items: PressEntry[] }) {
  const [kind, setKind] = useState<"all" | PressKind>("all");
  const [shown, setShown] = useState(PAGE);
  const hasRelease = items.some((p) => p.kind === "release");
  const stories = useMemo(() => groupStories(kind === "all" ? items : items.filter((p) => p.kind === kind)), [items, kind]);

  return (
    <SiteShell>
      <style>{CSS}</style>
      {/* The page's one heading, for search engines and screen readers. */}
      <h1 style={{ position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
        FynHelp press and media: coverage in the news
      </h1>

      <Section id="coverage" title="FynHelp:" italic="in the news" center>
        {hasRelease && (
          <div className="pp-chips" role="group" aria-label="Filter by type">
            <button className="pp-chip" aria-pressed={kind === "all"} onClick={() => { setKind("all"); setShown(PAGE); }}>All</button>
            <button className="pp-chip" aria-pressed={kind === "news"} onClick={() => { setKind("news"); setShown(PAGE); }}>In the news</button>
            <button className="pp-chip" aria-pressed={kind === "release"} onClick={() => { setKind("release"); setShown(PAGE); }}>Press releases</button>
          </div>
        )}
        {stories.length === 0 ? (
          <p className="pp-contact">Nothing here yet.</p>
        ) : (
          <ul className="pp-grid" style={{ marginTop: 36, textAlign: "left" }}>
            {stories.slice(0, shown).map((st) => (
              <li key={st.key}><StoryCard s={st} /></li>
            ))}
          </ul>
        )}
        {stories.length > shown && (
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
