import { ReactNode, useEffect } from "react";
import { COMPANY } from "@/content/legal/company";
import { openCookieSettings } from "@/lib/consent";
import { Link } from "@/lib/router-compat";
import FynLogo from "@/components/FynLogo";
import Navbar from "@/components/Navbar";
import { C, SITE_STYLES } from "./siteTheme";
import { FOOTER_COLUMNS, FOOTER_TAGLINE } from "./footerLinks";
import { CTA_DEMO, CTA_NOTE, CTA_START, SIGNUP_URL, trackCta } from "./cta";
import { DemoLink } from "./BookDemo";

export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <div className="fh-rv" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".fh-rv"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (e) => e.isIntersecting && e.target.classList.add("in"),
        ),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

const FOOT_STYLES = `
.sf { background:${C.inkDeep}; color:rgba(247,241,230,.62); font-family:'Instrument Sans','Inter',system-ui,sans-serif; }
.sf-wrap { max-width:1200px; margin:0 auto; padding:0 22px; }
.sf-cols { display:grid; grid-template-columns:1.9fr repeat(5, minmax(0,1fr)); gap:32px; padding:64px 0 48px; }
.sf-cols h4 { color:${C.onDark}; font-size:13px; font-weight:600; margin:0 0 14px; letter-spacing:0; text-transform:none; }
.sf-cols .sf-cookie { display:block; background:none; border:0; padding:5px 0; font:inherit; font-size:14px; color:rgba(247,241,230,.62); cursor:pointer; text-align:left; }
.sf-cols .sf-cookie:hover { color:#F7F1E6; }
.sf-cols nav a { display:block; color:rgba(247,241,230,.62); text-decoration:none; font-size:14px; padding:5px 0; transition:color .15s; }
.sf-cols nav a:hover { color:${C.onDark}; }
.sf-about { font-size:14px; line-height:1.6; max-width:32ch; margin:14px 0 0; }
.sf-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
.sf-actions a { display:inline-flex; align-items:center; height:38px; padding:0 16px; border-radius:999px; font-size:13.5px; font-weight:600; text-decoration:none; border:1px solid rgba(247,241,230,.26); color:${C.onDark}; transition:background .15s, border-color .15s; }
.sf-actions a:hover { border-color:${C.onDark}; }
.sf-actions a.sf-primary { background:${C.coral}; border-color:${C.coral}; color:#2A0F06; }
.sf-actions a.sf-primary:hover { background:#f07549; border-color:#f07549; }
.sf-mail { display:block; margin-top:16px; color:${C.onDark}; font-size:14px; text-decoration:none; }
.sf-bottom { border-top:1px solid rgba(247,241,230,.1); padding:20px 0 calc(28px + env(safe-area-inset-bottom,0px)); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:13px; }
.sf-bottom nav { display:flex; gap:18px; flex-wrap:wrap; }
.sf-bottom a { color:rgba(247,241,230,.62); text-decoration:none; } .sf-bottom a:hover { color:${C.onDark}; }
.sf a:focus-visible, .sf button:focus-visible { outline:2px solid ${C.coral}; outline-offset:2px; border-radius:4px; }
@media (max-width: 1000px) { .sf-cols { grid-template-columns:repeat(3, minmax(0,1fr)); } .sf-brand { grid-column:1 / -1; } }
@media (max-width: 520px) { .sf-cols { grid-template-columns:1fr 1fr; padding:48px 0 36px; } }
`;

