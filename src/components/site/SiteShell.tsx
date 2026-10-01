import { ReactNode, useEffect } from "react";
import { Link } from "@/lib/router-compat";
import FynLogo from "@/components/FynLogo";
import Navbar from "@/components/Navbar";
import { C, SITE_STYLES } from "./siteTheme";
import { AGENTS } from "./agents";

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

export function SiteFooter() {
  return (
    <footer className="fh-foot">
      <div className="fh-wrap">
        <div className="fh-foot-grid">
          <div>
            <FynLogo variant="dark" size="md" />
            <p style={{ fontSize: 13.5, lineHeight: 1.65, marginTop: 12, color: C.body, maxWidth: "34ch" }}>
              The intelligence layer between your documents and your ledger. Built in India, for Indian
              practices.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <Link to="/pipeline">The pipeline</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/#faq">FAQ</Link>
            <Link to="/waitlist">Book a demo</Link>
          </div>
          <div>
            <h4>Modules</h4>
            {AGENTS.map((a) => (
              <Link key={a.slug} to={`/agents/${a.slug}`}>
                {a.name} — {a.footerUse}
              </Link>
            ))}
          </div>
          <div>
            <h4>For firms</h4>
            <Link to="/ca-firms">CA firms</Link>
            <Link to="/ca/login">CA sign in</Link>
            <Link to="/use-cases">Use cases</Link>
            <Link to="/blog">Blog</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link to="/about">About</Link>
            <Link to="/security">Security</Link>
            <Link to="/community">Community</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/login">Sign in</Link>
          </div>
        </div>
        <div className="fh-foot-bottom">
          <span>© 2026 FynHelp Technologies · Bengaluru, India</span>
          <span>support@fynhelp.com</span>
        </div>
        <div className="fh-wordmark" aria-hidden="true">FYNHELP</div>
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
  primary = { to: "/waitlist", label: "Book a demo" },
  secondary,
}: {
  kicker?: string;
  title: string;
  italic?: string;
  lead?: string;
  primary?: { to: string; label: string };
  secondary?: { to: string; label: string };
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
              <Link to={primary.to} className="fh-btn fh-btn-coral">
                {primary.label}
              </Link>
              {secondary && (
                <Link to={secondary.to} className="fh-btn fh-btn-ghost">
                  {secondary.label}
                </Link>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
