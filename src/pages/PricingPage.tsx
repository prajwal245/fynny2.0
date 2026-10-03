import { useState } from "react";
import { Link } from "@/lib/router-compat";
import SiteShell, { Section, Reveal, CtaBand } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { SIGNUP_URL, trackCta } from "@/components/site/cta";
import { openDemo } from "@/components/site/BookDemo";

/* ================================================================
   FynHelp — Pricing · Pay per active client (Finvora design system)
================================================================ */

const STYLES = `
.fh-price-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:44px; align-items:stretch; }
@media (max-width:960px){ .fh-price-grid{ grid-template-columns:1fr; max-width:440px; margin-left:auto; margin-right:auto; } }
.fh-pcard { background:${C.card}; border:1px solid ${C.line}; border-radius:22px; padding:30px 28px 28px; display:flex; flex-direction:column; position:relative; transition:transform .45s cubic-bezier(.16,1,.3,1), box-shadow .45s; }
.fh-pcard:hover { transform:translateY(-5px); box-shadow:0 30px 55px -42px rgba(23,18,8,.55); }
.fh-pcard.pop { border:1.5px solid ${C.maroon}; box-shadow:0 26px 60px -34px rgba(92,18,22,.5); }
.fh-pbadge { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:${C.maroon}; color:#F7F1E6; font-size:10px; font-weight:600; letter-spacing:.16em; padding:6px 16px; border-radius:999px; text-transform:uppercase; white-space:nowrap; }
.fh-pcard .tier { font-size:18px; font-weight:600; letter-spacing:-0.02em; }
.fh-pcard .for { color:${C.body}; font-size:13.5px; margin-top:5px; line-height:1.5; min-height:40px; }
.fh-price { display:flex; align-items:baseline; gap:4px; margin-top:18px; }
.fh-price .cur { font-size:19px; font-weight:600; color:${C.maroon}; }
.fh-price .amount { font-size:44px; font-weight:600; letter-spacing:-0.05em; font-variant-numeric:tabular-nums; }
.fh-price .per { color:${C.muted}; font-size:14px; }
.fh-price .was { color:${C.muted}; font-size:15px; text-decoration:line-through; margin-left:10px; font-variant-numeric:tabular-nums; }
.fh-pbill { font-size:12.5px; color:${C.muted}; margin-top:6px; min-height:17px; }
.fh-quota { background:rgba(169,56,56,.08); border-radius:14px; padding:14px; margin-top:18px; text-align:center; }
.fh-quota .qn { font-family:'Fraunces',Georgia,serif; font-style:italic; font-weight:400; font-size:28px; color:${C.maroon}; font-variant-numeric:tabular-nums; }
.fh-quota .ql { font-size:13px; font-weight:600; color:${C.maroonDeep}; }
.fh-extra { font-size:12.5px; color:${C.muted}; text-align:center; margin-top:8px; line-height:1.5; }
.fh-eff { font-size:12px; color:${C.gold}; text-align:center; font-weight:600; margin-top:3px; letter-spacing:.02em; }
.fh-ghead { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:${C.maroon}; margin:20px 0 6px; padding-top:16px; border-top:1px solid ${C.line}; }
.fh-feat { display:flex; gap:10px; padding:6px 0; }
.fh-feat .ck { flex:0 0 18px; height:18px; margin-top:2px; border-radius:6px; background:rgba(169,56,56,.1); color:${C.maroon}; font-weight:700; font-size:11px; display:flex; align-items:center; justify-content:center; }
.fh-feat .ft { font-weight:600; font-size:14px; }
.fh-feat .fd { font-size:12.5px; color:${C.body}; line-height:1.55; margin-top:1px; }
.fh-pcard .spacer { flex:1; }
.fh-trial-note { text-align:center; font-size:12px; color:${C.muted}; margin-top:9px; }

.fh-cycle { display:inline-flex; background:#E4DCCB; border-radius:999px; padding:4px; gap:2px; }
.fh-cycle button { border:0; background:transparent; font-family:inherit; font-size:14px; font-weight:600; color:${C.body}; padding:9px 24px; border-radius:999px; cursor:pointer; transition:.2s; display:flex; align-items:center; gap:8px; }
.fh-cycle button.on { background:${C.card}; color:${C.ink}; box-shadow:0 1px 5px rgba(23,18,8,.14); }
.fh-savepill { font-size:10px; font-weight:700; background:${C.gold}; color:#F7F1E6; padding:2px 9px; border-radius:999px; letter-spacing:.04em; }

.fh-trust { display:flex; flex-wrap:wrap; justify-content:center; gap:10px 30px; padding:30px 0 0; font-size:13.5px; color:${C.body}; }
.fh-trust b { color:${C.ink}; font-weight:600; }

.fh-minis { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:40px; }
@media (max-width:960px){ .fh-minis{ grid-template-columns:1fr; max-width:480px; margin-left:auto; margin-right:auto; } }
.fh-mini { background:${C.card}; border:1px solid ${C.line}; border-radius:18px; padding:22px; transition:transform .45s cubic-bezier(.16,1,.3,1); }
.fh-mini:hover { transform:translateY(-4px); }
.fh-mini .mk { width:38px; height:38px; border-radius:11px; background:${C.maroon}; color:#F7F1E6; display:flex; align-items:center; justify-content:center; font-size:19px; margin-bottom:14px; font-family:'Fraunces',Georgia,serif; font-style:italic; }
.fh-mini h4 { font-size:15.5px; font-weight:600; margin:0 0 7px; }
.fh-mini h4 span { font-size:10px; font-weight:600; color:${C.gold}; letter-spacing:.08em; text-transform:uppercase; margin-left:7px; }
.fh-mini p { font-size:13.5px; color:${C.body}; line-height:1.65; margin:0; }

.fh-tablewrap { overflow-x:auto; margin-top:40px; }
.fh-tablewrap table { width:100%; border-collapse:separate; border-spacing:0; background:${C.card}; border:1px solid ${C.line}; border-radius:18px; overflow:hidden; font-size:14px; min-width:640px; }
.fh-tablewrap th, .fh-tablewrap td { padding:12px 16px; text-align:center; border-bottom:1px solid ${C.line}; }
.fh-tablewrap tr:last-child td { border-bottom:0; }
.fh-tablewrap thead th { background:${C.pageAlt}; font-weight:600; font-size:13px; }
.fh-tablewrap thead th.hl { background:rgba(169,56,56,.1); color:${C.maroonDeep}; }
.fh-tablewrap td:first-child, .fh-tablewrap th:first-child { text-align:left; font-weight:500; }
.fh-tablewrap td.hl { background:rgba(169,56,56,.05); }
.fh-tablewrap .y { color:${C.maroon}; font-weight:700; }
.fh-tablewrap .n { color:${C.muted}; }

.fh-faq { max-width:740px; margin:40px auto 0; }
.fh-faq details { background:${C.card}; border:1px solid ${C.line}; border-radius:14px; padding:17px 22px; margin-bottom:10px; }
.fh-faq summary { font-weight:600; font-size:15px; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:12px; }
.fh-faq summary::-webkit-details-marker { display:none; }
.fh-faq summary::after { content:"+"; font-weight:400; color:${C.muted}; font-size:19px; }
.fh-faq details[open] summary::after { content:"–"; }
.fh-faq details p { color:${C.body}; font-size:14.5px; line-height:1.7; margin:10px 0 0; }

.fh-pilot { background:${C.maroonDeep}; border-radius:24px; color:#F7F1E6; text-align:center; padding:46px 26px; margin-top:64px; }
.fh-pilot h3 { font-size:clamp(22px,3vw,28px); letter-spacing:-0.03em; }
.fh-pilot p { color:rgba(247,241,230,.7); font-size:14.5px; margin:12px auto 24px; max-width:560px; line-height:1.65; }
`;

