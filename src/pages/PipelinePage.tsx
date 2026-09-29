import type { ReactElement } from "react";
import { Link } from "@/lib/router-compat";
import SiteShell, { Section, Reveal, CtaBand } from "@/components/site/SiteShell";
import { C } from "@/components/site/siteTheme";
import { AGENTS } from "@/components/site/agents";

/* ================================================================
   FynHelp — Pipeline: Extract → Recon → Narrate → Chaser (animated)
================================================================ */

const STYLES = `
.fh-steps { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:48px; }
@media (max-width:900px){ .fh-steps{ grid-template-columns:1fr; } }
.fh-step { background:${C.card}; border:1px solid ${C.line}; border-radius:24px; padding:30px; overflow:hidden; transition:transform .5s cubic-bezier(.16,1,.3,1), box-shadow .5s; }
.fh-step:hover { transform:translateY(-5px); box-shadow:0 30px 60px -44px rgba(23,18,8,.55); }
.fh-step .no { font-family:'Fraunces',Georgia,serif; font-style:italic; font-size:15px; color:${C.muted}; }
.fh-step h3 { font-size:clamp(24px,3vw,32px); margin-top:6px; letter-spacing:-0.03em; }
.fh-step .sd { font-size:14.5px; line-height:1.65; color:${C.body}; margin-top:10px; max-width:46ch; }
.fh-demo { margin-top:24px; border-radius:16px; background:${C.pageAlt}; border:1px solid ${C.lineSoft}; padding:22px; min-height:190px; position:relative; overflow:hidden; }
.fh-demo-cap { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; color:${C.body}; }
.fh-demo-cap i { width:7px; height:7px; border-radius:99px; background:${C.green}; display:inline-block; }
.fh-demo-cap .pill { margin-left:auto; font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:${C.muted}; }

/* 01 EXTRACT — fields lift out of a document */
.fh-doc { position:absolute; left:22px; top:56px; width:120px; background:${C.card}; border:1px solid ${C.line}; border-radius:10px; padding:10px 12px; }
.fh-doc .ln { height:6px; border-radius:3px; background:${C.lineSoft}; margin:7px 0; }
.fh-doc .ln.w1 { width:88%; } .fh-doc .ln.w2 { width:64%; } .fh-doc .ln.w3 { width:76%; }
.fh-field { position:absolute; left:168px; background:${C.card}; border:1px solid ${C.line}; border-radius:9px; padding:7px 12px; font-size:11.5px; font-weight:600; opacity:0; animation:fh-lift 6s ease-in-out infinite; box-shadow:0 10px 22px -14px rgba(23,18,8,.4); }
.fh-field small { display:block; font-size:9px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:${C.muted}; }
.fh-field.f1 { top:52px; animation-delay:.4s; }
.fh-field.f2 { top:96px; animation-delay:1.4s; }
.fh-field.f3 { top:140px; animation-delay:2.4s; }
@keyframes fh-lift { 0%,8% { opacity:0; transform:translateX(-34px); } 22%,72% { opacity:1; transform:translateX(0); } 86%,100% { opacity:0; transform:translateX(0); } }
.fh-conf { position:absolute; right:18px; bottom:16px; font-size:10.5px; font-weight:600; color:${C.green}; background:rgba(31,90,70,.1); padding:4px 10px; border-radius:99px; animation:fh-lift 6s ease-in-out infinite; animation-delay:3s; }

/* 02 RECON — bank chips drift to invoice chips and lock */
.fh-rrow { display:flex; align-items:center; gap:10px; margin:9px 0; }
.fh-chip { font-size:11px; font-weight:600; border-radius:8px; padding:6px 11px; border:1px solid ${C.line}; background:${C.card}; white-space:nowrap; font-variant-numeric:tabular-nums; }
.fh-chip.bank { border-style:dashed; animation:fh-drift 5s cubic-bezier(.16,1,.3,1) infinite; }
.fh-rrow:nth-child(3) .fh-chip.bank { animation-delay:.5s; }
.fh-rrow:nth-child(4) .fh-chip.bank { animation-delay:1s; }
@keyframes fh-drift { 0%,12% { transform:translateX(-16px); border-style:dashed; } 40%,88% { transform:translateX(0); border-style:solid; border-color:rgba(31,90,70,.5); background:rgba(31,90,70,.08); } 100% { transform:translateX(0); } }
.fh-link { flex:1; height:1px; background:${C.lineSoft}; position:relative; }
.fh-link::after { content:''; position:absolute; inset:-3px 0; background:transparent; }
.fh-chip.inv { color:${C.maroonDeep}; }
.fh-chip.nomatch { border-color:rgba(226,103,63,.55); background:rgba(226,103,63,.1); color:#B8401F; animation:fh-blink 5s ease-in-out infinite; }
@keyframes fh-blink { 0%,100% { opacity:1; } 50% { opacity:.55; } }

/* 03 NARRATE — narration types itself out, source clips on */
.fh-narr { background:${C.card}; border:1px solid ${C.line}; border-radius:12px; padding:14px 16px; font-size:13px; line-height:1.6; min-height:78px; }
.fh-narr .typed { display:inline; }
.fh-narr .caret { display:inline-block; width:2px; height:14px; background:${C.maroon}; vertical-align:-2px; margin-left:2px; animation:fh-caret 1s steps(1) infinite; }
@keyframes fh-caret { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
.fh-attach { display:inline-flex; align-items:center; gap:6px; margin-top:12px; font-size:11.5px; font-weight:600; color:${C.maroonDeep}; background:rgba(169,56,56,.08); border:1px solid rgba(169,56,56,.2); border-radius:99px; padding:6px 13px; animation:fh-clip 7s ease-in-out infinite; }
@keyframes fh-clip { 0%,55% { opacity:0; transform:translateY(8px); } 66%,92% { opacity:1; transform:translateY(0); } 100% { opacity:0; } }

/* 04 CHASER — message sends and fades */
.fh-msg { max-width:82%; background:${C.card}; border:1px solid ${C.line}; border-radius:14px 14px 14px 4px; padding:12px 15px; font-size:12.5px; line-height:1.55; animation:fh-send 7s cubic-bezier(.16,1,.3,1) infinite; }
.fh-msg .who { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:${C.muted}; margin-bottom:5px; }
@keyframes fh-send { 0% { opacity:0; transform:translateY(14px); } 12%,68% { opacity:1; transform:translateY(0); } 84%,100% { opacity:0; transform:translateY(-8px); } }
.fh-sent { margin-top:10px; font-size:11px; font-weight:600; color:${C.green}; animation:fh-send 7s cubic-bezier(.16,1,.3,1) infinite; animation-delay:.35s; }
.fh-msg2 { max-width:82%; margin-top:14px; background:rgba(169,56,56,.06); border:1px solid rgba(169,56,56,.16); border-radius:14px 14px 14px 4px; padding:12px 15px; font-size:12.5px; line-height:1.55; animation:fh-send 7s cubic-bezier(.16,1,.3,1) infinite; animation-delay:3.4s; }

@media (prefers-reduced-motion:reduce){ .fh-demo * { animation:none !important; opacity:1 !important; transform:none !important; } }
`;

