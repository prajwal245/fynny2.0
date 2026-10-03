import { ReactNode, useEffect } from "react";
import { Link } from "@/lib/router-compat";
import FynLogo from "@/components/FynLogo";
import Navbar from "@/components/Navbar";
import { C, SITE_STYLES } from "./siteTheme";
import { AGENTS } from "./agents";
import { CTA_DEMO, CTA_NOTE, CTA_START, SIGNUP_URL, trackCta } from "./cta";
import { DemoLink } from "./BookDemo";

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
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
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

const FOOT_STYLES = `
.sf { background:${C.inkDeep}; color:rgba(247,241,230,.62); font-family:'Instrument Sans','Inter',system-ui,sans-serif; }
.sf-wrap { max-width:1200px; margin:0 auto; padding:0 22px; }
.sf-cols { display:grid; grid-template-columns:1.4fr repeat(4, minmax(0,1fr)); gap:32px; padding:64px 0 48px; }
.sf-cols h4 { color:${C.onDark}; font-size:13px; font-weight:600; margin:0 0 14px; letter-spacing:0; text-transform:none; }
.sf-cols a { display:block; color:rgba(247,241,230,.62); text-decoration:none; font-size:14px; padding:5px 0; transition:color .15s; }
.sf-cols a:hover { color:${C.onDark}; }
.sf-about { font-size:14px; line-height:1.6; max-width:30ch; margin:14px 0 0; }
.sf-mail { color:${C.onDark}; font-size:14px; user-select:all; }
.sf-bottom { border-top:1px solid rgba(247,241,230,.1); padding:20px 0 calc(28px + env(safe-area-inset-bottom,0px)); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:13px; }
.sf a:focus-visible { outline:2px solid ${C.coral}; outline-offset:2px; border-radius:4px; }
@media (max-width: 900px) { .sf-cols { grid-template-columns:1fr 1fr; } .sf-brand { grid-column:1 / -1; } }
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
            <p className="sf-about">
              Practice software for Indian CA firms. Statements in, matched books and a signed-off MIS out.
            </p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <Link to="/pipeline">How it works</Link>
            {AGENTS.map((a) => (
              <Link key={a.slug} to={`/agents/${a.slug}`}>
                {a.name}
              </Link>
            ))}
            <Link to="/pricing">Pricing</Link>
          </nav>
          <nav aria-label="Company">
            <h4>Company</h4>
            <Link to="/about">About</Link>
            <Link to="/security">Security</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <nav aria-label="Legal">
            <h4>Legal</h4>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
          <div>
            <h4>Talk to us</h4>
            <span className="sf-mail">support@fynhelp.com</span>
            <Link to="/v2/onboarding?mode=signin" style={{ marginTop: 8 }}>
              Sign in
            </Link>
          </div>
        </div>

        <div className="sf-bottom">
          <span>&copy; {new Date().getFullYear()} FynHelp Technologies · Bengaluru, India</span>
          <span>Built for chartered accountants</span>
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
    <section className="fh-sec" id={id} style={alt ? { background: C.pageAlt } : undefined}>
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
            {lead && <p className="fh-lead" style={{ marginInline: "auto" }}>{lead}</p>}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
              <Link to={SIGNUP_URL} className="fh-btn fh-btn-coral" onClick={() => trackCta("start", location)}>
                {CTA_START}
              </Link>
              <DemoLink location={location} className="fh-btn fh-btn-ghost">
                {CTA_DEMO}
              </DemoLink>
            </div>
            <p style={{ marginTop: 14, fontSize: 13, opacity: 0.7 }}>{CTA_NOTE}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
