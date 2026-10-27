import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { LIQUID_BUTTON_CSS } from "@/lib/liquidButton";
import { HOME_FAQS } from "@/content/faqs";
import { CTA_DEMO, CTA_NOTE, CTA_START, SIGNUP_URL, signupUrl, trackCta } from "@/components/site/cta";
import { DemoLink, openDemo } from "@/components/site/BookDemo";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  FileSearch,
  GitCompareArrows,
  MessageSquareText,
  BellRing,
  ScrollText,
  Users,
  Lock,
  Server,
  EyeOff,
  Link2,
  Search,
  Bell,
  Download,
  Filter,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import FynLogo from "@/components/FynLogo";

import { SiteFooter } from "@/components/site/SiteShell";
import ProductShot from "@/components/site/ProductShot";
import { CurrencySwitch, localize, money, useCurrency } from "@/lib/currency";
import { PLANS as BILLING_PLANS } from "@/lib/practice/billing/plans";

/* ─────────────────────────────────────────────────────────
   FynHelp homepage — editorial fintech layout
   Display: Instrument Sans (tight grotesk) + Fraunces italic
   Palette: cream page · deep maroon blocks · coral accent
   ───────────────────────────────────────────────────────── */

const C = {
  page: "#F2EEE7",
  pageAlt: "#EBE6DD",
  card: "#FFFDF9",
  ink: "#171208",
  inkDeep: "#0E0B06",
  body: "rgba(23,18,8,0.62)",
  muted: "rgba(23,18,8,0.42)",
  line: "rgba(23,18,8,0.09)",
  lineSoft: "rgba(23,18,8,0.055)",
  maroon: "#A93838",
  maroonDeep: "#5C1216",
  coral: "#E2673F",
  gold: "#8B6914",
  green: "#1F5A46",
  onDark: "#F7F1E6",
};