const STEP_DEMOS: Record<string, ReactElement> = {
  extract: (
    <div className="fh-demo" aria-hidden="true">
      <div className="fh-doc">
        <div className="ln w1" /><div className="ln w2" /><div className="ln w3" /><div className="ln w2" />
      </div>
      <div className="fh-field f1"><small>Amount</small>₹1,24,500</div>
      <div className="fh-field f2"><small>GSTIN</small>27AAB…1Z5</div>
      <div className="fh-field f3"><small>Counterparty</small>Shree Traders</div>
      <div className="fh-conf">3 fields extracted · 98% confidence</div>
    </div>
  ),
  recon: (
    <div className="fh-demo" aria-hidden="true">
      <div className="fh-rrow"><span className="fh-chip bank">BANK ₹41,200</span><span className="fh-link" /><span className="fh-chip inv">INV-2288</span></div>
      <div className="fh-rrow"><span className="fh-chip bank">BANK ₹18,000</span><span className="fh-link" /><span className="fh-chip inv">INV-2290</span></div>
      <div className="fh-rrow"><span className="fh-chip bank">BANK ₹4,120</span><span className="fh-link" /><span className="fh-chip nomatch">no match yet</span></div>
      <div className="fh-demo-cap" style={{ marginTop: 16 }}><i />421 matched · 2 exceptions <span className="pill">this cycle</span></div>
    </div>
  ),
  narrate: (
    <div className="fh-demo" aria-hidden="true">
      <div className="fh-narr">
        <span className="typed">ITC reversed under Rule 42 — ₹12,480 moved to blocked credit for the August cycle.</span>
        <span className="caret" />
        <br />
        <span className="fh-attach">Source attached · GSTR-2B_Aug.pdf</span>
      </div>
      <div className="fh-demo-cap" style={{ marginTop: 14 }}><i />Drafted · waiting for partner review</div>
    </div>
  ),
  chaser: (
    <div className="fh-demo" aria-hidden="true">
      <div className="fh-msg">
        <div className="who">FynHelp · to client</div>
        Gentle reminder — the August bank statement for the current account is still pending. Sharing it today keeps your books on schedule.
      </div>
      <div className="fh-sent">Sent · will ask once more in 3 days if needed</div>
      <div className="fh-msg2">
        <div className="who">FynHelp · to client</div>
        One more nudge — the August statement lets us close your recon. Reply with the file and we take it from there.
      </div>
    </div>
  ),
};

