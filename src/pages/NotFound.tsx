/**
 * 404: answered with a real 404 status by the server, kept out of search,
 * and one click from the pages people usually want.
 */
import { Link } from "@/lib/router-compat";
import SiteShell from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";

const PLACES: { to: string; label: string; note: string }[] = [
  { to: "/pipeline", label: "How FynHelp works", note: "Month-end close for CA firms, step by step" },
  { to: "/agents/recon", label: "Bank reconciliation", note: "Bank to Tally or Zoho books, exceptions only" },
  { to: "/agents/narrate", label: "MIS reports", note: "Source-traceable MIS with partner sign-off" },
  { to: "/pricing", label: "Pricing", note: "Per client entity, unlimited users" },
  { to: "/blog", label: "Blog", note: "Guides for CA practices" },
  { to: "/contact", label: "Contact", note: "A person replies within one working day" },
];

const NotFound = () => (
  <SiteShell>
    {/* React hoists these into <head>; the 404 status already keeps it out of search. */}
    <title>Page not found — FynHelp</title>
    <meta name="robots" content="noindex" />
    <section className="fh-wrap" style={{ padding: "72px 22px 96px", maxWidth: 880 }}>
      <span className="fh-kicker">Error 404</span>
      <h1 style={{ fontSize: "clamp(32px,5vw,48px)", letterSpacing: "-0.035em", margin: "14px 0 0" }}>
        This page doesn&rsquo;t exist
      </h1>
      <p className="fh-lead" style={{ marginTop: 14 }}>
        The link may be old or mistyped. These are the pages people usually look for:
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "28px 0 0", display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))" }}>
        {PLACES.map((p) => (
          <li key={p.to}>
            <Link
              to={p.to}
              style={{ display: "block", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 16px", textDecoration: "none", color: C.ink }}
            >
              <span style={{ display: "block", fontWeight: 600, fontSize: 15.5 }}>{p.label}</span>
              <span style={{ display: "block", fontSize: 13.5, color: C.body, marginTop: 3 }}>{p.note}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 30 }}>
        <Link to="/" className="fh-btn fh-btn-ghost">Go to the home page</Link>
        <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "404")}>
          {CTA_START}
        </Link>
      </div>
    </section>
  </SiteShell>
);

export default NotFound;