type Tier = {
  name: string;
  badge?: string;
  popular?: boolean;
  forLine: string;
  monthly: string;
  annual: string;
  billM: string;
  billA: string;
  quota: string;
  extra: string;
  eff: string;
  groups: { head: string; feats: { t: string; d: string }[] }[];
  cta: { label: string; to: string; primary?: boolean };
  trialNote: string;
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    forLine: "Small firms automating their first book of clients",
    monthly: "2,999",
    annual: "2,549",
    billM: "Billed monthly · cancel anytime",
    billA: "₹30,590 billed yearly · save ₹5,398",
    quota: "15",
    extra: "+ ₹149 per additional active client · cap 25",
    eff: "≈ ₹200 per client / month",
    groups: [
      {
        head: "Core pipeline",
        feats: [
          { t: "Extract", d: "Invoices, bank and GST statements in — clean structured data out. Any PDF, scan or email." },
          { t: "Recon", d: "Books vs bank vs GST matched automatically. Exceptions flagged with reason codes." },
          { t: "Narrate", d: "Draft narrations with sources attached, ready for partner review." },
          { t: "Audit trail", d: "Click any number, see the original document it came from." },
        ],
      },
      {
        head: "Always included",
        feats: [
          { t: "Unlimited users", d: "Your whole firm, no per-seat fees — ever." },
          { t: "Fair use: 500 docs/mo", d: "Excess documents ₹2 each, only if you cross the cap." },
        ],
      },
    ],
    cta: { label: "Start free", to: SIGNUP_URL },
    trialNote: "30 days free · no card required",
  },
  {
    name: "Professional",
    badge: "Most popular",
    popular: true,
    forLine: "The core pick — mid-size firms running 15–40 clients on FynHelp",
    monthly: "5,999",
    annual: "5,099",
    billM: "Billed monthly · cancel anytime",
    billA: "₹61,190 billed yearly · save ₹10,798",
    quota: "40",
    extra: "+ ₹119 per additional active client",
    eff: "≈ ₹150 per client / month",
    groups: [
      {
        head: "Everything in Starter, plus",
        feats: [
          { t: "Chaser", d: "Polite automatic follow-ups for pending documents and open exceptions. Stop chasing clients by phone." },
          { t: "White-label reports", d: "Client-facing outputs carry your firm's logo and colours, not ours." },
          { t: "Priority processing", d: "Your documents jump the queue when month-end gets busy." },
          { t: "Fair use: 1,500 docs/mo", d: "Three times the Starter document capacity." },
        ],
      },
    ],
    cta: { label: "Start free", to: SIGNUP_URL, primary: true },
    trialNote: "30 days free · no card required",
  },
  {
    name: "Scale",
    forLine: "Multi-partner firms running 40–100+ clients",
    monthly: "12,999",
    annual: "11,049",
    billM: "Billed monthly · cancel anytime",
    billA: "₹1,32,590 billed yearly · save ₹23,398",
    quota: "100",
    extra: "+ ₹99 per additional client · no cap",
    eff: "≈ ₹130 per client / month",
    groups: [
      {
        head: "Everything in Professional, plus",
        feats: [
          { t: "Multi-partner dashboards", d: "Per-partner views and role permissions for larger teams." },
          { t: "Narration playbook", d: "Encode your firm's house style into custom narration templates." },
          { t: "API and connectors", d: "Push extracted data and exceptions into your existing stack." },
          { t: "Dedicated success manager", d: "A named contact plus quarterly reviews on match rates and time saved." },
          { t: "Fair use: 4,000 docs/mo", d: "Built for full book volume at month-end." },
        ],
      },
    ],
    cta: { label: "Book a demo", to: "demo" },
    trialNote: "Custom onboarding for large books",
  },
];