const STYLES = `
.fyn-home { background:${C.page}; color:${C.ink}; font-family:'Instrument Sans','Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
.fyn-home *, .fyn-home *::before, .fyn-home *::after { box-sizing:border-box; }
.fyn-home h1,.fyn-home h2,.fyn-home h3,.fyn-home h4 { font-family:'Instrument Sans','Inter',system-ui,sans-serif; font-weight:600; font-style:normal; letter-spacing:-0.035em; margin:0; color:inherit; line-height:1.06; }
.fyn-home .ital { font-family:'Fraunces',Georgia,serif; font-style:italic; font-weight:300; letter-spacing:-0.02em; color:rgba(23,18,8,.34); }
.fh-dark .ital, .fh-maroon .ital { color:rgba(247,241,230,.42); }
.fyn-home p,.fyn-home span,.fyn-home li,.fyn-home a,.fyn-home button,.fyn-home input,.fyn-home label { font-family:'Instrument Sans','Inter',system-ui,sans-serif; }
.fyn-home .num { font-variant-numeric:tabular-nums; }
.fh-wrap { max-width:1200px; margin:0 auto; padding:0 22px; }
.fh-sec { padding:104px 0; position:relative; }
@media (max-width:768px){ .fh-sec{ padding:64px 0; } }

.fh-kicker { display:inline-flex; align-items:center; gap:7px; font-size:10px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; color:${C.muted}; }
.fh-kicker::before { content:''; width:14px; height:1px; background:currentColor; opacity:.6; }
.fh-dark .fh-kicker, .fh-maroon .fh-kicker { color:rgba(247,241,230,.55); }
.fh-h2 { font-size:clamp(30px,4.6vw,52px); margin-top:16px !important; }
.fh-lead { font-size:15.5px; line-height:1.66; color:${C.body}; max-width:56ch; margin-top:16px; }
.fh-dark .fh-lead, .fh-maroon .fh-lead { color:rgba(247,241,230,.62); }
.fh-center { text-align:center; }
.fh-center .fh-lead { margin-left:auto; margin-right:auto; }
.fh-center .fh-kicker::before { display:none; }

.fh-btn { display:inline-flex; align-items:center; gap:8px; border-radius:999px; font-weight:500; font-size:14px; padding:12px 22px; text-decoration:none; border:1px solid transparent; cursor:pointer; transition:transform .45s cubic-bezier(.16,1,.3,1), background .25s, color .25s, box-shadow .45s; }
.fh-btn-primary { background:${C.ink}; color:${C.onDark}; }
.fh-btn-primary:hover { background:${C.maroonDeep}; transform:translateY(-2px); }
.fh-btn-coral { background:${C.coral}; color:#2A0F06; }
.fh-btn-coral:hover { background:#f07549; transform:translateY(-2px); }
.fh-btn-ghost { background:transparent; color:inherit; border-color:${C.line}; }
.fh-dark .fh-btn-ghost, .fh-maroon .fh-btn-ghost { border-color:rgba(247,241,230,.26); color:${C.onDark}; }
.fh-btn-ghost:hover { transform:translateY(-2px); background:rgba(23,18,8,.05); }
.fh-dark .fh-btn-ghost:hover, .fh-maroon .fh-btn-ghost:hover { background:rgba(255,255,255,.08); }
${LIQUID_BUTTON_CSS}

/* ── HERO ── */
.fh-hero { padding:118px 0 46px; text-align:center; position:relative; }
.fh-hero::before { content:''; position:absolute; inset:-40px 0 auto; height:520px; background:radial-gradient(60% 80% at 50% 0%, rgba(226,103,63,.13), transparent 70%); pointer-events:none; }
.fh-pills { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.fh-pill { font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; padding:6px 13px; border-radius:999px; background:${C.card}; border:1px solid ${C.line}; color:${C.body}; }
.fh-pill.a { color:${C.coral}; }
.fh-hero h1 { font-size:clamp(38px,6.6vw,78px); max-width:15ch; margin:26px auto 0 !important; }
.fh-hero p.sub { color:${C.body}; font-size:15.5px; line-height:1.65; max-width:46ch; margin:20px auto 0; }
.fh-capture { display:flex; gap:6px; align-items:center; background:${C.card}; border:1px solid ${C.line}; border-radius:999px; padding:5px 5px 5px 20px; max-width:420px; margin:28px auto 0; box-shadow:0 20px 40px -32px rgba(23,18,8,.6); }
.fh-capture input { flex:1; background:transparent; border:none; outline:none; color:${C.ink}; font-size:14px; min-width:0; }
.fh-capture input::placeholder { color:${C.muted}; }
.fh-hero-note { margin-top:14px; font-size:12px; color:${C.muted}; }

/* ── SHOWCASE BAND ── */
.fh-band-wrap { padding:0 22px; }
.fh-band { position:relative; max-width:1360px; margin:0 auto; border-radius:26px; overflow:hidden; min-height:430px; display:flex; align-items:flex-end; padding:34px; background:
  radial-gradient(70% 120% at 8% 8%, rgba(226,103,63,.55), transparent 60%),
  radial-gradient(90% 130% at 92% 30%, rgba(169,56,56,.55), transparent 62%),
  linear-gradient(120deg, #2A1109 0%, ${C.maroonDeep} 45%, #7A2A22 100%); }
.fh-band::after { content:''; position:absolute; inset:0; background:radial-gradient(120% 90% at 50% 120%, rgba(0,0,0,.5), transparent 60%); }
.fh-band-word { position:absolute; left:26px; right:26px; bottom:6px; font-family:'Instrument Sans',sans-serif; font-weight:700; letter-spacing:-0.05em; font-size:clamp(56px,13.5vw,190px); line-height:.86; color:rgba(255,248,240,.9); text-shadow:0 10px 40px rgba(0,0,0,.25); pointer-events:none; z-index:2; }
.fh-band-cards { position:relative; z-index:3; margin-left:auto; width:min(320px,100%); display:grid; gap:12px; }
.fh-bcard { background:rgba(255,253,249,.95); backdrop-filter:blur(8px); border-radius:16px; padding:16px; }
.fh-bcard h4 { font-size:15px; letter-spacing:-0.02em; }
.fh-bcard p { font-size:12.5px; line-height:1.55; color:${C.body}; margin:6px 0 0; }
.fh-bcard .mini { display:flex; align-items:center; gap:9px; margin-top:12px; }
.fh-bcard .mini i { width:30px; height:30px; border-radius:9px; background:linear-gradient(140deg,${C.coral},${C.maroon}); display:block; flex:0 0 auto; }
.fh-bcard.dark { background:rgba(14,11,6,.72); color:${C.onDark}; border:1px solid rgba(247,241,230,.14); }
.fh-bcard.dark p { color:rgba(247,241,230,.66); }
@media (max-width:720px){ .fh-band{ min-height:0; padding:20px; display:flex; flex-direction:column; gap:14px; } .fh-band-cards{ width:100%; } .fh-band-word{ position:static; font-size:clamp(44px,13vw,72px); margin:0 0 2px; } }

/* ── STATEMENT ── */
.fh-statement { display:grid; grid-template-columns:200px 1fr; gap:40px; align-items:start; }
@media (max-width:820px){ .fh-statement{ grid-template-columns:1fr; gap:16px; } }
.fh-statement p { font-size:clamp(19px,2.4vw,28px); line-height:1.34; letter-spacing:-0.025em; margin:0; max-width:34ch; }
.fh-statement p em { font-family:'Fraunces',Georgia,serif; font-style:italic; font-weight:300; color:${C.muted}; }

/* ── COLOR STAT CARDS ── */
.fh-tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:46px; }
@media (max-width:900px){ .fh-tiles{ grid-template-columns:1fr 1fr; } }
@media (max-width:520px){ .fh-tiles{ grid-template-columns:1fr; } }
.fh-tile { border-radius:20px; padding:20px; min-height:210px; display:flex; flex-direction:column; justify-content:space-between; color:${C.onDark}; position:relative; overflow:hidden; transition:transform .5s cubic-bezier(.16,1,.3,1); }
.fh-tile:hover { transform:translateY(-6px); }
.fh-tile .cap { font-size:12.5px; line-height:1.5; opacity:.78; }
.fh-tile .fig { font-size:clamp(34px,4.6vw,50px); font-weight:700; letter-spacing:-0.05em; }
.fh-tile.m { background:linear-gradient(150deg,#8E2323,${C.maroonDeep}); }
.fh-tile.d { background:linear-gradient(150deg,#2B2520,${C.inkDeep}); }
.fh-tile.c { background:linear-gradient(150deg,${C.coral},#B8401F); color:#2A0F06; }
.fh-tile.c .cap { opacity:.7; }
.fh-tile.g { background:linear-gradient(150deg,#2E7A5E,${C.green}); }
.fh-tile .badge { align-self:flex-start; font-size:9.5px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; padding:5px 10px; border-radius:999px; background:rgba(255,255,255,.16); }
.fh-tile.c .badge { background:rgba(42,15,6,.14); }

/* ── measurable columns ── */
.fh-cols { display:grid; grid-template-columns:repeat(3,1fr); gap:30px; margin-top:46px; }
@media (max-width:760px){ .fh-cols{ grid-template-columns:1fr; gap:22px; } }
.fh-col .v { font-size:clamp(30px,4vw,42px); font-weight:700; letter-spacing:-0.05em; }
.fh-col .l { font-size:13px; line-height:1.6; color:${C.body}; margin-top:8px; max-width:32ch; }

/* ── generic cards ── */
.fh-grid { display:grid; gap:14px; margin-top:44px; }
.fh-g2 { grid-template-columns:repeat(2,1fr); }
.fh-g3 { grid-template-columns:repeat(3,1fr); }
@media (max-width:900px){ .fh-g3{ grid-template-columns:1fr 1fr; } }
@media (max-width:660px){ .fh-g2,.fh-g3{ grid-template-columns:1fr; } }
.fh-card { background:${C.card}; border:1px solid ${C.line}; border-radius:20px; padding:24px; height:100%; transition:transform .5s cubic-bezier(.16,1,.3,1), box-shadow .5s, border-color .3s; }
.fh-card:hover { transform:translateY(-5px); box-shadow:0 30px 55px -42px rgba(23,18,8,.6); border-color:rgba(226,103,63,.35); }
.fh-card h3 { font-size:18px; letter-spacing:-0.03em; }
.fh-card p { font-size:13.5px; line-height:1.62; color:${C.body}; margin:9px 0 0; }
.fh-ico { width:36px; height:36px; border-radius:11px; background:rgba(226,103,63,.12); color:${C.coral}; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
.fh-tag { display:inline-block; margin-top:14px; font-size:9.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; padding:4px 10px; border-radius:999px; border:1px solid ${C.line}; color:${C.muted}; }
.fh-dark .fh-card { background:rgba(255,255,255,.045); border-color:rgba(247,241,230,.12); }
.fh-dark .fh-card:hover { border-color:rgba(226,103,63,.45); box-shadow:none; }
.fh-dark .fh-card p { color:rgba(247,241,230,.6); }
.fh-dark .fh-ico { background:rgba(226,103,63,.18); color:#F0A183; }

/* split feature */
.fh-split2 { display:grid; grid-template-columns:.92fr 1.08fr; gap:52px; align-items:center; }
@media (max-width:920px){ .fh-split2{ grid-template-columns:1fr; gap:32px; } }
.fh-split2.flip > *:first-child { order:2; }
@media (max-width:920px){ .fh-split2.flip > *:first-child{ order:0; } }
.fh-featlist { margin-top:28px; display:grid; gap:20px; }
.fh-feat { display:flex; gap:14px; }
.fh-feat h4 { font-size:15.5px; font-weight:600; letter-spacing:-0.02em; }
.fh-feat p { font-size:13.5px; color:${C.body}; line-height:1.6; margin-top:5px; }
.fh-frame { border-radius:24px; padding:22px; background:linear-gradient(150deg, rgba(226,103,63,.14), rgba(169,56,56,.07)); border:1px solid ${C.line}; }

/* mock */
.fh-mock { background:${C.card}; color:${C.ink}; border-radius:20px; border:1px solid ${C.line}; box-shadow:0 50px 90px -60px rgba(23,18,8,.75); overflow:hidden; max-width:980px; margin:0 auto; }
.fh-mock-bar { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid ${C.lineSoft}; }
.fh-mock-brand { display:flex; align-items:center; gap:8px; }
.fh-mock-icons { display:flex; align-items:center; gap:12px; color:${C.muted}; }
.fh-mock-user { display:flex; align-items:center; gap:8px; font-size:11px; color:${C.body}; }
.fh-mock-user b { display:block; color:${C.ink}; font-size:12px; }
.fh-mock-av { width:24px; height:24px; border-radius:50%; background:linear-gradient(135deg,${C.coral},${C.maroon}); }
.fh-mock-body { display:grid; grid-template-columns:52px 1fr; }
.fh-rail { border-right:1px solid ${C.lineSoft}; padding:16px 0; display:flex; flex-direction:column; align-items:center; gap:16px; }
.fh-rail i { width:16px; height:16px; border-radius:6px; background:rgba(23,18,8,.09); display:block; }
.fh-rail i.on { background:${C.coral}; }
.fh-mock-main { padding:20px; }
.fh-mock-hi { font-size:20px; font-weight:600; letter-spacing:-0.03em; }
.fh-mock-sub { font-size:11.5px; color:${C.muted}; margin-top:3px; }
.fh-chip { font-size:10.5px; padding:6px 11px; border-radius:999px; border:1px solid ${C.line}; color:${C.body}; display:inline-flex; align-items:center; gap:6px; background:${C.page}; }
.fh-chip.solid { background:${C.ink}; color:${C.onDark}; border-color:${C.ink}; }
.fh-mock-grid { display:grid; grid-template-columns:1.55fr 1fr; gap:14px; margin-top:16px; }
@media (max-width:720px){ .fh-mock-grid{ grid-template-columns:1fr; } }
.fh-mini { border:1px solid ${C.lineSoft}; border-radius:16px; padding:14px; background:${C.card}; }
.fh-mini .lbl { font-size:10px; color:${C.muted}; letter-spacing:.12em; text-transform:uppercase; }
.fh-mini .big { font-size:26px; font-weight:700; letter-spacing:-0.045em; margin-top:5px; font-variant-numeric:tabular-nums; }
.fh-bars { display:flex; align-items:flex-end; gap:7px; height:112px; margin-top:16px; }
.fh-bars span { flex:1; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg, ${C.maroonDeep}, rgba(92,18,22,.24)); }
.fh-axis { display:flex; justify-content:space-between; margin-top:7px; font-size:9px; color:${C.muted}; }
.fh-line { display:flex; align-items:center; justify-content:space-between; font-size:11.5px; padding:8px 0; border-top:1px solid ${C.lineSoft}; color:${C.body}; font-variant-numeric:tabular-nums; }
.fh-line b { color:${C.ink}; font-weight:600; }
.fh-pillrow { display:flex; gap:6px; margin-top:12px; }
.fh-pillrow span { height:8px; border-radius:4px; flex:1; background:rgba(23,18,8,.08); }
.fh-pillrow span.a { background:${C.ink}; flex:2; }
.fh-pillrow span.b { background:${C.coral}; flex:1.4; }
.fh-pillrow span.c { background:${C.gold}; flex:1; }

/* before/after */
.fh-panel { background:${C.card}; border:1px solid ${C.line}; border-radius:18px; overflow:hidden; }
.fh-panel-head { display:flex; justify-content:space-between; padding:13px 18px; border-bottom:1px solid ${C.lineSoft}; font-size:10px; letter-spacing:.16em; text-transform:uppercase; font-weight:600; color:${C.muted}; }
.fh-split { display:grid; grid-template-columns:1fr 1fr; }
@media (max-width:560px){ .fh-split{ grid-template-columns:1fr; } }
.fh-side { padding:18px; }
.fh-side + .fh-side { border-left:1px solid ${C.lineSoft}; }
.fh-side-t { font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; color:${C.muted}; margin-bottom:12px; }
.fh-msg { background:${C.pageAlt}; border-radius:12px; padding:9px 12px; font-size:12.5px; color:${C.body}; margin-bottom:8px; }
.fh-row { display:flex; align-items:center; gap:8px; font-size:12.5px; padding:8px 10px; border-radius:11px; background:rgba(31,90,70,.09); margin-bottom:7px; font-variant-numeric:tabular-nums; }
.fh-row.flag { background:rgba(226,103,63,.13); }
.fh-dot { width:7px; height:7px; border-radius:50%; background:${C.green}; flex:0 0 auto; }
.fh-row.flag .fh-dot { background:${C.coral}; }
.fh-summary { margin-top:12px; border-top:1px dashed ${C.line}; padding-top:12px; font-size:12.5px; color:${C.muted}; }
.fh-summary b { color:${C.ink}; font-size:19px; font-weight:700; letter-spacing:-0.04em; }

/* maroon block */
.fh-maroon { position:relative; overflow:hidden; border-radius:28px; padding:46px; color:${C.onDark}; background:
  radial-gradient(80% 120% at 100% 0%, rgba(226,103,63,.34), transparent 60%),
  linear-gradient(140deg, #7C1F20 0%, ${C.maroonDeep} 62%, #350B0E 100%); }
.fh-maroon h2 { color:#FDF7EC; }
.fh-maroon-grid { display:grid; grid-template-columns:1fr .82fr; gap:34px; align-items:center; }
@media (max-width:860px){ .fh-maroon{ padding:28px; } .fh-maroon-grid{ grid-template-columns:1fr; } }
.fh-maroon-card { background:rgba(255,253,249,.96); color:${C.ink}; border-radius:20px; padding:20px; }
.fh-maroon-card .lbl { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:${C.muted}; }
.fh-maroon-card .v { font-size:34px; font-weight:700; letter-spacing:-0.05em; margin-top:4px; }
.fh-uptick { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:6px 12px; border-radius:999px; background:#D7F0DF; color:#12503A; margin-top:12px; }

/* steps */
.fh-steps { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:44px; }
@media (max-width:900px){ .fh-steps{ grid-template-columns:1fr 1fr; } }
@media (max-width:560px){ .fh-steps{ grid-template-columns:1fr; } }
.fh-step { border-top:1px solid ${C.line}; padding-top:16px; transition:border-color .35s; }
.fh-step:hover { border-color:${C.coral}; }
.fh-step .n { font-size:10.5px; color:${C.coral}; font-weight:600; letter-spacing:.16em; }
.fh-step h3 { font-size:17px; margin-top:8px; }
.fh-step p { font-size:13px; color:${C.body}; line-height:1.6; margin-top:7px; }

/* pricing */
.fh-cur { margin-left:10px; }
.fh-billing { display:inline-flex; gap:4px; margin-top:26px; padding:4px; border-radius:999px; background:${C.card}; border:1px solid ${C.line}; }
.fh-billing button { border:0; cursor:pointer; background:transparent; color:${C.body}; font:inherit; font-size:13.5px; font-weight:500; padding:9px 20px; border-radius:999px; display:inline-flex; align-items:center; gap:8px; transition:background .25s ease, color .25s ease; }
.fh-billing button:hover { color:${C.ink}; }
.fh-billing button.on { background:${C.ink}; color:${C.onDark}; }
.fh-billing button i { font-style:normal; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; padding:3px 7px; border-radius:999px; background:${C.coral}; color:#2A0F06; }
.fh-price-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:44px; align-items:stretch; text-align:left; }
@media (max-width:900px){ .fh-price-grid{ grid-template-columns:1fr; max-width:440px; margin-inline:auto; } }
.fh-plan { background:${C.card}; border:1px solid ${C.line}; border-radius:22px; padding:28px; position:relative; display:flex; flex-direction:column; }
.fh-plan.pop { background:linear-gradient(160deg,#241C15,${C.inkDeep}); color:${C.onDark}; border-color:transparent; }
.fh-plan.pop li { color:rgba(247,241,230,.7); border-color:rgba(247,241,230,.1); }
.fh-plan.pop li b { color:#FDF7EC; }
.fh-plan .badge { position:absolute; top:-10px; left:26px; background:${C.coral}; color:#2A0F06; font-size:9px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; padding:5px 12px; border-radius:999px; }
.fh-plan .pn { font-size:19px; font-weight:600; letter-spacing:-0.03em; }
.fh-plan .pp { font-size:40px; font-weight:700; letter-spacing:-0.05em; margin-top:10px; font-variant-numeric:tabular-nums; }
.fh-plan .pp small { font-size:13px; font-weight:400; color:${C.muted}; letter-spacing:0; }
.fh-plan.pop .pp small { color:rgba(247,241,230,.5); }
.fh-annual { font-size:10.5px; color:${C.coral}; font-weight:600; letter-spacing:.14em; text-transform:uppercase; margin-top:6px; }
.fh-plan ul { list-style:none; padding:0; margin:18px 0 22px; }
.fh-plan li { display:flex; gap:9px; font-size:13px; line-height:1.55; color:${C.body}; padding:8px 0; border-top:1px solid ${C.lineSoft}; }
.fh-plan li b { color:${C.ink}; font-weight:600; }
.fh-plan .fh-btn { width:100%; justify-content:center; margin-top:auto; }

/* testimonials */
.fh-quotes { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:44px; text-align:left; }
@media (max-width:900px){ .fh-quotes{ grid-template-columns:1fr; } }
.fh-quote { background:${C.card}; border:1px solid ${C.line}; border-radius:20px; padding:24px; display:flex; flex-direction:column; gap:18px; }
.fh-quote p { font-size:14px; line-height:1.62; color:${C.body}; margin:0; }
.fh-quote .who { display:flex; align-items:center; gap:10px; margin-top:auto; font-size:12.5px; font-weight:600; }
.fh-quote .who i { width:32px; height:32px; border-radius:50%; background:linear-gradient(140deg,${C.coral},${C.maroonDeep}); display:block; flex:0 0 auto; }
.fh-quote .who small { display:block; font-weight:400; color:${C.muted}; margin-top:2px; }

/* faq */
.fh-faq-grid { display:grid; grid-template-columns:.75fr 1.25fr; gap:44px; align-items:start; }
@media (max-width:860px){ .fh-faq-grid{ grid-template-columns:1fr; gap:22px; } }
.fh-faq { border-top:1px solid ${C.line}; text-align:left; }
.fh-faq details { border-bottom:1px solid ${C.line}; }
.fh-faq summary { cursor:pointer; list-style:none; padding:18px 0; display:flex; justify-content:space-between; gap:20px; font-size:16px; font-weight:500; letter-spacing:-0.02em; }
.fh-faq summary::-webkit-details-marker { display:none; }
.fh-faq summary::after { content:'+'; color:${C.coral}; font-size:20px; line-height:1; }
.fh-faq details[open] summary::after { content:'–'; }
.fh-faq p { font-size:14px; line-height:1.7; color:${C.body}; margin:0 0 18px; max-width:74ch; }

/* cta band */
.fh-ctaband { border-radius:28px; padding:64px 34px; text-align:center; color:${C.onDark}; background:
  radial-gradient(70% 130% at 50% 0%, rgba(226,103,63,.4), transparent 62%),
  linear-gradient(150deg,#2A1109,${C.inkDeep}); }
.fh-ctaband h2 { color:#FDF7EC; max-width:19ch; margin-inline:auto; }

/* footer */
.fh-foot { background:${C.pageAlt}; color:${C.body}; padding:64px 0 0; overflow:hidden; }
.fh-foot-grid { display:grid; grid-template-columns:1.5fr repeat(3,1fr); gap:32px; }
@media (max-width:800px){ .fh-foot-grid{ grid-template-columns:1fr 1fr; } }
.fh-foot h4 { color:${C.ink}; font-size:10px; letter-spacing:.18em; text-transform:uppercase; font-weight:600; margin-bottom:13px; }
.fh-foot a { display:block; color:${C.body}; text-decoration:none; font-size:13.5px; padding:5px 0; transition:color .2s; }
.fh-foot a:hover { color:${C.maroon}; }
.fh-foot-bottom { border-top:1px solid ${C.line}; margin-top:38px; padding-top:18px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:12.5px; }
.fh-wordmark { font-weight:700; letter-spacing:-0.05em; font-size:clamp(70px,17vw,230px); line-height:.78; color:rgba(23,18,8,.055); text-align:center; margin-top:18px; user-select:none; }

/* reveal */
.fh-rv { opacity:0; transform:translateY(22px); transition:opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1); }
.fh-rv.in { opacity:1; transform:none; }
@media (prefers-reduced-motion: reduce){ .fh-rv{ opacity:1; transform:none; transition:none; } }
`;

