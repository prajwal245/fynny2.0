import { useEffect, useState } from "react";
import { FileSearch, GitCompareArrows, PenLine, Send, Check } from "lucide-react";

/* ─────────────────────────────────────────────────────────
   Fyn Intelligence — four agents, one pipeline.
   Each agent runs a real, visible micro-animation of the
   work it does. Restrained, editorial, no "AI glow" clichés.
   ───────────────────────────────────────────────────────── */

const MAROON = "#A93838";
const GOLD = "#C79A3C";
const BLUSH = "#E8B9B9";
const GREEN = "#4FB08A";

type Agent = {
  id: string;
  n: string;
  icon: typeof FileSearch;
  accent: string;
  desc: string;
  working: string;
  done: string;
};

const AGENTS: Agent[] = [
  {
    id: "extract",
    n: "Extract",
    icon: FileSearch,
    accent: GOLD,
    desc: "Documents classified, read and lifted into structured lines — amount, date, GSTIN, counterparty.",
    working: "Reading INV-4515.pdf",
    done: "3 fields extracted · 98% confidence",
  },
  {
    id: "recon",
    n: "Recon",
    icon: GitCompareArrows,
    accent: MAROON,
    desc: "Bank lines drift toward ledger lines and lock. What doesn't lock stays visible — a step, not a failure.",
    working: "Matching 423 transactions",
    done: "421 matched · 2 exceptions",
  },
  {
    id: "narrate",
    n: "Narrate",
    icon: PenLine,
    accent: BLUSH,
    desc: "A narration writes itself out and clips its source document to the end. Deliberate, reviewable.",
    working: "Drafting GSTR-3B note",
    done: "Drafted · source attached",
  },
  {
    id: "chaser",
    n: "Chaser",
    icon: Send,
    accent: GOLD,
    desc: "A quiet, polite nudge that sends and fades. If something is still missing, it asks once more.",
    working: "Nudging 4 clients",
    done: "Aug statement received",
  },
];

const CYCLE = 4200;