const COMPARE: [string, string, string, string][] = [
  ["Active clients included", "15", "40", "100"],
  ["Additional active client", "₹149", "₹119", "₹99 · no cap"],
  ["Documents / month (fair use)", "500", "1,500", "4,000"],
  ["Users", "Unlimited", "Unlimited", "Unlimited"],
  ["Extract · Recon · Narrate", "y", "y", "y"],
  ["Source-traceable audit trail", "y", "y", "y"],
  ["Chaser follow-ups", "n", "y", "y"],
  ["White-label reports", "n", "y", "y"],
  ["Priority processing", "n", "y", "y"],
  ["Multi-partner dashboards and roles", "n", "n", "y"],
  ["Narration playbook", "n", "n", "y"],
  ["API and custom connectors", "n", "n", "y"],
  ["Success manager and quarterly reviews", "n", "n", "y"],
];

const FAQS: [string, string][] = [
  [
    "What counts as an active client entity?",
    "Any client entity with at least one document processed or reconciliation run in the calendar month. Clients you did not touch that month cost you nothing — you pay for work you actually did.",
  ],
  [
    "What happens if we exceed our included clients?",
    "Extra active clients are billed at your tier's rate (₹149 / ₹119 / ₹99). Starter caps at 25 total; Professional and Scale have no cap. You can also upgrade anytime — monthly switches are instant, annual switches are pro-rated.",
  ],
  [
    "Is GST included in these prices?",
    "No — all prices are exclusive of GST. You will be invoiced as a SaaS subscription with GST added at the applicable rate.",
  ],
  [
    "How does the annual discount work?",
    "Paying yearly saves 15%, applied upfront. For example, Professional is ₹61,190 per year instead of ₹71,988 paid monthly — a saving of ₹10,798.",
  ],
  [
    "Do you train AI models on our clients' data?",
    "No. Every extracted number carries a source-traceable audit trail back to the original document, your data stays in India, and nothing is shared or used for training.",
  ],
  [
    "Can we switch to one flat price for the firm instead?",
    "Yes — at renewal, or by talking to us. Some partners prefer a single budget number; we will quote one that fits your book size.",
  ],
];