const STEPS = [
  {
    no: "01",
    name: "Extract",
    d: "Documents classified, read and lifted into structured lines — amount, date, GSTIN, counterparty. Any PDF, scan or email attachment, no templates, no manual keying.",
  },
  {
    no: "02",
    name: "Recon",
    d: "Bank lines drift toward ledger lines and lock. What does not lock stays visible with a reason code — a step in the process, not a failure.",
  },
  {
    no: "03",
    name: "Narrate",
    d: "A narration writes itself out and clips its source document to the end. Deliberate, reviewable, and nothing ever sends itself — a partner always approves.",
  },
  {
    no: "04",
    name: "Chaser",
    d: "A quiet, polite nudge that sends and fades. If something is still missing, it asks once more. Your team stops chasing clients by phone.",
  },
];

export default function PipelinePage() {
  return (
    <SiteShell>
      <style>{STYLES}</style>

      <section className="fh-phero center">
        <div className="fh-wrap">
          <div className="in">
            <Reveal>
              <div>
                <span className="fh-kicker">The pipeline</span>
                <h1>
                  Documents in. <span className="ital">Decisions out.</span>
                </h1>
                <p className="sub" style={{ marginInline: "auto" }}>
                  Four deliberate steps run on every client entity: Extract, Recon, Narrate and
                  Chaser. Each one is visible, reviewable, and traceable back to its source.
                </p>
                <div className="acts" style={{ justifyContent: "center" }}>
                  <Link to="/signup" className="fh-btn fh-btn-primary">Start 30-day trial</Link>
                  <Link to="/waitlist" className="fh-btn fh-btn-ghost">Book a demo</Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FOUR STEPS */}
      <Section kicker="How it works" title="Four steps," italic="always in order." alt>
        <div className="fh-steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.no} delay={i * 80}>
              <div className="fh-step">
                <div className="no">{s.no}</div>
                <h3>{s.name}</h3>
                <p className="sd">{s.d}</p>
                {STEP_DEMOS[s.name.toLowerCase()]}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* AGENT MODELS */}
      <Section
        kicker="The modules"
        title="Four modules are"
        italic="the pipeline."
        lead="Extract, Recon, Narrate and Chaser are not add-ons. They are the product — every document that comes in travels through all four."
      >
        <div className="fh-grid fh-g2">
          {AGENTS.map((a, i) => (
            <Reveal key={a.slug} delay={i * 70}>
              <Link to={`/agents/${a.slug}`} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
                <div className="fh-card">
                  <span className="fh-kicker">{a.kicker}</span>
                  <h3 style={{ marginTop: 10 }}>{a.name}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: C.body, marginTop: 8 }}>{a.sub}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                    {a.outputs.map((o) => (
                      <span
                        key={o}
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          padding: "5px 11px",
                          borderRadius: 999,
                          background: "rgba(169,56,56,.07)",
                          color: C.maroonDeep,
                        }}
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.maroon, marginTop: 18 }}>
                    Explore the module
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* USE CASES */}
      <Section
        kicker="Use cases"
        title="Where firms put it"
        italic="to work first."
        alt
      >
        <div className="fh-grid fh-g3">
          {[
            { t: "Month-end close, minus the chase", d: "Chaser collects pending statements before the close starts, and Recon leaves only genuine exceptions for review." },
            { t: "ITC that survives scrutiny", d: "Every claimed rupee of input credit carries its GSTR-2B line and the original invoice behind it." },
            { t: "Client reporting in your brand", d: "White-label MIS outputs go out with your firm's name, drafted by Narrate and approved by a partner." },
            { t: "Onboarding a new client in days", d: "Extract reads the backlog of PDFs and scans, so a new entity is current within the first week." },
            { t: "Collections without awkward calls", d: "Chaser nudges overdue clients politely, asks once more if needed, and escalates to you with full history." },
            { t: "Practice visibility", d: "Per-client match rates, open exceptions and pending documents in one view for the whole firm." },
          ].map((u, i) => (
            <Reveal key={u.t} delay={i * 60}>
              <div className="fh-card">
                <h3 style={{ fontSize: 16.5 }}>{u.t}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.65, color: C.body, marginTop: 8 }}>{u.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={140}>
          <p style={{ textAlign: "center", marginTop: 30, fontSize: 14 }}>
            <Link to="/use-cases" style={{ color: C.maroon, fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.maroon}` }}>
              Browse use cases by industry
            </Link>
          </p>
        </Reveal>
      </Section>

      <CtaBand
        title="Watch the pipeline run"
        italic="on your own books."
        lead="Thirty days free. Upload one client's documents and see Extract, Recon and Narrate work end to end."
        primary={{ to: "/signup", label: "Start 30-day trial" }}
        secondary={{ to: "/pricing", label: "See pricing" }}
      />
    </SiteShell>
  );
}