const CSS = `
.fyn-int { position:relative; overflow:hidden; }
.fyn-int .fyn-grid {
  display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:36px;
}
@media (max-width:1080px){ .fyn-int .fyn-grid { grid-template-columns:repeat(2,1fr); } }
@media (max-width:600px){ .fyn-int .fyn-grid { grid-template-columns:1fr; gap:14px; } }

.fyn-agent {
  position:relative; border-radius:18px; height:100%;
  border:1px solid rgba(246,239,226,.10);
  background:linear-gradient(180deg, rgba(255,253,248,.045), rgba(255,253,248,.015));
  padding:22px 20px 18px; display:flex; flex-direction:column; gap:13px;
  transition:border-color .5s ease, transform .5s cubic-bezier(.16,1,.3,1), background .5s ease;
}
.fyn-agent.on { border-color:color-mix(in srgb, var(--a) 55%, transparent); transform:translateY(-4px); background:linear-gradient(180deg, rgba(255,253,248,.075), rgba(255,253,248,.02)); }
.fyn-agent::after {
  content:''; position:absolute; left:20px; right:20px; top:-1px; height:1px; opacity:0;
  background:linear-gradient(90deg, transparent, var(--a), transparent); transition:opacity .5s ease;
}
.fyn-agent.on::after { opacity:1; }

.fyn-head { display:flex; align-items:center; gap:12px; }
.fyn-orb {
  width:40px; height:40px; border-radius:12px; flex:0 0 auto;
  display:flex; align-items:center; justify-content:center; color:#1B0F08;
  background:var(--a); transition:box-shadow .5s ease;
}
.fyn-agent.on .fyn-orb { box-shadow:0 8px 26px -10px var(--a); }
.fyn-num { font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:rgba(246,239,226,.38); }
.fyn-agent h3 { font-size:19px; color:#FBF6EC; margin:0; }
.fyn-agent p.d { font-size:13px; line-height:1.65; color:rgba(246,239,226,.55); margin:0; }

/* stage */
.fyn-stage { position:relative; height:104px; border-radius:12px; overflow:hidden; margin-top:auto;
  background:rgba(10,6,3,.34); border:1px solid rgba(246,239,226,.07); padding:12px; }
.fyn-cap { display:flex; align-items:center; gap:7px; font-size:11.5px; color:rgba(246,239,226,.72); margin-top:10px; min-height:17px; }
.fyn-cap .tick { width:14px; height:14px; border-radius:50%; background:${GREEN}; color:#08150F; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
.fyn-cap .spin { width:12px; height:12px; border-radius:50%; border:1.5px solid rgba(246,239,226,.25); border-top-color:var(--a); animation:fyn-spin .9s linear infinite; flex:0 0 auto; }
@keyframes fyn-spin { to { transform:rotate(360deg); } }

/* 1 · extract */
.fx-doc { position:relative; height:100%; border-radius:8px; background:rgba(246,239,226,.05); border:1px solid rgba(246,239,226,.08); padding:10px; overflow:hidden; }
.fx-line { height:5px; border-radius:3px; background:rgba(246,239,226,.16); margin-bottom:7px; }
.fx-line.w1 { width:64%; } .fx-line.w2 { width:88%; } .fx-line.w3 { width:44%; } .fx-line.w4 { width:74%; }
.fyn-agent.on .fx-line { animation:fx-fill .6s ease both; }
.fyn-agent.on .fx-line:nth-child(2){ animation-delay:.5s; }
.fyn-agent.on .fx-line:nth-child(3){ animation-delay:1.0s; }
.fyn-agent.on .fx-line:nth-child(4){ animation-delay:1.5s; }
.fyn-agent.on .fx-line:nth-child(5){ animation-delay:2.0s; }
@keyframes fx-fill { from { background:rgba(246,239,226,.16); } to { background:color-mix(in srgb, var(--a) 70%, transparent); } }
.fx-scan { position:absolute; left:0; right:0; height:26px; top:-30px;
  background:linear-gradient(180deg, transparent, color-mix(in srgb, var(--a) 26%, transparent), transparent); }
.fyn-agent.on .fx-scan { animation:fx-scan 2.6s cubic-bezier(.5,0,.5,1) infinite; }
@keyframes fx-scan { 0%{ top:-30px; } 100%{ top:104px; } }
.fx-chip { position:absolute; right:9px; bottom:8px; font-size:9.5px; letter-spacing:.06em; padding:3px 8px; border-radius:999px;
  background:color-mix(in srgb, var(--a) 22%, transparent); color:#FBF6EC; opacity:.45; }
.fyn-agent.on .fx-chip { animation:fyn-pop .5s ease 2.4s both; }
@keyframes fyn-pop { from{ opacity:0; transform:translateY(6px) scale(.96);} to{ opacity:1; transform:none;} }

/* 2 · recon */
.rc { position:relative; height:100%; display:grid; grid-template-columns:1fr 1fr; gap:8px; align-content:start; }
.rc-row { display:flex; align-items:center; height:16px; border-radius:5px; font-size:9.5px; padding:0 7px;
  background:rgba(246,239,226,.08); color:rgba(246,239,226,.6); font-variant-numeric:tabular-nums; }
.fyn-agent.on .rc-l { animation:rc-l .9s cubic-bezier(.16,1,.3,1) both; }
.fyn-agent.on .rc-r { animation:rc-r .9s cubic-bezier(.16,1,.3,1) both; }
.fyn-agent.on .rc-d2 { animation-delay:.35s; }
.fyn-agent.on .rc-d3 { animation-delay:.7s; }
@keyframes rc-l { from{ transform:translateX(-26px); opacity:0;} to{ transform:none; opacity:1;} }
@keyframes rc-r { from{ transform:translateX(26px); opacity:0;} to{ transform:none; opacity:1;} }
.rc-ok { background:rgba(79,176,138,.18); color:#BFE9D6; }
.rc-ex { background:rgba(169,56,56,.24); color:#F0C9C9; }
.rc-link { position:absolute; left:50%; width:10px; height:1px; background:rgba(246,239,226,.3); transform:translateX(-50%); }

/* 3 · narrate */
.nr { height:100%; font-size:11.5px; line-height:1.6; color:rgba(246,239,226,.8); }
.nr b { color:#FBF6EC; font-weight:500; }
.nr-type { display:inline-block; overflow:hidden; white-space:nowrap; vertical-align:bottom; max-width:100%; border-right:1.5px solid var(--a); }
.fyn-agent.on .nr-type { animation:nr-type 2.2s steps(38,end) both, nr-caret .7s step-end infinite; }
@keyframes nr-type { from { width:0; } to { width:100%; } }
@keyframes nr-caret { 50% { border-color:transparent; } }
.nr-clip { display:inline-flex; align-items:center; gap:6px; margin-top:9px; font-size:9.5px; padding:4px 8px; border-radius:6px;
  background:rgba(246,239,226,.08); color:rgba(246,239,226,.7); opacity:.45; }
.fyn-agent.on .nr-clip { animation:fyn-pop .5s ease 2.4s both; }

/* 4 · chaser */
.ch { position:relative; height:100%; display:flex; flex-direction:column; justify-content:center; gap:8px; }
.ch-bubble { align-self:flex-end; max-width:82%; font-size:10.5px; line-height:1.45; padding:7px 10px; border-radius:12px 12px 3px 12px;
  background:color-mix(in srgb, var(--a) 26%, transparent); color:#FBF6EC; opacity:.45; }
.fyn-agent.on .ch-bubble { animation:ch-send .7s cubic-bezier(.16,1,.3,1) .2s both; }
@keyframes ch-send { from{ opacity:0; transform:translate(14px,8px) scale(.94);} to{ opacity:1; transform:none;} }
.ch-reply { align-self:flex-start; max-width:78%; font-size:10.5px; padding:7px 10px; border-radius:12px 12px 12px 3px;
  background:rgba(246,239,226,.09); color:rgba(246,239,226,.78); opacity:.45; }
.fyn-agent.on .ch-reply { animation:ch-recv .7s cubic-bezier(.16,1,.3,1) 1.9s both; }
@keyframes ch-recv { from{ opacity:0; transform:translate(-14px,8px) scale(.94);} to{ opacity:1; transform:none;} }

/* idle resting state — still readable, just quiet */
.fyn-agent:not(.on) .ch-bubble,
.fyn-agent:not(.on) .ch-reply,
.fyn-agent:not(.on) .fx-chip,
.fyn-agent:not(.on) .nr-clip { opacity:.42; }
.fyn-agent:not(.on) .nr-type { border-right-color:transparent; }

/* pipeline */
.fyn-pipe { margin-top:34px; border-radius:18px; padding:22px; border:1px solid rgba(246,239,226,.09);
  background:linear-gradient(180deg, rgba(246,239,226,.05), rgba(246,239,226,.015)); }
.fyn-track { position:relative; height:3px; border-radius:999px; background:rgba(246,239,226,.12); }
.fyn-fill { position:absolute; inset:0 auto 0 0; border-radius:999px; background:linear-gradient(90deg, ${GOLD}, ${MAROON}); transition:width ${CYCLE}ms linear; }
.fyn-node { position:absolute; top:50%; width:11px; height:11px; border-radius:50%; margin-left:-5.5px; transform:translateY(-50%);
  background:#2A150F; border:1.5px solid rgba(246,239,226,.3); transition:background .4s ease, border-color .4s ease, box-shadow .4s ease; }
.fyn-node.on { background:${GOLD}; border-color:${GOLD}; box-shadow:0 0 0 5px rgba(199,154,60,.16); }
.fyn-pipe-labels { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:16px; }
.fyn-pipe-labels div { font-size:10.5px; letter-spacing:.13em; text-transform:uppercase; color:rgba(246,239,226,.45); transition:color .4s ease; }
.fyn-pipe-labels div b { display:block; font-size:13px; letter-spacing:0; text-transform:none; color:rgba(251,246,236,.72); font-weight:500; margin-bottom:3px; transition:color .4s ease; }
.fyn-pipe-labels div.on { color:rgba(246,239,226,.7); }
.fyn-pipe-labels div.on b { color:#FBF6EC; }
@media (max-width:640px){ .fyn-pipe-labels { grid-template-columns:repeat(2,1fr); } }
/* ── refinement layer: richer, more physical motion ── */
.fyn-agent { will-change:transform; }
.fyn-agent.on { transform:translateY(-6px) scale(1.012); box-shadow:0 40px 70px -50px var(--a); }
.fyn-agent::before { content:''; position:absolute; inset:-1px; border-radius:18px; pointer-events:none; opacity:0;
  background:radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--a) 22%, transparent), transparent 62%);
  transition:opacity .6s ease; }
.fyn-agent.on::before { opacity:1; }
.fyn-agent.on .fyn-orb { animation:fyn-breathe 2.6s ease-in-out infinite; }
@keyframes fyn-breathe { 0%,100%{ transform:translateY(0) rotate(0deg);} 50%{ transform:translateY(-2px) rotate(-1.5deg);} }
.fyn-stage { transition:background .5s ease, border-color .5s ease; }
.fyn-agent.on .fyn-stage { background:rgba(10,6,3,.5); border-color:color-mix(in srgb, var(--a) 26%, transparent); }
.fyn-cap { transition:color .4s ease; }

/* extract — field chips lift out of the page as they're read */
.fx-doc::after { content:''; position:absolute; inset:0; opacity:0;
  background:linear-gradient(100deg, transparent 40%, color-mix(in srgb, var(--a) 14%, transparent) 50%, transparent 60%); }
.fyn-agent.on .fx-doc::after { opacity:1; animation:fx-sheen 2.6s cubic-bezier(.5,0,.5,1) infinite; }
@keyframes fx-sheen { 0%{ transform:translateX(-100%);} 100%{ transform:translateX(100%);} }
.fyn-agent.on .fx-line { animation:fx-fill .55s cubic-bezier(.16,1,.3,1) both, fx-nudge .55s cubic-bezier(.16,1,.3,1) both; }
@keyframes fx-nudge { from{ transform:translateX(-6px); opacity:.5;} to{ transform:none; opacity:1;} }

/* recon — lines drift, then snap and lock */
.fyn-agent.on .rc-l, .fyn-agent.on .rc-r { animation-duration:1.05s; }
.fyn-agent.on .rc-ok { animation-name:rc-snap-l, rc-lock; animation-duration:.95s,.5s; animation-fill-mode:both,both; animation-timing-function:cubic-bezier(.16,1,.3,1),ease-out; }
.fyn-agent.on .rc-r.rc-ok { animation-name:rc-snap-r, rc-lock; }
@keyframes rc-snap-l { 0%{ transform:translateX(-30px); opacity:0;} 65%{ transform:translateX(3px); opacity:1;} 100%{ transform:none;} }
@keyframes rc-snap-r { 0%{ transform:translateX(30px); opacity:0;} 65%{ transform:translateX(-3px); opacity:1;} 100%{ transform:none;} }
@keyframes rc-lock { 0%{ box-shadow:0 0 0 0 rgba(79,176,138,0);} 60%{ box-shadow:0 0 0 3px rgba(79,176,138,.22);} 100%{ box-shadow:0 0 0 0 rgba(79,176,138,0);} }
.fyn-agent.on .rc-ex { animation:rc-shake .5s ease .8s both; }
@keyframes rc-shake { 0%,100%{ transform:translateX(0);} 25%{ transform:translateX(-3px);} 75%{ transform:translateX(3px);} }
.rc-link { transition:opacity .4s ease; }
.fyn-agent.on .rc-link { animation:rc-draw .5s ease .55s both; }
@keyframes rc-draw { from{ width:0; opacity:0;} to{ width:10px; opacity:1;} }

/* narrate — line highlights as it writes, then the clip snaps on */
.fyn-agent.on .nr-type { animation:nr-type 2.1s steps(40,end) both, nr-caret .65s step-end infinite; }
.fyn-agent.on .nr-clip { animation:fyn-pop .45s cubic-bezier(.16,1,.3,1) 2.35s both, nr-attach .5s ease 2.35s both; }
@keyframes nr-attach { 0%{ transform:translateY(8px) rotate(-4deg);} 100%{ transform:none; } }

/* chaser — typing dots, then send, then reply */
.ch-dots { align-self:flex-start; display:inline-flex; gap:4px; padding:6px 9px; border-radius:12px; background:rgba(246,239,226,.08); opacity:0; }
.ch-dots i { width:4px; height:4px; border-radius:50%; background:rgba(246,239,226,.6); display:block; }
.fyn-agent.on .ch-dots { animation:ch-dots-in .3s ease 1.1s both, ch-dots-out .3s ease 1.8s both; }
@keyframes ch-dots-in { from{ opacity:0; transform:translateY(6px);} to{ opacity:1; transform:none;} }
@keyframes ch-dots-out { to{ opacity:0; transform:translateY(-4px);} }
.fyn-agent.on .ch-dots i { animation:ch-blink 1s ease-in-out infinite; }
.fyn-agent.on .ch-dots i:nth-child(2){ animation-delay:.15s; }
.fyn-agent.on .ch-dots i:nth-child(3){ animation-delay:.3s; }
@keyframes ch-blink { 0%,100%{ opacity:.3; transform:translateY(0);} 50%{ opacity:1; transform:translateY(-2px);} }

/* pipeline — a light travels the track */
.fyn-track { overflow:hidden; }
.fyn-track::after { content:''; position:absolute; top:0; bottom:0; width:60px; border-radius:999px;
  background:linear-gradient(90deg, transparent, rgba(255,244,225,.85), transparent); animation:fyn-travel 3.2s linear infinite; }
@keyframes fyn-travel { 0%{ transform:translateX(-70px);} 100%{ transform:translateX(calc(100% + 100vw));} }
.fyn-node.on { animation:fyn-node-pop .5s cubic-bezier(.16,1,.3,1); }
@keyframes fyn-node-pop { 0%{ transform:translateY(-50%) scale(.7);} 60%{ transform:translateY(-50%) scale(1.25);} 100%{ transform:translateY(-50%) scale(1);} }

@media (max-width:600px){ .fyn-stage{ height:96px; } .fyn-agent{ padding:18px 16px 16px; } }
@media (prefers-reduced-motion: reduce){ .fyn-int *,.fyn-int *::before,.fyn-int *::after { animation:none !important; transition:none !important; } }
`;