const cell = (v: string) =>
  v === "y" ? <span className="y">✓</span> : v === "n" ? <span className="n">—</span> : <span className="num">{v}</span>;

export default function PricingPage() {
  const [cycle, setCycle] = useState<"m" | "a">("m");
  const annual = cycle === "a";

  return (
    <SiteShell>
      <style>{STYLES}</style>

      {/* HERO */}
      <section className="fh-phero center">
        <div className="fh-wrap">
          <div className="in">
            <Reveal>
              <div>
                <span className="fh-kicker">The intelligence layer on top of Tally and Zoho</span>
                <h1>
                  Pay for the clients <span className="ital">you actually close.</span>
                </h1>
                <p className="sub" style={{ marginInline: "auto" }}>
                  FynHelp sits on top of Tally, Zoho Books, and your bank feeds — extracting,
                  reconciling, and narrating automatically. Your bill only grows when your book does.
                </p>
                <div style={{ marginTop: 24 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      background: "rgba(169,56,56,.08)",
                      color: C.maroonDeep,
                      fontSize: 13.5,
                      fontWeight: 600,
                      padding: "8px 18px",
                      borderRadius: 999,
                    }}
                  >
                    Most firms recover their subscription two to three times over in junior hours saved
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CYCLE TOGGLE */}
      <div className="fh-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 30 }}>
        <Reveal>
          <div className="fh-cycle" role="tablist" aria-label="Billing cycle">
            <button className={annual ? "" : "on"} onClick={() => setCycle("m")}>Monthly</button>
            <button className={annual ? "on" : ""} onClick={() => setCycle("a")}>
              Annual <span className="fh-savepill">Save 15%</span>
            </button>
          </div>
        </Reveal>
        <Reveal delay={60}>
          <p style={{ fontSize: 13.5, color: C.body, margin: 0 }}>
            Prefer one flat price for the whole firm?{" "}
            <Link to="/contact" style={{ color: C.maroon, fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.maroon}` }}>
              Talk to us
            </Link>
          </p>
        </Reveal>
      </div>

      {/* CARDS */}
      <section className="fh-wrap" style={{ paddingTop: 40 }}>
        <div className="fh-price-grid">
          {TIERS.map((t, i) => (
            <Reveal key={t.name} delay={i * 80}>
              <div className={`fh-pcard${t.popular ? " pop" : ""}`}>
                {t.badge && <div className="fh-pbadge">{t.badge}</div>}
                <div className="tier">{t.name}</div>
                <div className="for">{t.forLine}</div>
                <div className="price">
                  <span className="cur">₹</span>
                  <span className="amount num">{annual ? t.annual : t.monthly}</span>
                  <span className="per">/mo</span>
                  {annual && <span className="was num">₹{t.monthly}</span>}
                </div>
                <div className="fh-pbill num">{annual ? t.billA : t.billM}</div>
                <div className="fh-quota">
                  <span className="qn num">{t.quota}</span> <span className="ql">active clients included</span>
                </div>
                <div className="fh-extra">{t.extra}</div>
                <div className="fh-eff">{t.eff}</div>

                {t.groups.map((g) => (
                  <div key={g.head}>
                    <div className="fh-ghead">{g.head}</div>
                    {g.feats.map((f) => (
                      <div className="fh-feat" key={f.t}>
                        <span className="ck">✓</span>
                        <div>
                          <div className="ft">{f.t}</div>
                          <div className="fd">{f.d}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                <div className="spacer" />
                <Link
                  to={t.cta.to === "demo" ? "/pricing" : t.cta.to}
                  className={`fh-btn ${t.cta.primary ? "fh-btn-primary" : "fh-btn-ghost"}`}
                  style={{ justifyContent: "center", marginTop: 22 }}
                  onClick={(e) => {
                    // "Book a demo" opens the calendar here; the rest go straight to sign-up.
                    if (t.cta.to === "demo") {
                      e.preventDefault();
                      openDemo(`pricing-plan-${t.name.toLowerCase()}`);
                    } else trackCta("start", `pricing-plan-${t.name.toLowerCase()}`);
                  }}
                >
                  {t.cta.label}
                </Link>
                <div className="fh-trial-note">{t.trialNote}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="fh-trust">
            <span><b>30-day free trial</b> · no card</span>
            <span><b>Cancel anytime</b></span>
            <span><b>Unlimited users</b> on all tiers</span>
            <span><b>India data residency</b></span>
            <span><b>Every number</b> source-traceable</span>
            <span>All prices <b>exclude GST</b></span>
          </div>
        </Reveal>
      </section>

      {/* PIPELINE EXPLAINER */}
      <Section kicker="What you get" title="The pipeline," italic="explained." center>
        <div className="fh-minis">
          {[
            ["E", "Extract", "All plans", "Any PDF, scan or email attachment in — clean structured data out. Invoices, bank statements and GST filings. No templates, no manual keying."],
            ["R", "Recon", "All plans", "Books vs bank vs GST, matched automatically. Exceptions arrive flagged with reason codes, so your team only reviews what actually matters."],
            ["N", "Narrate", "All plans", "Every reconciled line gets a draft narration with its source attached. Partners review and approve — nothing ever sends itself."],
            ["C", "Chaser", "Professional and up", "Pending documents and unresolved exceptions trigger polite, automatic follow-ups to the right person. Your team stops chasing clients."],
            ["A", "Audit trail", "All plans", "Click any number, see the original document. Every figure is traceable to source — built to survive partner review and scrutiny."],
            ["U", "Unlimited users", "All plans", "The whole firm, on every tier. No per-seat fees — because charging per employee punishes you for delegating."],
          ].map(([k, t, tag, d], i) => (
            <Reveal key={t} delay={i * 60}>
              <div className="fh-mini">
                <div className="mk">{k}</div>
                <h4>
                  {t} <span>{tag}</span>
                </h4>
                <p>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={160}>
          <p style={{ textAlign: "center", marginTop: 26, fontSize: 14 }}>
            <Link to="/pipeline" style={{ color: C.maroon, fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.maroon}` }}>
              See the pipeline in motion
            </Link>
          </p>
        </Reveal>
      </Section>

      {/* COMPARISON TABLE */}
      <Section kicker="Compare" title="Every line," italic="side by side." center alt>
        <div className="fh-tablewrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Starter</th>
                <th className="hl">Professional</th>
                <th>Scale</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([label, a, b, c]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{cell(a)}</td>
                  <td className="hl">{cell(b)}</td>
                  <td>{cell(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* PILOT BAND */}
      <div className="fh-wrap">
        <Reveal>
          <div className="fh-pilot">
            <h3>
              Fewer than 3 clients? <span className="ital">The Pilot program is free.</span>
            </h3>
            <p>
              The full Extract, Recon, Narrate pipeline for up to 3 client entities. No card, no
              clock — we only ask for feedback while we build alongside you.
            </p>
            <Link to={SIGNUP_URL} className="fh-btn fh-btn-coral" onClick={() => trackCta("start", "pricing-pilot")}>
              Start the free Pilot
            </Link>
          </div>
        </Reveal>
      </div>

      {/* FAQ */}
      <Section id="faq" kicker="FAQ" title="Fair questions," italic="straight answers." center>
        <div className="fh-faq" style={{ textAlign: "left" }}>
          {FAQS.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Start with one client."
        italic="Scale when the book does."
        lead="Thirty days free on any plan. Unlimited users from day one, and every number stays traceable to its source document."
        location="pricing-final"
      />
    </SiteShell>
  );
}
