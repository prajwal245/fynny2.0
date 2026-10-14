/**
 * Terms and Conditions, Privacy Policy, and Refund and Cancellation Policy.
 * The text comes from the signed-off Word documents (src/content/legal); this
 * file only lays it out. Change the substance in the documents, not here.
 */
import { Fragment, type ReactNode } from "react";
import { Link } from "@/lib/router-compat";
import SiteShell, { PageHero } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import type { LegalBlock, LegalDoc } from "@/content/legal/types";
import { fillCompany } from "@/content/legal/company";
import { TERMS } from "@/content/legal/terms";
import { PRIVACY } from "@/content/legal/privacy";
import { REFUND } from "@/content/legal/refund";

const DOC_LINKS: Record<string, string> = {
  "Terms and Conditions of Service": "/terms",
  "Privacy Policy": "/privacy",
  "Refund and Cancellation Policy": "/refund-policy",
};

/** Plain text with emails and the other policies turned into links. */
function Rich({ text, self }: { text: string; self: string }) {
  const filled = fillCompany(text);
  const parts = filled.split(/([\w.+-]+@fynhelp\.com|Terms and Conditions of Service|Privacy Policy|Refund and Cancellation Policy)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/@fynhelp\.com$/.test(p)) return <a key={i} href={`mailto:${p}`}>{p}</a>;
        const href = DOC_LINKS[p];
        if (href && href !== self) return <Link key={i} to={href}>{p}</Link>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** A definition such as “Client” means … : the defined term in bold. */
function Defined({ text, self }: { text: string; self: string }) {
  const m = /^(“[^”]+”)(.*)$/s.exec(text);
  if (!m) return <Rich text={text} self={self} />;
  return (
    <>
      <strong>{m[1]}</strong>
      <Rich text={m[2]} self={self} />
    </>
  );
}

function Block({ b, self }: { b: LegalBlock; self: string }) {
  switch (b.t) {
    case "h":
      return (
        <h2 id={`s${b.n}`}>
          <span className="fh-legal-n">{b.n}.</span> {fillCompany(b.text)}
        </h2>
      );
    case "c":
      return (
        <div className={b.sub ? "fh-legal-c fh-legal-sub" : "fh-legal-c"}>
          <span className="fh-legal-n">{b.n}</span>
          <p>
            {b.lead && <strong>{fillCompany(b.lead)} </strong>}
            {b.sub ? <Defined text={b.text} self={self} /> : <Rich text={b.text} self={self} />}
          </p>
        </div>
      );
    case "p":
      return <p className={b.strong ? "fh-legal-lede" : undefined}><Rich text={b.text} self={self} /></p>;
    case "table":
      return (
        <div className="fh-legal-table">
          <table>
            <thead><tr>{b.head.map((h, i) => <th key={i}>{fillCompany(h)}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}><Rich text={c} self={self} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "kv":
      return (
        <dl className="fh-legal-kv">
          {b.rows.map(([k, v], i) => (
            <Fragment key={i}>
              <dt>{k}</dt>
              <dd><Rich text={v} self={self} /></dd>
            </Fragment>
          ))}
        </dl>
      );
  }
}

function LegalDocument({ doc, self, children }: { doc: LegalDoc; self: string; children?: ReactNode }) {
  const heads = doc.blocks.filter((b): b is Extract<LegalBlock, { t: "h" }> => b.t === "h");
  return (
    <section className="fh-sec" style={{ paddingTop: 0 }}>
      <div className="fh-wrap">
        <style>{`
          .fh-legal-grid { display: grid; grid-template-columns: 220px minmax(0, 760px); gap: 48px; align-items: start; }
          .fh-legal-toc { position: sticky; top: 96px; font-size: 13.5px; line-height: 1.5; }
          .fh-legal-toc p { font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; color: ${C.body}; opacity: .7; margin: 0 0 10px; font-weight: 600; }
          .fh-legal-toc ol { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
          .fh-legal-toc a { color: ${C.body}; text-decoration: none; }
          .fh-legal-toc a:hover { color: ${C.ink}; text-decoration: underline; }
          .fh-legal { color: ${C.body}; font-size: 15.5px; line-height: 1.75; }
          .fh-legal h2 { font-size: 20px; margin: 40px 0 12px !important; color: ${C.ink}; letter-spacing: -0.01em; scroll-margin-top: 90px; }
          .fh-legal p { margin: 0 0 12px; }
          .fh-legal a { color: ${C.ink}; text-decoration: underline; text-underline-offset: 2px; }
          .fh-legal strong { color: ${C.ink}; }
          .fh-legal-n { color: ${C.ink}; font-variant-numeric: tabular-nums; font-weight: 600; }
          .fh-legal-c { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 4px; }
          .fh-legal-c > .fh-legal-n { font-size: 14px; padding-top: 2px; }
          .fh-legal-sub { margin-left: 44px; grid-template-columns: 34px minmax(0, 1fr); }
          .fh-legal-sub > .fh-legal-n { font-weight: 500; }
          .fh-legal-lede { color: ${C.ink}; }
          .fh-legal-table { overflow-x: auto; margin: 8px 0 18px; }
          .fh-legal table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 520px; }
          .fh-legal th { text-align: left; padding: 10px 12px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: ${C.ink}; border-bottom: 1.5px solid rgba(0,0,0,.18); }
          .fh-legal td { text-align: left; padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,.08); vertical-align: top; }
          .fh-legal-kv { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 6px 16px; margin: 8px 0 18px 44px; padding: 16px 18px; border: 1px solid rgba(0,0,0,.08); border-radius: 12px; font-size: 14.5px; }
          .fh-legal-kv dt { color: ${C.body}; opacity: .75; }
          .fh-legal-kv dd { margin: 0; color: ${C.ink}; }
          .fh-legal-meta { font-size: 13px; opacity: .75; margin-bottom: 20px !important; }
          @media (max-width: 900px) {
            .fh-legal-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
            .fh-legal-toc { display: none; }
            .fh-legal-sub { margin-left: 16px; }
            .fh-legal-kv { margin-left: 0; grid-template-columns: minmax(0, 1fr); }
            .fh-legal-kv dd { margin-bottom: 8px; }
          }
        `}</style>
        <div className="fh-legal-grid">
          <nav className="fh-legal-toc" aria-label="Sections">
            <p>Contents</p>
            <ol>
              {heads.map((h) => (
                <li key={h.n}><a href={`#s${h.n}`}>{h.n}. {h.text}</a></li>
              ))}
            </ol>
          </nav>
          <article className="fh-legal">
            <p className="fh-legal-meta">Last updated {doc.updated} · Version {doc.version}</p>
            {doc.blocks.map((b, i) => <Block key={i} b={b} self={self} />)}
            {children}
          </article>
        </div>
      </div>
    </section>
  );
}

export function TermsPage() {
  return (
    <SiteShell>
      <PageHero kicker="Legal" title="Terms and" italic="conditions" sub="The agreement between your firm and FynHelp for using the service." />
      <LegalDocument doc={TERMS} self="/terms" />
    </SiteShell>
  );
}

export function PrivacyPage() {
  return (
    <SiteShell>
      <PageHero kicker="Legal" title="Privacy" italic="policy" sub="What FynHelp collects, why, who processes it, how long it is kept and your rights over it." />
      <LegalDocument doc={PRIVACY} self="/privacy" />
    </SiteShell>
  );
}

export function RefundPage() {
  return (
    <SiteShell>
      <PageHero kicker="Legal" title="Refund and" italic="cancellation" sub="How to cancel a FynHelp subscription, and when and how money is refunded." />
      <LegalDocument doc={REFUND} self="/refund-policy" />
    </SiteShell>
  );
}