/** Site footer: where everything is. Pages end with their own call to action. */
export function SiteFooter() {
  return (
    <footer className="sf">
      <style>{FOOT_STYLES}</style>
      <div className="sf-wrap">
        <div className="sf-cols">
          <div className="sf-brand">
            <FynLogo variant="light" size="sm" loading="lazy" />
            <p className="sf-about">{FOOTER_TAGLINE}</p>
            <div className="sf-actions">
              <Link
                to={SIGNUP_URL}
                className="sf-primary"
                onClick={() => trackCta("start", "footer")}
              >
                {CTA_START}
              </Link>
              <DemoLink location="footer">{CTA_DEMO}</DemoLink>
            </div>
            <a className="sf-mail" href="mailto:support@fynhelp.com">
              support@fynhelp.com
            </a>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h4>{col.heading}</h4>
              {col.links.map((l) =>
                "action" in l ? (
                  <button
                    key={l.label}
                    type="button"
                    className="sf-cookie"
                    onClick={() => openCookieSettings()}
                    data-testid="footer-cookie-settings"
                  >
                    {l.label}
                  </button>
                ) : (
                  <Link key={l.label} to={l.to}>
                    {l.label}
                  </Link>
                ),
              )}
            </nav>
          ))}
        </div>

        <div className="sf-bottom">
          <span>
            &copy; {new Date().getFullYear()} {COMPANY.entity || "FynHelp"} ·
            Bengaluru, India
          </span>
          <nav aria-label="Account">
            <Link to="/app/onboarding?mode=signin">Sign in</Link>
            <Link to="/security">Security</Link>
            <span>Built for accounting firms</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/** Standard marketing page shell: shared styles, navbar, reveal, footer. */
export default function SiteShell({ children }: { children: ReactNode }) {
  useReveal();
  return (
    <div className="fyn-home">
      <style>{SITE_STYLES}</style>
      <Navbar />
      {children}
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  kicker,
  title,
  italic,
  sub,
  actions,
  center = false,
}: {
  kicker: string;
  title: string;
  italic?: string;
  sub?: string;
  actions?: ReactNode;
  center?: boolean;
}) {
  return (
    <section className={`fh-phero${center ? " center" : ""}`}>
      <div className="fh-wrap">
        <div className="in">
          <Reveal>
            <div>
              <span className="fh-kicker">{kicker}</span>
              <h1>
                {title}
                {italic ? (
                  <>
                    {" "}
                    <span className="ital">{italic}</span>
                  </>
                ) : null}
              </h1>
              {sub ? <p className="sub">{sub}</p> : null}
              {actions ? <div className="acts">{actions}</div> : null}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Section({
  id,
  kicker,
  title,
  italic,
  lead,
  center = false,
  children,
  alt = false,
}: {
  id?: string;
  kicker?: string;
  title?: string;
  italic?: string;
  lead?: string;
  center?: boolean;
  children?: ReactNode;
  alt?: boolean;
}) {
  return (
    <section
      className="fh-sec"
      id={id}
      style={alt ? { background: C.pageAlt } : undefined}
    >
      <div className={`fh-wrap${center ? " fh-center" : ""}`}>
        {(kicker || title) && (
          <Reveal>
            <div>
              {kicker && <span className="fh-kicker">{kicker}</span>}
              {title && (
                <h2 className="fh-h2">
                  {title}
                  {italic ? (
                    <>
                      {" "}
                      <span className="ital">{italic}</span>
                    </>
                  ) : null}
                </h2>
              )}
              {lead && <p className="fh-lead">{lead}</p>}
            </div>
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}

export function CtaBand({
  kicker = "Ready when you are",
  title,
  italic,
  lead,
  location = "cta-band",
}: {
  kicker?: string;
  title: string;
  italic?: string;
  lead?: string;
  /** Where on the site this band is, for click tracking. */
  location?: string;
}) {
  return (
    <section style={{ padding: "0 22px 96px" }}>
      <div className="fh-wrap" style={{ padding: 0 }}>
        <Reveal>
          <div className="fh-ctaband fh-dark">
            <span className="fh-kicker">{kicker}</span>
            <h2 className="fh-h2">
              {title}
              {italic ? (
                <>
                  {" "}
                  <span className="ital">{italic}</span>
                </>
              ) : null}
            </h2>
            {lead && (
              <p className="fh-lead" style={{ marginInline: "auto" }}>
                {lead}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
                marginTop: 26,
              }}
            >
              <Link
                to={SIGNUP_URL}
                className="fh-btn fh-btn-coral"
                onClick={() => trackCta("start", location)}
              >
                {CTA_START}
              </Link>
              <DemoLink location={location} className="fh-btn fh-btn-ghost">
                {CTA_DEMO}
              </DemoLink>
            </div>
            <p style={{ marginTop: 14, fontSize: 13, opacity: 0.7 }}>
              {CTA_NOTE}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