const BARS = [38, 52, 44, 68, 58, 82, 64, 92, 74, 88, 70, 96];
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

const FEATURES = [
  { icon: FileSearch, t: "Document intake, classified", d: "Statements, Tally exports and GST and TDS registers read into structured lines automatically, cutting manual entry." },
  { icon: GitCompareArrows, t: "Exact → fuzzy → your rules", d: "Transactions match fast and accurately, surfacing only the exceptions that need judgement." },
  { icon: Users, t: "Queues split by role", d: "Juniors prepare documents and exceptions, partners review and sign off, so seniors spend time on judgement." },
  { icon: Link2, t: "Source-linked numbers", d: "Every figure traces back to source, so even small practices can deliver records clients trust." },
];

// Every figure here is measured or computed, not estimated. Speed: the public
// sample files through the real extract → recon → MIS code, no AI
// (tests/unit/practice/sample-benchmark.test.ts). Price: the Scale plan.
const PER_CLIENT_FROM = Math.min(...Object.values(BILLING_PLANS).map((p) => p.monthly / p.clientsIncluded));
const TILES = [
  { cls: "m", badge: "Time saved", fig: "< 1 sec", cap: "To reconcile a client-month and draft its MIS figures, from file to numbers. Measured on our sample files: under 0.4 s each." },
  { cls: "d", badge: "Automation", fig: "4 agents", cap: "Collect, read, reconcile and draft the MIS on their own, in 5 matching passes. Your team only sees the exceptions, each with a reason." },
  { cls: "c", badge: "AI-native", fig: "100%", cap: "of MIS figures computed in code and linked to the bank and book lines behind them. AI reads the documents and writes the commentary." },
  { cls: "g", badge: "More revenue", fig: "PRICE", cap: "a client a month on Scale, GST included. Offer a monthly MIS to every client and grow fees without adding staff." },
];