function Stage({ id }: { id: string }) {
  if (id === "extract") {
    return (
      <div className="fx-doc">
        <span className="fx-scan" />
        <div className="fx-line w2" />
        <div className="fx-line w1" />
        <div className="fx-line w4" />
        <div className="fx-line w3" />
        <span className="fx-chip">₹1,24,500 · 27AAB…1Z5</span>
      </div>
    );
  }
  if (id === "recon") {
    return (
      <div className="rc">
        <span className="rc-link" style={{ top: 8 }} />
        <div className="rc-row rc-l rc-ok">BANK ₹41,200</div>
        <div className="rc-row rc-r rc-ok">INV-2288</div>
        <div className="rc-row rc-l rc-d2 rc-ok">BANK ₹18,000</div>
        <div className="rc-row rc-r rc-d2 rc-ok">INV-2290</div>
        <div className="rc-row rc-l rc-d3 rc-ex">BANK ₹4,120</div>
        <div className="rc-row rc-r rc-d3 rc-ex">no match</div>
      </div>
    );
  }
  if (id === "narrate") {
    return (
      <div className="nr">
        <span className="nr-type">ITC reversed under Rule 42 — ₹12,480</span>
        <span className="nr-clip">📎 GSTR-2B_Aug.pdf</span>
      </div>
    );
  }
  return (
    <div className="ch">
      <div className="ch-bubble">Hi Ramesh — August bank statement pending. Upload here?</div>
      <div className="ch-dots" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="ch-reply">Sent just now ✓</div>
    </div>
  );

}

