import { Link } from "@/lib/router-compat";
import { ArrowRight, Check } from "lucide-react";
import SiteShell, { PageHero, Section, CtaBand, Reveal } from "@/components/site/SiteShell";
import { AGENTS } from "@/components/site/agents";
import { C } from "@/components/site/siteTheme";

const SEGMENTS = [
  {
    t: "Manufacturing and trading",
    d: "Working capital is the whole game. FynHelp reads purchase-heavy books, reconciles bank lines against ledger, and surfaces the ITC timing gaps and vendor payment clusters that eat your cash cycle before you notice.",
    wins: [
      "Input tax credit reconciled every cycle against GSTR-2B",
      "Bank lines matched to purchase invoices in three passes",
      "Cash position and burn visible without manual assembly",
    ],
    note: "FynHelp covers financial intelligence — bank recon, ITC recon, MIS and cash flow. Inventory and purchase order management are out of scope for v1.",
  },
  {
    t: "D2C and marketplace sellers",
    d: "Razorpay settlement files, fee deductions and returns make reported revenue and banked revenue two different numbers every week. FynHelp reconciles the settlements and flags the gaps automatically.",
    wins: [
      "Razorpay settlement reconciliation wired directly",
      "Fee deductions and refunds separated from gross revenue",
      "Cash position updated as settlements land",
    ],
    note: "FynHelp reconciles Razorpay settlements and tracks cash. SKU-level margin tracking and returns analytics are on the roadmap for a future release.",
  },
];

export default function UseCasesPage() {
  return (
    <SiteShell>
      <PageHero
        kicker="Use cases"
        title="Four modules. One"
        italic="finance desk that never sleeps"
        sub="Each module owns a part of the month end. Together they read your books, reconcile them against source, and hand you the handful of things that genuinely need a decision."
        actions={
          <>
            <Link to="/waitlist" className="fh-btn fh-btn-primary">
              Book a demo <ArrowRight size={15} />
            </Link>
            <Link to="/waitlist" className="fh-btn fh-btn-ghost">
              Book a demo
            </Link>
          </>
        }
      />

      <div className="fh-wrap">
        <div className="fh-strip">
          <div className="fh-strip-grid">
            <div><div className="v num">4</div><div className="l">modules on every account</div></div>
            <div><div className="v num">13 wk</div><div className="l">cash horizon</div></div>
            <div><div className="v num">100%</div><div className="l">figures traceable to source</div></div>
            <div><div className="v num">30 min</div><div className="l">to first finding</div></div>
          </div>
        </div>
      </div>

      <Section
        kicker="The modules"
        title="Pick the one that owns"
        italic="your worst week of the month"
        lead="Every module runs on the same ledger, so a finding in one shows up as context in another."
      >
        <div className="fh-grid fh-g3" style={{ marginTop: 44 }}>
          {AGENTS.map((a, i) => (
            <Reveal key={a.slug} delay={(i % 3) * 80}>
              <Link to={`/agents/${a.slug}`} className="fh-card" style={{ display: "block", color: "inherit" }}>
                <span className="fh-tag">{a.kicker}</span>
                <h3>{a.name}</h3>
                <p>{a.sub}</p>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.maroon }}>
                  {a.footerUse} · read more
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        alt
        kicker="By business type"
        title="The same books read"
        italic="through your industry"
        lead="What matters in a trading business is not what matters in a D2C brand. The modules weight accordingly."
      >
        <div className="fh-grid fh-g2" style={{ marginTop: 40 }}>
          {SEGMENTS.map((s, i) => (
            <Reveal key={s.t} delay={(i % 2) * 90}>
              <div className="fh-card">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                <ul className="fh-list">
                  {s.wins.map((w) => (
                    <li key={w}>
                      <Check size={15} />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
                {s.note && (
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 14, fontStyle: "italic", lineHeight: 1.6 }}>
                    {s.note}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaBand
        title="See it run"
        italic="on your own numbers"
        lead="Bring one month of statements. You leave with the findings whether or not you sign up."
        secondary={{ to: "/pricing", label: "See pricing" }}
      />
    </SiteShell>
  );
}