const PROBLEMS = [
  ["Document chasing", "\u201cWhere\u2019s the August statement?\u201d on WhatsApp, then email, then WhatsApp again. Across 30 clients, that\u2019s a junior\u2019s week."],
  ["Manual reconciliation", "Bank in one tab, books in another, GSTR-2B in a third. Hundreds of lines matched by hand to find the few that don\u2019t tie."],
  ["Rework after review", "Junior → manager → partner → back again, with nothing recording why something was flagged the first time."],
  ["Sign-off on faith", "A finished P&L with no visible trail back to source is a signature you can\u2019t defend later."],
];

const PIPELINE = [
  { icon: FileSearch, t: "Extract", d: "Multi-format documents classified and read into structured lines.", plan: "All plans" },
  { icon: GitCompareArrows, t: "Recon", d: "Exact, fuzzy and firm-rule matching. Every exception gets a reason code.", plan: "All plans" },
  { icon: MessageSquareText, t: "Narrate", d: "A monthly MIS built from matched lines, every figure linked to source.", plan: "All plans" },
  { icon: BellRing, t: "Chaser", d: "Scheduled email follow-ups for missing documents, plus a WhatsApp quick-send link.", plan: "Email on all plans, WhatsApp on Firm+" },
  { icon: ScrollText, t: "Audit trail", d: "Who decided what, when, with the note they left and the source line it touched.", plan: "All plans" },
  { icon: Users, t: "Unlimited users", d: "Your whole firm, every role. Never priced per seat.", plan: "All plans" },
];