export default function FynIntelligence() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((v) => (v + 1) % AGENTS.length), CYCLE);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      className="fh-sec fh-dark fyn-int"
      id="fyn-intelligence"
      style={{ background: "radial-gradient(80% 120% at 85% 0%, rgba(226,103,63,.28), transparent 60%), linear-gradient(150deg,#241C15,#0E0B06)", color: "#F6EFE2" }}
    >
      <style>{CSS}</style>
      <div className="fh-wrap">
        <span className="fh-kicker">Fyn Intelligence</span>
        <h2 className="fh-h2" style={{ color: "#FDF8EF" }}>
          One pipeline, four jobs
        </h2>
        <p className="fh-lead">
          Watch the work itself: a document being read, bank lines locking to ledger lines, a narration typing
          out with its source clipped on, and a follow-up that sends and closes.
        </p>

        <div className="fyn-grid">
          {AGENTS.map((a, i) => {
            const on = i === active;
            const Icon = a.icon;
            return (
              <div
                key={a.id}
                className={`fyn-agent${on ? " on" : ""}`}
                style={{ ["--a" as string]: a.accent }}
              >
                <div className="fyn-head">
                  <div className="fyn-orb">
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="fyn-num">{`0${i + 1}`}</div>
                    <h3>{a.n}</h3>
                  </div>
                </div>
                <p className="d">{a.desc}</p>
                <div className="fyn-stage">
                  <Stage key={on ? `${a.id}-${active}` : a.id} id={a.id} />
                </div>
                <div className="fyn-cap">
                  {on ? (
                    <>
                      <span className="spin" />
                      {a.working}…
                    </>
                  ) : (
                    <>
                      <span className="tick">
                        <Check size={9} strokeWidth={3.5} />
                      </span>
                      {a.done}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="fyn-pipe">
          <div className="fyn-track">
            <span className="fyn-fill" style={{ width: `${((active + 1) / AGENTS.length) * 100}%` }} />
            {AGENTS.map((a, i) => (
              <span
                key={a.id}
                className={`fyn-node${i <= active ? " on" : ""}`}
                style={{ left: `${(i / (AGENTS.length - 1)) * 100}%` }}
              />
            ))}
          </div>
          <div className="fyn-pipe-labels">
            <div className={active === 0 ? "on" : ""}><b>Extract</b>raw material in</div>
            <div className={active === 1 ? "on" : ""}><b>Recon</b>lines lock together</div>
            <div className={active === 2 ? "on" : ""}><b>Narrate</b>drafted with source</div>
            <div className={active === 3 ? "on" : ""}><b>Chaser</b>only if something&rsquo;s missing</div>
          </div>
        </div>
      </div>
    </section>
  );
}
