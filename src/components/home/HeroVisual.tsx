import { useEffect, useState } from "react";
import {
  Check,
  AlertTriangle,
  Download,
  ScanLine,
  GitCompareArrows,
  MessageSquareText,
  PenLine,
  FileCheck2,
  Stamp,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
   Hero visual — one real month-end close, run by six agents
   in sequence. Each agent owns its own animation on the
   stage panel: Collect → Extract → Match → Chaser →
   Narrate → Sign-off. Full working pass is 7s, then holds.
   ───────────────────────────────────────────────────────── */

const ROWS = [
  { id: "HDFC · NEFT", party: "Meghna Textiles", amt: "₹4,12,000", ref: "INV-2288", ok: true },
  { id: "ICICI · UPI", party: "Suraj Enterprises", amt: "₹18,400", ref: "INV-2290", ok: true },
  { id: "HDFC · IMPS", party: "Blue Orbit Media", amt: "₹96,750", ref: "INV-2291", ok: true },
  { id: "Axis · NEFT", party: "Kalyani Logistics", amt: "₹4,120", ref: "amount variance", ok: false },
  { id: "HDFC · ACH", party: "Sunvale Packaging", amt: "₹2,08,900", ref: "INV-2294", ok: true },
];

const STAGES = [
  { key: "collect", label: "Collect", note: "Pulling HDFC · ICICI · Axis feeds", Icon: Download, at: [0, 1150] },
  { key: "extract", label: "Extract", note: "Reading refs, GST & TDS off the bills", Icon: ScanLine, at: [1150, 2450] },
  { key: "match", label: "Match", note: "Bank ↔ ledger at 1% tolerance", Icon: GitCompareArrows, at: [2450, 4100] },
  { key: "chaser", label: "Chaser", note: "Asking the client for the missing bill", Icon: MessageSquareText, at: [4100, 5300] },
  { key: "narrate", label: "Narrate", note: "Writing the variance note", Icon: PenLine, at: [5300, 6250] },
  { key: "signoff", label: "Sign-off", note: "Packing 1 exception for the partner", Icon: FileCheck2, at: [6250, 7000] },
] as const;

const CYCLE = 9200; // 7s of work + hold

const FEEDS = [
  { n: "HDFC Bank", d: "Current · 4412", lines: 2 },
  { n: "ICICI Bank", d: "Current · 8890", lines: 1 },
  { n: "Axis Bank", d: "Escrow · 2210", lines: 2 },
];

const FIELDS = [
  { k: "Invoice no.", v: "INV-2294" },
  { k: "Taxable value", v: "₹1,77,034" },
  { k: "GST 18%", v: "₹31,866" },
  { k: "TDS 194C", v: "₹3,540" },
];

const NARRATION = "Part receipt against INV-2294 — balance ₹1,96,780 due 08 Sep. Client confirmed on WhatsApp.";

const LOG = [
  { t: 320, s: "3 bank feeds connected · 5 new lines" },
  { t: 1500, s: "Refs read on 5 lines · 0 manual entry" },
  { t: 2950, s: "4 lines tied out to the ledger" },
  { t: 3900, s: "1 variance held back · ₹4,120" },
  { t: 4650, s: "WhatsApp sent to Kalyani Logistics" },
  { t: 5150, s: "Client replied with the missing bill" },
  { t: 5900, s: "Reason code written · short receipt" },
  { t: 6700, s: "Exception pack queued for partner" },
];

const BARS = [38, 52, 44, 66, 58, 74, 63, 88, 71, 92];

const CSS = `
.hv { position:relative; margin:56px auto 0; max-width:1060px; }
.hv-glow { position:absolute; left:50%; top:-56px; width:min(820px,94%); height:250px; transform:translateX(-50%);
  background:radial-gradient(50% 60% at 50% 50%, rgba(226,103,63,.42), rgba(169,56,56,.16) 45%, transparent 72%);
  filter:blur(30px); pointer-events:none; }
.hv-shell { position:relative; border-radius:26px; background:#FFFDF9; border:1px solid rgba(23,18,8,.08);
  box-shadow:0 70px 130px -64px rgba(23,18,8,.6), 0 2px 0 rgba(255,255,255,.85) inset; overflow:hidden; text-align:left; }
.hv-top { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 16px; border-bottom:1px solid rgba(23,18,8,.055); }
.hv-dots { display:flex; gap:6px; }
.hv-dots i { width:9px; height:9px; border-radius:50%; background:rgba(23,18,8,.12); display:block; }
.hv-dots i:first-child { background:rgba(226,103,63,.55); }
.hv-title { font-size:12px; font-weight:600; letter-spacing:-.01em; color:rgba(23,18,8,.72); }
.hv-live { display:inline-flex; align-items:center; gap:7px; font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#1F5A46; white-space:nowrap; }
.hv-live i { width:7px; height:7px; border-radius:50%; background:#1F5A46; animation:hv-beat 2s ease-in-out infinite; }
@keyframes hv-beat { 0%,100%{ transform:scale(1); opacity:1;} 50%{ transform:scale(1.45); opacity:.4;} }

/* agent rail with a flowing track */
.hv-railwrap { position:relative; padding:14px 14px 12px; border-bottom:1px solid rgba(23,18,8,.055); background:linear-gradient(180deg,rgba(23,18,8,.022),transparent); }
.hv-track { position:absolute; left:22px; right:22px; top:0; height:2px; background:rgba(23,18,8,.07); overflow:hidden; }
.hv-track i { display:block; height:100%; background:linear-gradient(90deg,#E2673F,#A93838); transition:width .18s linear; }
.hv-rail { display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
@media (max-width:900px){ .hv-rail{ grid-template-columns:repeat(3,1fr); } }
@media (max-width:520px){ .hv-rail{ grid-template-columns:repeat(2,1fr); } }
.hv-agent { position:relative; display:flex; align-items:center; gap:8px; padding:9px; border-radius:14px; border:1px solid rgba(23,18,8,.07);
  background:#FFFDF9; overflow:hidden; transition:border-color .35s ease, box-shadow .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1), background .4s ease; }
.hv-agent.on { border-color:rgba(226,103,63,.4); box-shadow:0 18px 34px -22px rgba(169,56,56,.95); transform:translateY(-3px); }
.hv-agent.on::before { content:""; position:absolute; inset:0; background:linear-gradient(100deg,transparent,rgba(226,103,63,.1),transparent);
  transform:translateX(-100%); animation:hv-sheen 1.6s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes hv-sheen { to { transform:translateX(100%); } }
.hv-agent.done { border-color:rgba(31,90,70,.22); background:rgba(31,90,70,.035); }
.hv-agent .ic { width:25px; height:25px; flex:0 0 auto; border-radius:9px; display:flex; align-items:center; justify-content:center;
  background:rgba(23,18,8,.06); color:rgba(23,18,8,.4); transition:background .35s ease, color .35s ease, transform .4s cubic-bezier(.16,1,.3,1); }
.hv-agent.on .ic { background:#E2673F; color:#FFF6F1; transform:scale(1.06); }
.hv-agent.done .ic { background:rgba(31,90,70,.14); color:#1F5A46; }
.hv-agent .tx { min-width:0; position:relative; }
.hv-agent .nm { display:block; font-size:11.5px; font-weight:600; color:#171208; letter-spacing:-.01em; }
.hv-agent .st { display:block; font-size:9.5px; color:rgba(23,18,8,.42); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hv-agent.on .st { color:#B8401F; }
.hv-agent .bar { position:absolute; left:0; bottom:0; height:2px; width:0; background:linear-gradient(90deg,#E2673F,#A93838); }
.hv-agent.on .bar { width:var(--p,0%); }
.hv-agent.done .bar { width:100%; background:rgba(31,90,70,.4); }
.hv-nowline { font-size:11.5px; color:rgba(23,18,8,.5); padding:11px 16px 12px; display:flex; align-items:center; gap:8px; }
.hv-nowline b { color:#171208; font-weight:600; }
.hv-nowline em { font-style:normal; width:5px; height:5px; border-radius:50%; background:#E2673F; }

.hv-body { display:grid; grid-template-columns:1.52fr 1fr; }
@media (max-width:900px){ .hv-body{ grid-template-columns:1fr; } }
.hv-left { padding:0 16px 16px; }
.hv-right { padding:16px; border-left:1px solid rgba(23,18,8,.055); display:grid; gap:12px; align-content:start; }
@media (max-width:900px){ .hv-right{ border-left:none; border-top:1px solid rgba(23,18,8,.055); } }

.hv-lbl { font-size:9.5px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:rgba(23,18,8,.42); }

/* feeds */
.hv-feeds { display:flex; gap:7px; margin-top:10px; flex-wrap:wrap; }
.hv-feed { position:relative; display:flex; align-items:center; gap:7px; padding:6px 10px; border-radius:999px; border:1px solid rgba(23,18,8,.08);
  background:rgba(23,18,8,.02); opacity:.4; transition:opacity .45s ease, border-color .45s ease, background .45s ease, transform .45s cubic-bezier(.16,1,.3,1); }
.hv-feed.on { opacity:1; border-color:rgba(31,90,70,.24); background:rgba(31,90,70,.07); transform:translateY(-1px); }
.hv-feed i { width:6px; height:6px; border-radius:50%; background:rgba(23,18,8,.2); display:block; transition:background .4s ease; }
.hv-feed.on i { background:#1F5A46; box-shadow:0 0 0 0 rgba(31,90,70,.45); animation:hv-ping 1.6s ease-out infinite; }
@keyframes hv-ping { 70%{ box-shadow:0 0 0 7px rgba(31,90,70,0);} 100%{ box-shadow:0 0 0 0 rgba(31,90,70,0);} }
.hv-feed span { font-size:10.5px; color:rgba(23,18,8,.7); }
.hv-feed span em { font-style:normal; color:rgba(23,18,8,.4); }
.hv-feed b { font-size:9.5px; font-weight:700; color:#1F5A46; }

.hv-rows { display:grid; gap:7px; margin-top:12px; }
.hv-row { position:relative; display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:12px; font-variant-numeric:tabular-nums;
  background:rgba(23,18,8,.032); border:1px solid transparent; opacity:0; transform:translateY(10px) scale(.99);
  transition:opacity .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1), background .4s ease, border-color .4s ease, box-shadow .4s ease; overflow:hidden; }
.hv-row.in { opacity:1; transform:none; }
.hv-row.scan::after { content:""; position:absolute; top:0; bottom:0; width:38%; pointer-events:none;
  background:linear-gradient(90deg, transparent, rgba(226,103,63,.22), transparent); animation:hv-scan .85s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes hv-scan { from{ transform:translateX(-140%);} to{ transform:translateX(320%);} }
.hv-row.matched { background:rgba(31,90,70,.085); border-color:rgba(31,90,70,.16); box-shadow:0 0 0 3px rgba(31,90,70,.05); animation:hv-snap .45s cubic-bezier(.16,1,.3,1); }
@keyframes hv-snap { 0%{ transform:translateX(4px);} 60%{ transform:translateX(-2px);} 100%{ transform:none;} }
.hv-row.flag { background:rgba(226,103,63,.11); border-color:rgba(226,103,63,.3); animation:hv-shake .5s cubic-bezier(.36,.07,.19,.97); }
@keyframes hv-shake { 10%,90%{ transform:translateX(-1.5px);} 30%,70%{ transform:translateX(2.5px);} 50%{ transform:translateX(-2.5px);} 100%{ transform:none;} }
.hv-row.cleared { background:rgba(31,90,70,.085); border-color:rgba(31,90,70,.16); }
.hv-tick { width:19px; height:19px; border-radius:50%; flex:0 0 auto; display:flex; align-items:center; justify-content:center;
  background:rgba(23,18,8,.08); color:transparent; transition:background .35s ease, color .35s ease, transform .4s cubic-bezier(.16,1,.3,1); }
.hv-row.matched .hv-tick, .hv-row.cleared .hv-tick { background:#1F5A46; color:#EAF7F1; transform:scale(1.08); }
.hv-row.flag .hv-tick { background:#E2673F; color:#2A0F06; }
.hv-src { font-size:10.5px; color:rgba(23,18,8,.4); width:86px; flex:0 0 auto; }
.hv-party { font-size:12.5px; color:rgba(23,18,8,.82); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hv-amt { font-size:12.5px; font-weight:600; color:#171208; }
.hv-ref { font-size:10.5px; color:rgba(23,18,8,.45); width:118px; text-align:right; flex:0 0 auto; transition:opacity .35s ease, transform .35s ease; }
.hv-ref.hide { opacity:0; transform:translateY(-3px); }
.hv-row.flag .hv-ref { color:#B8401F; font-weight:600; }
@media (max-width:640px){ .hv-src{ display:none; } .hv-ref{ width:auto; } }

/* stage panel — one panel per agent, cross-faded */
.hv-stage { position:relative; margin-top:12px; min-height:132px; }
.hv-panel { position:absolute; inset:0; border:1px solid rgba(23,18,8,.07); border-radius:16px; padding:12px; background:rgba(23,18,8,.018);
  opacity:0; transform:translateY(10px) scale(.985); pointer-events:none;
  transition:opacity .45s ease, transform .5s cubic-bezier(.16,1,.3,1); }
.hv-panel.on { opacity:1; transform:none; }
@media (max-width:640px){ .hv-stage{ min-height:170px; } }

/* collect panel */
.hv-pipes { display:grid; gap:6px; margin-top:10px; }
.hv-pipe { display:flex; align-items:center; gap:9px; font-size:11px; color:rgba(23,18,8,.6); }
.hv-pipe .rail { position:relative; flex:1; height:5px; border-radius:99px; background:rgba(23,18,8,.06); overflow:hidden; }
.hv-pipe .rail i { position:absolute; inset:0; width:0; border-radius:99px; background:linear-gradient(90deg,rgba(31,90,70,.35),#1F5A46); transition:width .25s linear; }
.hv-pipe b { font-size:10.5px; font-weight:600; color:#1F5A46; width:58px; text-align:right; }

/* extract panel */
.hv-doc { position:relative; margin-top:10px; border-radius:12px; border:1px solid rgba(23,18,8,.08); background:#FFFDF9; padding:10px 11px; overflow:hidden; }
.hv-doc::after { content:""; position:absolute; left:0; right:0; height:34px; pointer-events:none;
  background:linear-gradient(180deg, rgba(226,103,63,0), rgba(226,103,63,.2), rgba(226,103,63,0));
  animation:hv-sweep 1.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes hv-sweep { from{ top:-34px; } to{ top:100%; } }
.hv-fields { display:grid; grid-template-columns:1fr 1fr; gap:8px 14px; }
@media (max-width:520px){ .hv-fields{ grid-template-columns:1fr; } }
.hv-field { display:flex; align-items:baseline; justify-content:space-between; gap:10px; border-bottom:1px dashed rgba(23,18,8,.1); padding-bottom:5px; }
.hv-field span { font-size:10.5px; color:rgba(23,18,8,.45); }
.hv-field b { font-size:11.5px; font-weight:600; color:#171208; font-variant-numeric:tabular-nums;
  opacity:0; transform:translateY(4px); transition:opacity .35s ease, transform .35s cubic-bezier(.16,1,.3,1); }
.hv-field.on b { opacity:1; transform:none; }
.hv-field.on { border-bottom-color:rgba(31,90,70,.28); }

/* match panel */
.hv-match { display:grid; grid-template-columns:1fr 46px 1fr; align-items:center; gap:8px; margin-top:10px; }
@media (max-width:520px){ .hv-match{ grid-template-columns:1fr; } }
.hv-side { border:1px solid rgba(23,18,8,.08); border-radius:12px; padding:9px 10px; background:#FFFDF9; }
.hv-side .h { font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:rgba(23,18,8,.4); }
.hv-side .l { display:flex; justify-content:space-between; gap:8px; font-size:11.5px; color:rgba(23,18,8,.78); margin-top:6px; font-variant-numeric:tabular-nums; }
.hv-side .l b { color:#171208; font-weight:600; }
.hv-link { display:flex; align-items:center; justify-content:center; }
.hv-link svg { overflow:visible; }
.hv-link path { stroke:#1F5A46; stroke-width:1.6; fill:none; stroke-dasharray:60; stroke-dashoffset:60; animation:hv-draw .9s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes hv-draw { to { stroke-dashoffset:0; } }
.hv-lock { font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#1F5A46; text-align:center; margin-top:8px; }

/* chaser thread */
.hv-msg { display:flex; gap:8px; margin-top:8px; opacity:0; transform:translateY(6px); transition:opacity .4s ease, transform .4s cubic-bezier(.16,1,.3,1); }
.hv-msg.on { opacity:1; transform:none; }
.hv-msg .who { font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:rgba(23,18,8,.38); width:56px; flex:0 0 auto; padding-top:4px; }
.hv-msg .bub { font-size:11.5px; line-height:1.45; color:rgba(23,18,8,.78); background:#FFFDF9; border:1px solid rgba(23,18,8,.07); border-radius:12px; padding:7px 10px; }
.hv-msg.them .bub { background:rgba(31,90,70,.07); border-color:rgba(31,90,70,.16); color:#17452F; }
.hv-typing { display:inline-flex; gap:4px; align-items:center; padding:3px 0; }
.hv-typing i { width:5px; height:5px; border-radius:50%; background:rgba(23,18,8,.3); animation:hv-dot 1s ease-in-out infinite; }
.hv-typing i:nth-child(2){ animation-delay:.15s } .hv-typing i:nth-child(3){ animation-delay:.3s }
@keyframes hv-dot { 0%,100%{ transform:translateY(0); opacity:.35 } 50%{ transform:translateY(-3px); opacity:1 } }

/* narrate panel */
.hv-write { margin-top:10px; border-radius:12px; border:1px solid rgba(23,18,8,.08); background:#FFFDF9; padding:11px 12px;
  font-size:12px; line-height:1.55; color:rgba(23,18,8,.8); min-height:56px; }
.hv-caret { display:inline-block; width:1.5px; height:13px; background:#E2673F; vertical-align:-2px; margin-left:2px; animation:hv-blink .8s steps(1) infinite; }
@keyframes hv-blink { 50%{ opacity:0 } }
.hv-tag { display:inline-flex; align-items:center; gap:6px; margin-top:9px; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  padding:5px 9px; border-radius:999px; background:rgba(226,103,63,.12); color:#B8401F; }

/* sign-off panel */
.hv-sign { display:flex; align-items:center; gap:14px; margin-top:12px; }
.hv-seal { position:relative; width:64px; height:64px; flex:0 0 auto; border-radius:50%; display:flex; align-items:center; justify-content:center;
  border:2px dashed rgba(31,90,70,.4); color:#1F5A46; animation:hv-stamp .7s cubic-bezier(.16,1,.3,1) both; }
@keyframes hv-stamp { 0%{ transform:scale(1.6) rotate(-12deg); opacity:0 } 60%{ transform:scale(.94) rotate(2deg); opacity:1 } 100%{ transform:none; opacity:1 } }
.hv-signtx b { display:block; font-size:13px; font-weight:600; color:#171208; letter-spacing:-.015em; }
.hv-signtx span { display:block; font-size:11.5px; color:rgba(23,18,8,.55); margin-top:3px; }

.hv-foot { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:13px; padding-top:11px; border-top:1px dashed rgba(23,18,8,.1); flex-wrap:wrap; }
.hv-count { font-size:12px; color:rgba(23,18,8,.55); font-variant-numeric:tabular-nums; }
.hv-count b { font-size:19px; font-weight:700; letter-spacing:-.04em; color:#171208; margin-right:5px; }
.hv-note { font-size:11px; color:rgba(23,18,8,.5); }

.hv-stat { border:1px solid rgba(23,18,8,.055); border-radius:16px; padding:13px; background:rgba(255,253,249,.7); }
.hv-stat .v { font-size:25px; font-weight:700; letter-spacing:-.045em; margin-top:4px; font-variant-numeric:tabular-nums; }
.hv-bars { display:flex; align-items:flex-end; gap:5px; height:58px; margin-top:12px; }
.hv-bars span { flex:1; border-radius:5px 5px 2px 2px; background:linear-gradient(180deg,#5C1216,rgba(92,18,22,.18));
  transform-origin:bottom; animation:hv-rise 1s cubic-bezier(.16,1,.3,1) both; }
@keyframes hv-rise { from{ transform:scaleY(.05); opacity:.2;} to{ transform:none; opacity:1;} }
.hv-prog { height:7px; border-radius:99px; background:rgba(23,18,8,.07); margin-top:12px; overflow:hidden; }
.hv-prog i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#E2673F,#A93838); transition:width .3s linear; }
.hv-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:11px; }
.hv-chip { font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; padding:5px 9px; border-radius:999px; background:rgba(23,18,8,.05); color:rgba(23,18,8,.5); transition:background .4s ease, color .4s ease; }
.hv-chip.ok { background:rgba(31,90,70,.12); color:#1F5A46; }

.hv-log { display:grid; gap:7px; margin-top:10px; }
.hv-log li { list-style:none; display:flex; gap:8px; align-items:flex-start; font-size:11px; line-height:1.4; color:rgba(23,18,8,.6);
  opacity:0; transform:translateY(5px); transition:opacity .45s ease, transform .45s cubic-bezier(.16,1,.3,1); }
.hv-log li.on { opacity:1; transform:none; }
.hv-log li i { width:5px; height:5px; border-radius:50%; background:rgba(31,90,70,.55); margin-top:6px; flex:0 0 auto; }
@media (prefers-reduced-motion: reduce){ .hv *{ animation:none !important; transition:none !important; }
  .hv-row,.hv-log li,.hv-msg,.hv-panel{ opacity:1; transform:none; } .hv-panel{ position:relative; margin-bottom:8px; } .hv-stage{ min-height:0; } }
`;

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export default function HeroVisual() {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    const loop = (now: number) => {
      const e = now - start;
      if (e > CYCLE) start = now;
      setT(Math.min(e, CYCLE));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const prog = STAGES.map((s) => seg(t, s.at[0], s.at[1]));
  const active = STAGES.findIndex((s) => t < s.at[1]);
  const stageIdx = active === -1 ? STAGES.length : active;
  const overall = Math.min(1, t / STAGES[STAGES.length - 1].at[1]);

  const shown = Math.floor(prog[0] * ROWS.length + 0.0001);
  const read = Math.floor(prog[1] * ROWS.length + 0.0001);
  const done = Math.floor(prog[2] * ROWS.length + 0.0001);

  const chaseSent = t > 4450;
  const chaseTyping = t > 4700 && t < 5050;
  const chaseReplied = t > 5050;
  const cleared = t > 5950;

  const typed = NARRATION.slice(0, Math.round(seg(t, 5350, 6150) * NARRATION.length));

  const matchedNow = ROWS.slice(0, done).filter((r) => r.ok).length + (cleared ? 1 : 0);
  const counter = 389 + matchedNow;
  const flagged = cleared ? 0 : ROWS.slice(0, done).filter((r) => !r.ok).length;
  const readiness = Math.round(
    58 + 42 * (0.08 * prog[0] + 0.14 * prog[1] + 0.4 * prog[2] + 0.16 * prog[3] + 0.12 * prog[4] + 0.1 * prog[5]),
  );

  const panel = Math.min(stageIdx, STAGES.length - 1);

  return (
    <div className="hv">
      <style>{CSS}</style>
      <div className="hv-glow" aria-hidden />
      <div className="hv-shell">
        <div className="hv-top">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="hv-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="hv-title">August close · Sharma &amp; Co · 38 entities</span>
          </div>
          <span className="hv-live">
            <i /> {stageIdx >= STAGES.length ? "Ready for review" : "Running"}
          </span>
        </div>

        <div className="hv-railwrap" aria-hidden>
          <div className="hv-track">
            <i style={{ width: `${overall * 100}%` }} />
          </div>
          <div className="hv-rail">
            {STAGES.map((a, i) => (
              <div
                key={a.key}
                className={`hv-agent ${stageIdx === i ? "on" : ""} ${stageIdx > i ? "done" : ""}`}
                style={{ ["--p" as string]: `${Math.round(prog[i] * 100)}%` }}
              >
                <span className="ic">
                  {stageIdx > i ? <Check size={13} strokeWidth={3} /> : <a.Icon size={13} strokeWidth={2.2} />}
                </span>
                <span className="tx">
                  <span className="nm">{a.label}</span>
                  <span className="st">{stageIdx > i ? "Done" : stageIdx === i ? "Working" : "Queued"}</span>
                </span>
                <span className="bar" />
              </div>
            ))}
          </div>
        </div>
        <div className="hv-nowline">
          <em />
          <span>
            <b>{STAGES[panel].label}</b> ·{" "}
            {stageIdx >= STAGES.length ? "Close pack ready — 1 note for the partner" : STAGES[panel].note}
          </span>
        </div>

        <div className="hv-body">
          <div className="hv-left">
            <div className="hv-lbl">Live bank ↔ ledger queue</div>
            <div className="hv-feeds">
              {FEEDS.map((f, i) => {
                const on = prog[0] > (i + 0.4) / FEEDS.length;
                return (
                  <span key={f.n} className={`hv-feed ${on ? "on" : ""}`}>
                    <i />
                    <span>
                      {f.n} <em>{f.d}</em>
                    </span>
                    {on && <b>+{f.lines}</b>}
                  </span>
                );
              })}
            </div>
            <div className="hv-rows">
              {ROWS.map((r, i) => {
                const isIn = i < shown;
                const isRead = i < read;
                const isDone = i < done;
                const state = !isDone ? "" : r.ok ? "matched" : cleared ? "cleared" : "flag";
                return (
                  <div key={r.ref} className={`hv-row ${isIn ? "in" : ""} ${isIn && !isRead ? "scan" : ""} ${state}`}>
                    <span className="hv-tick">
                      {r.ok || cleared ? (
                        <Check size={11} strokeWidth={3} />
                      ) : (
                        <AlertTriangle size={11} strokeWidth={3} />
                      )}
                    </span>
                    <span className="hv-src">{r.id}</span>
                    <span className="hv-party">{!r.ok && cleared ? `${r.party} · part receipt` : r.party}</span>
                    <span className="hv-amt">{r.amt}</span>
                    <span className={`hv-ref ${isRead ? "" : "hide"}`}>
                      {!r.ok && cleared ? "INV-2294 · cleared" : r.ref}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* ── stage panel: one animation per agent ── */}
            <div className="hv-stage">
              <div className={`hv-panel ${panel === 0 ? "on" : ""}`}>
                <div className="hv-lbl">Collect · secure read-only feeds</div>
                <div className="hv-pipes">
                  {FEEDS.map((f, i) => {
                    const p = Math.max(0, Math.min(1, prog[0] * FEEDS.length - i));
                    return (
                      <div className="hv-pipe" key={f.n}>
                        <span style={{ width: 92 }}>{f.n}</span>
                        <span className="rail">
                          <i style={{ width: `${p * 100}%` }} />
                        </span>
                        <b>{p >= 1 ? `${f.lines} lines` : "syncing…"}</b>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`hv-panel ${panel === 1 ? "on" : ""}`}>
                <div className="hv-lbl">Extract · Kalyani Logistics bill</div>
                <div className="hv-doc">
                  <div className="hv-fields">
                    {FIELDS.map((f, i) => (
                      <div key={f.k} className={`hv-field ${prog[1] > (i + 0.5) / FIELDS.length ? "on" : ""}`}>
                        <span>{f.k}</span>
                        <b>{f.v}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`hv-panel ${panel === 2 ? "on" : ""}`}>
                <div className="hv-lbl">Match · bank line against ledger entry</div>
                <div className="hv-match">
                  <div className="hv-side">
                    <div className="h">Bank</div>
                    <div className="l">
                      <span>Axis · NEFT 26 Aug</span>
                      <b>₹4,120</b>
                    </div>
                  </div>
                  <div className="hv-link">
                    <svg width="46" height="26" aria-hidden>
                      <path d="M2 13 C 16 13, 30 13, 44 13" />
                    </svg>
                  </div>
                  <div className="hv-side">
                    <div className="h">Ledger</div>
                    <div className="l">
                      <span>INV-2294</span>
                      <b>₹2,00,900</b>
                    </div>
                  </div>
                </div>
                <div className="hv-lock">4 locked · 1 outside 1% tolerance</div>
              </div>

              <div className={`hv-panel ${panel === 3 ? "on" : ""}`}>
                <div className="hv-lbl">Chaser · WhatsApp to Kalyani Logistics</div>
                <div className={`hv-msg ${chaseSent ? "on" : ""}`}>
                  <span className="who">Fyn</span>
                  <span className="bub">₹4,120 credit on 26 Aug has no bill against INV-2294. Can you share it?</span>
                </div>
                <div className={`hv-msg them ${chaseTyping || chaseReplied ? "on" : ""}`}>
                  <span className="who">Client</span>
                  <span className="bub">
                    {chaseReplied ? (
                      "Sharing now — it was a part receipt, balance next week."
                    ) : (
                      <span className="hv-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className={`hv-panel ${panel === 4 ? "on" : ""}`}>
                <div className="hv-lbl">Narrate · reason code on the exception</div>
                <div className="hv-write">
                  {typed}
                  <span className="hv-caret" />
                </div>
                <span className="hv-tag">
                  <PenLine size={11} strokeWidth={2.4} /> Short receipt · client confirmed
                </span>
              </div>

              <div className={`hv-panel ${panel === 5 ? "on" : ""}`}>
                <div className="hv-lbl">Sign-off · partner review pack</div>
                <div className="hv-sign">
                  <span className="hv-seal">
                    <Stamp size={26} strokeWidth={1.6} />
                  </span>
                  <span className="hv-signtx">
                    <b>1 exception, 4 clean lines, 0 manual entries</b>
                    <span>Working papers, GSTR-2B trail and the WhatsApp proof attached.</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="hv-foot">
              <div className="hv-count">
                <b>{counter.toLocaleString("en-IN")}</b> auto-matched · {flagged} open
              </div>
              <span className="hv-note">
                {stageIdx >= 4 ? "Every exception carries its reason code" : "What ties out never reaches a human"}
              </span>
            </div>
          </div>

          <div className="hv-right">
            <div className="hv-stat">
              <div className="hv-lbl">Close readiness</div>
              <div className="v">{readiness}%</div>
              <div className="hv-prog">
                <i style={{ width: `${readiness}%` }} />
              </div>
              <div className="hv-chips">
                <span className={`hv-chip ${stageIdx > 0 ? "ok" : ""}`}>Bank fed</span>
                <span className={`hv-chip ${stageIdx > 1 ? "ok" : ""}`}>GSTR-2B in</span>
                <span className={`hv-chip ${stageIdx > 3 ? "ok" : ""}`}>Bills chased</span>
                <span className={`hv-chip ${stageIdx >= STAGES.length ? "ok" : ""}`}>Partner review</span>
              </div>
            </div>

            <div className="hv-stat">
              <div className="hv-lbl">Agent activity</div>
              <ul className="hv-log">
                {LOG.map((l) => (
                  <li key={l.s} className={t > l.t ? "on" : ""}>
                    <i />
                    <span>{l.s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="hv-stat">
              <div className="hv-lbl">Transactions reconciled</div>
              <div className="v">{(124875 + matchedNow).toLocaleString("en-IN")}</div>
              <div className="hv-bars">
                {BARS.map((h, i) => (
                  <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