const STEPS = [
  ["Bring in the documents", "Upload bank statements and Tally or Zoho exports, or let clients email them in. No migration, nothing switched off."],
  ["We extract & match", "Documents classified and reconciled — exact, then fuzzy, then your firm's rules."],
  ["Review exceptions only", "Genuine mismatches surface with a reason code and a link to source."],
  ["Client gets a clean MIS", "A source-linked pack with a narrative your client can actually read."],
];

const TRUST = [
  { icon: ShieldCheck, t: "No dummy numbers, ever", d: "If we don\u2019t have the data, the space stays empty. Never a placeholder figure dressed as real." },
  { icon: Link2, t: "Every match is explainable", d: "Each matched or flagged line names the rule behind it. Never \u201cAI decided\u201d." },
  { icon: Lock, t: "Read-only, revocable", d: "We read; we never write to your ledger. Revoke any connection at any time." },
  { icon: ScrollText, t: "Full audit trail", d: "Every decision is logged with who made it and why, so a review can be reconstructed months later." },
  { icon: Server, t: "Private storage", d: "Files sit in private storage, shared only through short-lived links. We publish certifications only once they are verified." },
  { icon: EyeOff, t: "No training on your data", d: "Learning is scoped to your firm and the client it came from. We never train shared models on it." },
];

const PLANS = [
  { key: "starter" as const, adds: ["Extract, Recon and MIS reports", "Email Chaser follow-ups", "Full audit trail", "Unlimited users"], cta: "Start free, no card" },
  { key: "professional" as const, adds: ["Everything in Essential", "500 WhatsApp reminder credits a month", "Your firm's branding on MIS exports", "Gmail intake for client documents"], cta: "Start free, no card", popular: true },
  { key: "scale" as const, adds: ["Everything in Firm", "Guided onboarding with a founder", "Priority support"], cta: "Talk to us" },
].map((p) => {
  const b = BILLING_PLANS[p.key];
  return {
    ...p,
    name: b.name,
    monthly: b.monthly,
    annual: b.annual,
    clients: `${b.clientsIncluded} active clients included`,
    extra: `Extra active client \u20B9${b.extraClient}${b.maxActiveClients ? ` (up to ${b.maxActiveClients})` : ""} · ${b.docsPerClient} docs per client`,
  };
});






function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div className="fh-rv" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}


export default function HomePage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const cur = useCurrency();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".fh-rv"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="fyn-home">
      <style>{STYLES}</style>
      <Navbar />

      {/* ── HERO ── */}
      <section className="fh-hero">
        <div className="fh-wrap" style={{ position: "relative", zIndex: 2 }}>
          <Reveal>
            <div className="fh-pills">
              <span className="fh-pill a">Built for CA firms</span>
              <span className="fh-pill">Exception-first</span>
              <span className="fh-pill">Reads Tally &amp; Zoho exports</span>
            </div>
            <h1>
              Month-end close for CA firms, <span className="ital">without the scramble</span>
            </h1>
            <p className="sub">
              FynHelp collects your clients&rsquo; documents, reconciles bank to Tally or Zoho books and drafts
              a source-traceable MIS, so your team reviews exceptions instead of matching every line.
            </p>

            <form
              className="fh-capture"
              onSubmit={(e) => {
                e.preventDefault();
                const email = String(new FormData(e.currentTarget).get("email") ?? "");
                trackCta("start", "home-hero");
                // The email they typed is already filled in on the next screen.
                window.location.href = signupUrl(email);
              }}
            >
              <input type="email" name="email" placeholder="Enter your work email" aria-label="Work email" autoComplete="email" required />
              <button type="submit" className="fh-btn fh-btn-primary">
                {CTA_START} <ArrowRight size={15} />
              </button>
            </form>
            <div className="fh-hero-note">
              {CTA_NOTE} ·{" "}
              <DemoLink location="home-hero" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
                or book a demo
              </DemoLink>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div style={{ maxWidth: 1080, margin: "44px auto 0" }}>
              <ProductShot eager src="/guide/09-recon-results.jpg" alt="FynHelp reconciliation screen: bank and book lines for July, matched and unmatched counts, and the lines that still need a decision" />
            </div>
          </Reveal>
        </div>
      </section>






      {/* ── STATEMENT + TILES ── */}
      <section className="fh-sec" style={{ paddingTop: 72 }}>
        <div className="fh-wrap">
          <Reveal>
            <div className="fh-statement">
              <span className="fh-kicker">What it does for your firm</span>
              <p>
                Less time on matching, less effort chasing,{" "}
                <em>and more clients closed by the same team.</em>
              </p>
            </div>
          </Reveal>

          <div className="fh-tiles">
            {TILES.map((t, i) => (
              <Reveal key={t.fig} delay={i * 70}>
                <div className={`fh-tile ${t.cls}`}>
                  <span className="badge">{t.badge}</span>
                  <div>
                    <div className="fig num">{t.fig === "PRICE" ? money(PER_CLIENT_FROM, cur) : t.fig}</div>
                    <div className="cap" style={{ marginTop: 8 }}>{t.cap}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE SPLIT ── */}
      <section className="fh-sec">
        <div className="fh-wrap fh-split2">
          <div>
            <Reveal>
              <span className="fh-kicker">What FynHelp does</span>
              <h2 className="fh-h2">
                How FynHelp keeps
                <br />
                <span className="ital">your close clear</span>
              </h2>
              <p className="fh-lead">
                Not another ledger. A layer above the one you have that removes the part of the month your
                team should never have been doing by hand.
              </p>
              <div className="fh-featlist">
                {FEATURES.map((f) => (
                  <div className="fh-feat" key={f.t}>
                    <div className="fh-ico" style={{ marginBottom: 0, flex: "0 0 auto" }}>
                      <f.icon size={17} />
                    </div>
                    <div>
                      <h4>{f.t}</h4>
                      <p>{f.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <ProductShot src="/guide/11-exception-queue.jpg" alt="Exception queue: each unmatched line with its reason code and a Decide button" />
          </Reveal>
        </div>
      </section>

      {/* ── MAROON BLOCK ── */}
      <section style={{ padding: "0 22px 40px" }}>
        <div className="fh-wrap" style={{ padding: 0 }}>
          <Reveal>
            <div className="fh-maroon">
              <div className="fh-maroon-grid">
                <div>
                  <span className="fh-kicker">Invest in the close you want</span>
                  <h2 className="fh-h2">
                    Give your firm back
                    <br />
                    <span className="ital">the week it loses</span>
                  </h2>
                  <p className="fh-lead">
                    Priced per active client, never per seat. Onboard the whole practice, keep your ledger
                    exactly where it is, and start with the entities that hurt most.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
                    <Link to={SIGNUP_URL} className="fh-btn fh-btn-coral" onClick={() => trackCta("start", "home-pricing-teaser")}>
                      {CTA_START} <ArrowUpRight size={15} />
                    </Link>
                    <Link to="/ca-firms" className="fh-btn fh-btn-ghost">
                      For CA firms
                    </Link>
                  </div>
                </div>
                <div className="fh-maroon-card">
                  <div className="lbl">{BILLING_PLANS.starter.name} plan</div>
                  <div className="v num">{money(BILLING_PLANS.starter.monthly, cur)}<small style={{ fontSize: 16 }}>/mo</small></div>
                  <div className="fh-uptick">Free trial from your first upload, no card needed</div>
                  <div className="fh-line">
                    <span>Active clients included</span>
                    <b>{BILLING_PLANS.starter.clientsIncluded}</b>
                  </div>
                  <div className="fh-line">
                    <span>Users</span>
                    <b>Unlimited</b>
                  </div>
                  <div className="fh-line">
                    <span>Prices</span>
                    <b>+ 18% GST</b>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PRODUCT ROW ── */}
      <section className="fh-sec">
        <div className="fh-wrap fh-split2 flip">
          <Reveal>
            <div>
              <span className="fh-kicker">Inside the product</span>
              <h2 className="fh-h2">
                How FynHelp simplifies
                <br />
                <span className="ital">your month-end</span>
              </h2>
              <p className="fh-lead">
                One workspace for every entity: what came in, what matched, what needs a decision and what is
                ready for partner sign-off.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
                <Link to={SIGNUP_URL} className="fh-btn fh-btn-primary" onClick={() => trackCta("start", "home-workspace")}>
                  {CTA_START} <ArrowRight size={15} />
                </Link>
                <DemoLink location="home-workspace" className="fh-btn fh-btn-ghost">
                  {CTA_DEMO}
                </DemoLink>
              </div>
            </div>
          </Reveal>
          <Reveal delay={110}>
            <ProductShot src="/guide/19-portfolio.jpg" alt="Portfolio: every client with its status for the month" />
          </Reveal>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="fh-sec" style={{ paddingTop: 0 }}>
        <div className="fh-wrap">
          <Reveal>
            <span className="fh-kicker">Where the month goes</span>
            <h2 className="fh-h2">
              Four things quietly eat <span className="ital">your firm&rsquo;s week</span>
            </h2>
          </Reveal>
          <div className="fh-grid fh-g2">
            {PROBLEMS.map(([t, d], i) => (
              <Reveal key={t} delay={i * 70}>
                <div className="fh-card">
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PIPELINE (dark) ── */}
      <section style={{ padding: "0 22px 40px" }} id="the-fix">
        <div className="fh-wrap" style={{ padding: 0 }}>
          <div
            className="fh-dark"
            style={{
              borderRadius: 28,
              padding: "56px 40px",
              color: C.onDark,
              background: `radial-gradient(70% 120% at 10% 0%, rgba(226,103,63,.3), transparent 60%), linear-gradient(150deg,#241C15,${C.inkDeep})`,
            }}
          >
            <Reveal>
              <span className="fh-kicker">The pipeline</span>
              <h2 className="fh-h2" style={{ color: "#FDF7EC" }}>
                Extract → Recon → <span className="ital">Narrate → Chaser</span>
              </h2>
              <p className="fh-lead">
                Four moving parts and two guarantees — the same vocabulary you&rsquo;ll see on the pricing
                table below. No second product, no renamed modules.
              </p>
            </Reveal>
            <div className="fh-grid fh-g3">
              {PIPELINE.map((p, i) => (
                <Reveal key={p.t} delay={i * 60}>
                  <div className="fh-card">
                    <div className="fh-ico">
                      <p.icon size={17} />
                    </div>
                    <h3 style={{ color: "#FDF7EC" }}>{p.t}</h3>
                    <p>{p.d}</p>
                    <span className="fh-tag" style={{ color: p.plan !== "All plans" ? "#F0A183" : "rgba(247,241,230,.5)", borderColor: "rgba(247,241,230,.18)" }}>
                      {p.plan}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* ── STEPS ── */}
      <section className="fh-sec">
        <div className="fh-wrap">
          <Reveal>
            <span className="fh-kicker">How it works</span>
            <h2 className="fh-h2">
              Four steps from connection <span className="ital">to a clean MIS</span>
            </h2>
          </Reveal>
          <div className="fh-steps">
            {STEPS.map(([t, d], i) => (
              <Reveal key={t} delay={i * 70}>
                <div className="fh-step">
                  <div className="n">STEP {String(i + 1).padStart(2, "0")}</div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="fh-sec" style={{ background: C.pageAlt }}>
        <div className="fh-wrap">
          <Reveal>
            <span className="fh-kicker">Trust &amp; security</span>
            <h2 className="fh-h2">
              A checklist, <span className="ital">not a sales pitch</span>
            </h2>
          </Reveal>
          <div className="fh-grid fh-g3">
            {TRUST.map((t, i) => (
              <Reveal key={t.t} delay={i * 55}>
                <div className="fh-card">
                  <div className="fh-ico">
                    <t.icon size={17} />
                  </div>
                  <h3>{t.t}</h3>
                  <p>{t.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="fh-sec fh-center" style={{ background: C.pageAlt }} id="pricing">
        <div className="fh-wrap">
          <Reveal>
            <span className="fh-kicker">Made for firms</span>
            <h2 className="fh-h2">
              Choose a plan <span className="ital">that fits</span>
            </h2>
            <p className="fh-lead">Every firm starts with a free trial, 14 days from the first upload, no card needed. Pay yearly and get 2 months free. Prices exclude 18% GST.</p>
            <div className="fh-billing" role="group" aria-label="Billing period">
              <button
                type="button"
                className={billing === "monthly" ? "on" : ""}
                aria-pressed={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billing === "annual" ? "on" : ""}
                aria-pressed={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Yearly <i>2 months free</i>
              </button>
            </div>
            <CurrencySwitch className="fh-billing fh-cur" value={cur} />
          </Reveal>
          <div className="fh-price-grid">
            {PLANS.map((p, i) => {
              const annualPerMonth = p.annual / 12;
              return (
              <Reveal key={p.name} delay={i * 80}>
                <div className={`fh-plan ${p.popular ? "pop" : ""}`} style={{ height: "100%" }}>
                  {p.popular && <span className="badge">Most popular</span>}
                  <div className="pn">{p.name}</div>
                  <div className="pp num">
                    {money(billing === "annual" ? annualPerMonth : p.monthly, cur)}
                    <small>/mo</small>
                  </div>
                  <div className="fh-annual">
                    {billing === "annual"
                      ? `${money(p.annual, cur)} billed yearly · save ${money(p.monthly * 12 - p.annual, cur)}`
                      : "Billed monthly · pay yearly for 2 months free"}
                  </div>

                  <ul>
                    <li>
                      <Check size={15} style={{ color: C.coral, flex: "0 0 auto" }} />
                      <b>{p.clients}</b>
                    </li>
                    <li>
                      <Check size={15} style={{ color: C.coral, flex: "0 0 auto" }} />
                      {localize(p.extra, cur)}
                    </li>
                    {p.adds.map((a) => (
                      <li key={a}>
                        <Check size={15} style={{ color: C.coral, flex: "0 0 auto" }} />
                        {a}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={SIGNUP_URL}
                    className={`fh-btn ${p.popular ? "fh-btn-coral" : "fh-btn-primary"}`}
                    onClick={(e) => {
                      if (p.name === "Scale") {
                        e.preventDefault();
                        openDemo("home-plan-scale");
                      } else trackCta("start", `home-plan-${p.name.toLowerCase()}`);
                    }}
                  >
                    {p.cta} <ArrowUpRight size={15} />
                  </Link>
                </div>
              </Reveal>
              );
            })}

          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="fh-sec" id="faq">
        <div className="fh-wrap fh-faq-grid">
          <Reveal>
            <div>
              <span className="fh-kicker">Commonly asked questions</span>
              <h2 className="fh-h2">
                Got questions?
                <br />
                <span className="ital">We&rsquo;ve got you covered</span>
              </h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="fh-faq">
              {HOME_FAQS.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section style={{ padding: "0 22px 96px" }}>
        <div className="fh-wrap" style={{ padding: 0 }}>
          <Reveal>
            <div className="fh-ctaband fh-dark">
              <span className="fh-kicker">Ready when you are</span>
              <h2 className="fh-h2">
                Run your next monthly close <span className="ital">through FynHelp</span>
              </h2>
              <p className="fh-lead" style={{ marginInline: "auto" }}>
                Set up your firm and read your first statement in five minutes, on your own. Prefer a
                walkthrough? A founder will set it up with you on a 20-minute call.
                <span style={{ display: "block", marginTop: 10, fontSize: 13.5, opacity: 0.75 }}>{CTA_NOTE}</span>
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
                <Link to={SIGNUP_URL} className="fh-btn fh-btn-coral" onClick={() => trackCta("start", "home-final")}>
                  {CTA_START} <ArrowRight size={16} />
                </Link>
                <DemoLink location="home-final" className="fh-btn fh-btn-ghost">
                  {CTA_DEMO}
                </DemoLink>
              </div>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ── FOOTER ── */}
      <SiteFooter />
    </div>
  );
}
