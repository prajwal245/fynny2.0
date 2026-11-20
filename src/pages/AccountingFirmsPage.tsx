import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Link2,
  Lock,
  Menu,
  X,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import FynLogo from "@/components/FynLogo";
import { COMPANY } from "@/content/legal/company";
import {
  CTA_DEMO,
  CTA_NOTE,
  CTA_START,
  SIGNUP_URL,
  trackCta,
} from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";
import { ACCOUNTING_FAQS } from "@/content/accountingFirmsFaqs";

/**
 * /for/accounting-firms: the document-chasing story for CA and accounting firms.
 *
 * Self-contained on purpose: its own quiet palette (warm paper, white cards,
 * hairline borders, one terracotta accent) scoped under `.fa`, so it does not
 * disturb the rest of the site. Every product claim here is one the code backs:
 * client upload links need no login, follow-ups follow a schedule the firm sets,
 * postings to Tally/Zoho and the MIS wait for a partner. The mock-ups use sample data.
 */

/* ────────────────────────── styles ────────────────────────── */

const STYLES = `
.fa { --paper:#FAF9F6; --card:#FFFFFF; --soft:#F4F2EC; --line:#E6E4DD; --ink:#181816; --mute:#666560; --acc:#E85D2A; --acc-ink:#C8461A;
  --amber-bg:#FBEFD5; --amber:#7A4F00; --mint-bg:#DCF0E5; --mint:#1B5E3E; --grey-bg:#ECEAE3; --grey:#55544F;
  background:var(--paper); color:var(--ink); font-family:'Instrument Sans','Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
.fa *, .fa *::before, .fa *::after { box-sizing:border-box; }
.fa h1,.fa h2,.fa h3,.fa h4 { font-family:'Fraunces',Georgia,serif; font-weight:400; letter-spacing:-0.025em; line-height:1.06; margin:0; }
.fa p { margin:0; }
.fa a { color:inherit; }
.fa a:focus-visible, .fa button:focus-visible, .fa summary:focus-visible { outline:2px solid var(--acc-ink); outline-offset:3px; border-radius:8px; }
.fa .wrap { max-width:1120px; margin:0 auto; padding:0 20px; }
.fa .sec { padding:96px 0; }
.fa .mono { font-variant-numeric:tabular-nums; }
@media (max-width:760px){ .fa .sec { padding:64px 0; } }

/* buttons */
.fa .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:46px; padding:0 22px; border-radius:999px; font-size:15px; font-weight:600; text-decoration:none; border:1px solid transparent; cursor:pointer; white-space:nowrap; transition:transform .2s, background .2s, border-color .2s; }
.fa .btn:hover { transform:translateY(-1px); }
.fa .btn-acc { background:var(--acc-ink); color:#fff; }
.fa .btn-acc:hover { background:#B03C14; }
.fa .btn-line { background:transparent; color:var(--ink); border-color:#CFCCC2; }
.fa .btn-line:hover { border-color:var(--ink); }
.fa .btn-sm { height:38px; padding:0 18px; font-size:14px; }

/* floating pill nav */
.fa-navwrap { position:sticky; top:12px; z-index:50; display:flex; justify-content:center; padding:0 12px; pointer-events:none; }
.fa-nav { pointer-events:auto; display:flex; align-items:center; gap:22px; width:min(860px,100%); height:56px; padding:0 8px 0 20px; background:rgba(250,249,246,.82); backdrop-filter:blur(14px) saturate(1.3); -webkit-backdrop-filter:blur(14px) saturate(1.3); border:1px solid var(--line); border-radius:999px; }
.fa-nav .links { display:flex; gap:2px; flex:1; justify-content:center; }
.fa-nav .links a { font-size:14.5px; font-weight:500; color:var(--mute); text-decoration:none; padding:8px 13px; border-radius:999px; transition:color .15s, background .15s; }
.fa-nav .links a:hover { color:var(--ink); background:rgba(24,24,22,.05); }
.fa-nav .burger { display:none; width:38px; height:38px; border-radius:999px; border:1px solid var(--line); background:transparent; align-items:center; justify-content:center; cursor:pointer; color:var(--ink); }
.fa-sheet { position:fixed; inset:78px 12px auto 12px; z-index:49; background:var(--paper); border:1px solid var(--line); border-radius:20px; padding:10px 18px 18px; }
.fa-sheet a.m { display:block; font-family:'Fraunces',Georgia,serif; font-size:22px; padding:13px 2px; text-decoration:none; border-bottom:1px solid var(--line); }
@media (max-width:760px){ .fa-nav .links { display:none; } .fa-nav { justify-content:space-between; } .fa-nav .burger { display:inline-flex; } .fa-nav .cta-d { display:none; } }

/* hero */
.fa-hero { padding:72px 0 24px; text-align:center; }
.fa-crumb { font-size:13px; color:var(--mute); display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.fa-crumb a { text-decoration:none; } .fa-crumb a:hover { color:var(--ink); }
.fa-badge { display:inline-block; margin-top:18px; font-size:11px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--acc-ink); padding:6px 12px; border:1px solid #F0CDBE; background:#FDF1EA; border-radius:999px; }
.fa-hero h1 { font-size:clamp(40px,7vw,80px); max-width:14ch; margin:22px auto 0; font-weight:400; }
.fa-hero h1 em { font-style:italic; font-weight:300; color:var(--acc-ink); }
.fa-hero .sub { font-size:18px; line-height:1.55; color:var(--mute); max-width:52ch; margin:22px auto 0; }
.fa-hero .acts { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:30px; }
.fa-hero .note { margin-top:14px; font-size:13px; color:var(--mute); }
.fa-works { display:flex; align-items:center; justify-content:center; gap:10px 22px; flex-wrap:wrap; margin-top:40px; font-size:13px; color:var(--mute); }
.fa-works b { font-weight:600; font-size:15px; color:#8C8A83; letter-spacing:-0.01em; }

/* workspace mock */
.fa-ws { margin:48px auto 0; max-width:1020px; background:var(--card); border:1px solid var(--line); border-radius:20px; overflow:hidden; text-align:left; }
.fa-ws .bar { display:flex; align-items:center; gap:10px; padding:13px 18px; border-bottom:1px solid var(--line); font-size:14px; }
.fa-ws .bar b { font-weight:600; } .fa-ws .bar span { color:var(--mute); }
.fa-ws .bar .dots { margin-left:auto; display:flex; gap:5px; } .fa-ws .bar .dots i { width:9px; height:9px; border-radius:50%; background:var(--line); }
.fa-ws .body { display:grid; grid-template-columns:1.25fr 1fr; }
.fa-ws .thread { padding:22px 22px 26px; display:flex; flex-direction:column; gap:18px; border-right:1px solid var(--line); }
.fa-ev { display:grid; grid-template-columns:30px 1fr; gap:12px; }
.fa-av { width:30px; height:30px; border-radius:50%; background:var(--soft); border:1px solid var(--line); display:grid; place-items:center; font-size:11px; font-weight:600; color:var(--grey); }
.fa-av.f { background:var(--ink); color:var(--paper); border-color:var(--ink); font-family:'Fraunces',serif; font-size:13px; }
.fa-ev .who { font-size:13.5px; font-weight:600; } .fa-ev .who span { font-weight:400; color:var(--mute); margin-left:6px; font-size:12.5px; }
.fa-ev p { font-size:14.5px; line-height:1.55; margin-top:3px; color:#33332F; }
.fa-mail { margin-top:11px; border:1px solid var(--line); border-radius:12px; background:var(--paper); overflow:hidden; }
.fa-mail .hd { padding:11px 14px; border-bottom:1px solid var(--line); font-size:12.5px; color:var(--mute); line-height:1.6; display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
.fa-mail .hd b { color:var(--ink); font-weight:600; }
.fa-mail .tx { padding:12px 14px; font-size:13.5px; line-height:1.6; color:#33332F; }
.fa-mail .ft { display:flex; gap:8px; padding:0 14px 13px; flex-wrap:wrap; align-items:center; }
.fa-mail .ft .hint { margin-left:auto; font-size:12px; color:var(--mute); }
.fa .pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.fa .pill.green { background:var(--mint-bg); color:var(--mint); } .fa .pill.amber { background:var(--amber-bg); color:var(--amber); } .fa .pill.grey { background:var(--grey-bg); color:var(--grey); }
.fa .pill.line { background:transparent; border:1px solid var(--line); color:var(--grey); }
.fa .mini-btn { font:inherit; font-size:13px; font-weight:600; height:32px; padding:0 14px; border-radius:9px; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
.fa .mini-btn:hover { border-color:var(--ink); }
.fa .mini-btn.dark { background:var(--ink); border-color:var(--ink); color:var(--paper); }
.fa-list { padding:20px 22px 24px; background:var(--card); }
.fa-list .top { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.fa-list h4 { font-size:19px; }
.fa-list .meter { display:flex; gap:3px; margin:14px 0 6px; }
.fa-list .meter i { flex:1; height:6px; border-radius:3px; background:var(--mint-bg); } .fa-list .meter i.m { background:#F2C98A; }
.fa-list .cnt { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
.fa-sheetrow { display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--line); font-size:13.5px; }
.fa-sheetrow:first-of-type { border-top:0; }
.fa-sheetrow .nm { display:flex; align-items:center; gap:9px; min-width:0; } .fa-sheetrow .nm span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fa-sheetrow .nm svg { flex:0 0 auto; color:#8C8A83; }
.fa-note { text-align:center; margin-top:14px; font-size:12.5px; color:var(--mute); }
@media (max-width:560px){ .fa-mail .hd { flex-direction:column-reverse; align-items:flex-start; } .fa-ws .thread, .fa-list { padding-left:16px; padding-right:16px; } }
@media (max-width:860px){ .fa-ws .body { grid-template-columns:1fr; } .fa-ws .thread { border-right:0; border-bottom:1px solid var(--line); } }

/* statement */
.fa-state { text-align:center; }
.fa-state h2 { font-size:clamp(34px,5.4vw,64px); max-width:18ch; margin:0 auto; }
.fa-state h2 em { font-style:italic; font-weight:300; color:var(--mute); }
.fa-state p { margin:22px auto 0; font-size:18px; color:var(--mute); max-width:40ch; line-height:1.5; }

/* section heads */
.fa-head { text-align:center; max-width:640px; margin:0 auto 52px; }
.fa-head h2 { font-size:clamp(30px,4.4vw,50px); }
.fa-head p { margin-top:16px; font-size:16.5px; line-height:1.6; color:var(--mute); }
.fa-eyebrow { display:block; margin-bottom:14px; font-size:11px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--mute); }

/* bento */
.fa-bento { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.fa-tile { background:var(--soft); border:1px solid var(--line); border-radius:18px; padding:14px 14px 24px; display:flex; flex-direction:column; }
.fa-tile .art { background:var(--card); border:1px solid var(--line); border-radius:13px; padding:16px; min-height:216px; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.fa-tile h3 { font-size:23px; margin:22px 10px 0; letter-spacing:-0.02em; }
.fa-tile p { margin:8px 10px 0; font-size:15px; line-height:1.55; color:var(--mute); }
@media (max-width:760px){ .fa-bento { grid-template-columns:1fr; } }
.fa-stack { display:flex; align-items:center; }
.fa-stack .fa-av { margin-left:-8px; border:2px solid var(--card); width:34px; height:34px; } .fa-stack .fa-av:first-child { margin-left:0; }
.fa-stack .lbl { margin-left:12px; font-size:13px; color:var(--mute); }
.fa-bubble { border:1px solid var(--line); border-radius:12px; background:var(--paper); padding:13px 15px; font-size:14px; line-height:1.6; color:#33332F; }
.fa-bubble .meta { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--mute); margin-bottom:6px; flex-wrap:wrap; }
.fa-chips { display:flex; flex-wrap:wrap; gap:8px; }
.fa-chip { display:inline-flex; align-items:center; gap:7px; font-size:13.5px; font-weight:500; padding:7px 13px; border:1px solid var(--line); border-radius:999px; background:var(--card); }
.fa-chip i { width:7px; height:7px; border-radius:50%; background:var(--mint); }
.fa-share { border:1px solid var(--line); border-radius:12px; padding:14px; background:var(--paper); }
.fa-share .t { font-weight:600; font-size:14px; display:flex; align-items:center; gap:8px; }
.fa-share .row { display:flex; gap:8px; margin-top:12px; align-items:center; }
.fa-share .url { flex:1; min-width:0; font-size:12.5px; padding:9px 11px; background:var(--card); border:1px solid var(--line); border-radius:9px; color:var(--mute); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fa-share .opt { margin-top:12px; font-size:13px; color:var(--mute); display:flex; align-items:center; gap:8px; }
.fa-trace { font-size:13.5px; }
.fa-trace .r { display:grid; grid-template-columns:1fr auto; gap:10px; padding:9px 0; border-top:1px solid var(--line); } .fa-trace .r:first-child { border-top:0; }
.fa-trace .r span:last-child { color:var(--mute); font-size:12.5px; }
.fa-trace .tot { font-weight:600; }

/* process */
.fa-proc { display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:start; }
.fa-steps { display:flex; flex-direction:column; }
.fa-step { all:unset; box-sizing:border-box; display:grid; grid-template-columns:44px 1fr; gap:6px 14px; padding:22px 0; border-top:1px solid var(--line); cursor:pointer; }
.fa-step:last-child { border-bottom:1px solid var(--line); }
.fa-step .n { font-family:'Fraunces',serif; font-size:20px; color:#A9A79F; padding-top:1px; transition:color .2s; }
.fa-step .tt { font-family:'Fraunces',serif; font-size:24px; letter-spacing:-0.02em; color:#8C8A83; transition:color .2s; }
.fa-step .dd { grid-column:2; font-size:15.5px; line-height:1.55; color:var(--mute); max-height:0; opacity:0; overflow:hidden; transition:max-height .35s, opacity .3s; }
.fa-step[aria-selected="true"] .n { color:var(--acc-ink); } .fa-step[aria-selected="true"] .tt { color:var(--ink); }
.fa-step[aria-selected="true"] .dd { max-height:90px; opacity:1; margin-top:2px; }
.fa-step:focus-visible { outline:2px solid var(--acc-ink); outline-offset:2px; }
.fa-docs { position:relative; background:var(--soft); border:1px solid var(--line); border-radius:20px; padding:28px; min-height:380px; display:flex; flex-direction:column; justify-content:center; gap:14px; }
.fa-doc { background:var(--card); border:1px solid var(--line); border-radius:13px; padding:15px 16px; display:grid; grid-template-columns:36px 1fr auto; gap:12px; align-items:center; }
.fa-doc:nth-child(2) { margin-left:22px; margin-right:-4px; } .fa-doc:nth-child(3) { margin-left:44px; margin-right:-8px; }
.fa-doc .ic { width:36px; height:36px; border-radius:10px; background:var(--soft); display:grid; place-items:center; color:var(--grey); }
.fa-doc b { display:block; font-size:14.5px; font-weight:600; } .fa-doc small { color:var(--mute); font-size:12.5px; }
@media (max-width:860px){ .fa-proc { grid-template-columns:1fr; gap:32px; } .fa-doc:nth-child(n) { margin-left:0; margin-right:0; } .fa-docs { min-height:0; padding:18px; } .fa-step[aria-selected="true"] .dd { max-height:140px; } }

/* integrations */
.fa-int { display:grid; grid-template-columns:1fr 1fr; background:var(--card); border:1px solid var(--line); border-radius:22px; overflow:hidden; }
.fa-int .l { padding:44px 40px; } .fa-int h2 { font-size:clamp(28px,3.6vw,40px); }
.fa-int ul { list-style:none; padding:0; margin:26px 0 0; display:flex; flex-direction:column; gap:14px; }
.fa-int li { display:flex; gap:12px; font-size:15.5px; line-height:1.5; } .fa-int li svg { flex:0 0 auto; margin-top:3px; color:var(--mint); }
.fa-int li b { font-weight:600; }
.fa-int .cap { margin-top:26px; font-family:'Fraunces',serif; font-style:italic; font-size:19px; color:var(--mute); }
.fa-int .r { background:var(--soft); border-left:1px solid var(--line); position:relative; min-height:380px; display:grid; place-items:center; padding:24px; }
.fa-badges { position:relative; width:100%; max-width:380px; height:300px; }
.fa-badge2 { position:absolute; display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px 16px; font-size:15px; font-weight:600; }
.fa-badge2 small { display:block; font-weight:400; font-size:12px; color:var(--mute); }
.fa-badge2 .gl { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; font-family:'Fraunces',serif; font-size:15px; background:var(--soft); border:1px solid var(--line); }
@media (max-width:860px){ .fa-int { grid-template-columns:1fr; } .fa-int .l { padding:30px 22px; } .fa-int .r { border-left:0; border-top:1px solid var(--line); min-height:0; } .fa-badges { height:auto; display:flex; flex-direction:column; gap:10px; } .fa-badge2 { position:static; } }

/* trust (the one dark band) */
.fa-dark { background:#181816; color:#F4F1E8; }
.fa-trust { display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center; }
.fa-dark .fa-eyebrow { color:rgba(244,241,232,.55); }
.fa-dark h2 { font-size:clamp(30px,4.2vw,48px); }
.fa-dark h2 em { font-style:italic; font-weight:300; color:rgba(244,241,232,.55); }
.fa-trust ul { list-style:none; padding:0; margin:30px 0 0; display:flex; flex-direction:column; gap:18px; }
.fa-trust li { display:grid; grid-template-columns:26px 1fr; gap:12px; }
.fa-trust li i { width:24px; height:24px; border-radius:50%; background:rgba(232,93,42,.18); color:#F58A5E; display:grid; place-items:center; margin-top:1px; }
.fa-trust li b { display:block; font-weight:600; font-size:16px; } .fa-trust li span { font-size:14.5px; line-height:1.5; color:rgba(244,241,232,.62); }
.fa-perm { background:var(--card); color:var(--ink); border-radius:18px; padding:8px 22px 14px; }
.fa-perm .h { display:flex; justify-content:space-between; align-items:center; padding:16px 0 12px; border-bottom:1px solid var(--line); }
.fa-perm .h h4 { font-size:20px; } .fa-perm .h span { font-size:12.5px; color:var(--mute); }
.fa-perm .r { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:15px 0; border-top:1px solid var(--line); } .fa-perm .r:first-of-type { border-top:0; }
.fa-perm .r b { display:block; font-size:14.5px; font-weight:600; } .fa-perm .r small { font-size:12.5px; color:var(--mute); }
.fa-perm .foot { padding-top:12px; border-top:1px solid var(--line); font-size:12.5px; color:var(--mute); }
@media (max-width:860px){ .fa-trust { grid-template-columns:1fr; gap:36px; } }

/* faq */
.fa-faq { max-width:760px; margin:0 auto; }
.fa-faq details { border-top:1px solid var(--line); } .fa-faq details:last-child { border-bottom:1px solid var(--line); }
.fa-faq summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:18px; padding:22px 0; font-family:'Fraunces',serif; font-size:21px; letter-spacing:-0.015em; }
.fa-faq summary::-webkit-details-marker { display:none; }
.fa-faq summary svg { flex:0 0 auto; color:var(--mute); transition:transform .25s; }
.fa-faq details[open] summary svg { transform:rotate(180deg); }
.fa-faq details p { padding:0 40px 24px 0; font-size:16px; line-height:1.65; color:var(--mute); }

/* closing */
.fa-close { text-align:center; background:var(--soft); border:1px solid var(--line); border-radius:26px; padding:72px 24px; }
.fa-close h2 { font-size:clamp(34px,5.4vw,60px); } .fa-close h2 em { font-style:italic; font-weight:300; color:var(--acc-ink); }
.fa-close p { margin:18px auto 0; color:var(--mute); font-size:17.5px; max-width:44ch; line-height:1.5; }
.fa-close .acts { margin-top:30px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }

/* footer */
.fa-foot { border-top:1px solid var(--line); margin-top:96px; padding:56px 0 28px; }
.fa-cols { display:grid; grid-template-columns:1.5fr repeat(5, minmax(0,1fr)); gap:28px; }
.fa-cols h5 { font-family:'Instrument Sans',sans-serif; font-size:12px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin:0 0 14px; }
.fa-cols a { display:block; text-decoration:none; font-size:14.5px; padding:5px 0; color:#33332F; } .fa-cols a:hover { color:var(--acc-ink); }
.fa-cols .about { font-size:14px; line-height:1.6; color:var(--mute); max-width:28ch; margin-top:14px; }
.fa-bottom { margin-top:44px; padding-top:20px; border-top:1px solid var(--line); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:13px; color:var(--mute); }
@media (max-width:980px){ .fa-cols { grid-template-columns:repeat(3, minmax(0,1fr)); } .fa-cols .brand { grid-column:1 / -1; } }
@media (max-width:520px){ .fa-cols { grid-template-columns:1fr 1fr; } }

@media (prefers-reduced-motion: reduce){ .fa .btn, .fa-step .dd, .fa-faq summary svg { transition:none; } .fa .btn:hover { transform:none; } }
`;

/* ────────────────────────── small pieces ────────────────────────── */

function Pill({
  tone,
  children,
}: {
  tone: "green" | "amber" | "grey" | "line";
  children: React.ReactNode;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function PillNav() {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "How it works", href: "#how" },
    { label: "Knowledge base", href: "/blog" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ];
  return (
    <>
      <div className="fa-navwrap">
        <nav className="fa-nav" aria-label="Main">
          <Link
            to="/"
            aria-label="FynHelp home"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <FynLogo size="sm" />
          </Link>
          <div className="links">
            {links.map((l) =>
              l.href.startsWith("#") ? (
                <a key={l.label} href={l.href}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.href}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
          <Link
            to={SIGNUP_URL}
            onClick={() => trackCta("start", "afp-nav")}
            className="btn btn-acc btn-sm cta-d"
          >
            {CTA_START}
          </Link>
          <button
            type="button"
            className="burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>
      </div>
      {open && (
        <div className="fa-sheet" onClick={() => setOpen(false)}>
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.label} className="m" href={l.href}>
                {l.label}
              </a>
            ) : (
              <Link key={l.label} className="m" to={l.href}>
                {l.label}
              </Link>
            ),
          )}
          <Link
            to={SIGNUP_URL}
            onClick={() => trackCta("start", "afp-nav-m")}
            className="btn btn-acc"
            style={{ width: "100%", marginTop: 16 }}
          >
            {CTA_START}
          </Link>
        </div>
      )}
    </>
  );
}

/* ────────────────────────── hero ────────────────────────── */

const CHECKLIST: { name: string; got: boolean }[] = [
  { name: "HDFC current account statement, October", got: false },
  { name: "Purchase register (Tally export)", got: false },
  { name: "TDS challans, Q2", got: false },
  { name: "Sales register (Tally export)", got: true },
  { name: "ICICI cash credit statement", got: true },
  { name: "GSTR-2B, October", got: true },
  { name: "Payroll summary", got: true },
  { name: "Petty cash voucher book", got: true },
];

function WorkspaceMock() {
  const [paused, setPaused] = useState(false);
  return (
    <figure style={{ margin: 0 }}>
      <div className="fa-ws" role="group" aria-label="Sample client workspace">
        <div className="bar">
          <b># october-close</b>
          <span>· Mehta Textiles Pvt Ltd</span>
          <div className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="body">
          <div className="thread">
            <div className="fa-ev">
              <div className="fa-av">RS</div>
              <div>
                <div className="who">
                  Riya Shah<span>9:15 AM</span>
                </div>
                <p>
                  What is still missing from Mehta Textiles for the October
                  close?
                </p>
              </div>
            </div>
            <div className="fa-ev">
              <div className="fa-av f">F</div>
              <div>
                <div className="who">
                  FynHelp<span>9:16 AM</span>
                </div>
                <p>
                  Checked the checklist against what has arrived. 3 of 11 items
                  are still missing: the HDFC statement for October, the
                  purchase register, and the Q2 TDS challans.
                </p>
                <div className="fa-mail">
                  <div className="hd">
                    <div>
                      <b>Day 3 follow-up</b> · email
                      <br />
                      To: Rakesh Mehta · Subject: Three documents for the
                      October close
                    </div>
                    {paused ? (
                      <Pill tone="grey">Paused</Pill>
                    ) : (
                      <Pill tone="amber">Goes out tomorrow, 10:00</Pill>
                    )}
                  </div>
                  <div className="tx">
                    Hi Rakesh, a quick note from Shah &amp; Co. To close October
                    we still need three things from you. The link below lets you
                    send them from your phone, no login needed.
                  </div>
                  <div className="ft">
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setPaused((v) => !v)}
                    >
                      {paused ? "Resume" : "Pause"}
                    </button>
                    <button type="button" className="mini-btn dark">
                      Send now
                    </button>
                    <span className="hint">
                      Stops the moment all three arrive
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="fa-list">
            <div className="top">
              <h4>Document checklist</h4>
              <Pill tone="amber">Due Friday</Pill>
            </div>
            <div className="meter" aria-hidden="true">
              {Array.from({ length: 11 }).map((_, i) => (
                <i key={i} className={i >= 8 ? "m" : ""} />
              ))}
            </div>
            <div className="cnt">
              <Pill tone="green">8 of 11 received</Pill>
              <Pill tone="amber">3 missing</Pill>
            </div>
            {CHECKLIST.map((c) => (
              <div className="fa-sheetrow" key={c.name}>
                <div className="nm">
                  <FileText size={15} />
                  <span>{c.name}</span>
                </div>
                {c.got ? (
                  <Pill tone="green">In workspace</Pill>
                ) : (
                  <Pill tone="amber">Missing</Pill>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="fa-note">
        A sample workspace with made-up data. The checklist and reminder rules
        are yours to set.
      </figcaption>
    </figure>
  );
}

function Hero() {
  return (
    <section className="fa-hero">
      <div className="wrap">
        <div className="fa-crumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>/<Link to="/use-cases">Use cases</Link>/
          <span>Accounting firms</span>
        </div>
        <span className="fa-badge">For accounting firms</span>
        <h1>
          Stop chasing clients <em>for documents.</em>
        </h1>
        <p className="sub">
          A dedicated workspace for every client. FynHelp tracks what’s missing,
          chases it on a schedule you set, and waits for a partner’s sign-off
          before anything reaches the books.
        </p>
        <div className="acts">
          <Link
            to={SIGNUP_URL}
            onClick={() => trackCta("start", "afp-hero")}
            className="btn btn-acc"
          >
            {CTA_START} <ArrowRight size={17} />
          </Link>
          <DemoLink location="afp-hero" className="btn btn-line">
            {CTA_DEMO}
          </DemoLink>
        </div>
        <p className="note">{CTA_NOTE}</p>
        <div className="fa-works" aria-label="Works with">
          <span>Works with</span>
          <b>Tally</b>
          <b>Zoho Books</b>
          <b>Gmail</b>
          <b>WhatsApp</b>
          <b>Excel &amp; CSV</b>
        </div>
        <WorkspaceMock />
      </div>
    </section>
  );
}

/* ────────────────────────── statement + bento ────────────────────────── */

function Statement() {
  return (
    <section className="sec">
      <div className="wrap fa-state">
        <h2>
          Your team knows the clients. <em>FynHelp handles the chasing.</em>
        </h2>
        <p>One workspace per client. One live status everyone trusts.</p>
      </div>
    </section>
  );
}

function Bento() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="sec" style={{ paddingTop: 24 }}>
      <div className="wrap">
        <div className="fa-head">
          <span className="fa-eyebrow">What’s inside</span>
          <h2>Everything your firm needs to stop chasing</h2>
        </div>
        <div className="fa-bento">
          <article className="fa-tile">
            <div className="art">
              <div className="fa-stack">
                <div className="fa-av">RS</div>
                <div className="fa-av">PK</div>
                <div className="fa-av f">F</div>
                <span className="lbl">2 staff + FynHelp</span>
              </div>
              {[
                ["Sales register, October", true],
                ["HDFC statement, October", false],
                ["TDS challans, Q2", false],
              ].map(([n, got]) => (
                <div
                  className="fa-sheetrow"
                  key={n as string}
                  style={{ borderTop: "1px solid var(--line)" }}
                >
                  <div className="nm">
                    <FileText size={15} />
                    <span>{n as string}</span>
                  </div>
                  {got ? (
                    <Pill tone="green">Received</Pill>
                  ) : (
                    <Pill tone="amber">Missing</Pill>
                  )}
                </div>
              ))}
            </div>
            <h3>A workspace for every client</h3>
            <p>The engagement, files, notes and team in one place.</p>
          </article>

          <article className="fa-tile">
            <div className="art">
              <div className="fa-bubble">
                <div className="meta">
                  <span>Follow-up · Day 3</span>
                  <Pill tone="amber">Scheduled</Pill>
                </div>
                Hi Rakesh, we have your sales register and bank statement. Still
                outstanding: purchase register and Q2 TDS challans.
              </div>
              <div style={{ fontSize: 13, color: "var(--mute)" }}>
                2 of 4 received · checked against the checklist on arrival
              </div>
            </div>
            <h3>The checklist, always current</h3>
            <p>
              Every file that arrives is read and ticked off against what you
              asked for.
            </p>
          </article>

          <article className="fa-tile">
            <div className="art">
              <div className="fa-bubble">
                <div className="meta">
                  <span>WhatsApp · Shah &amp; Co.</span>
                  <Pill tone="line">You press send</Pill>
                </div>
                Namaste Rakesh ji, October books are nearly done. Could you send
                the purchase register when you get a minute? Here is your link.
              </div>
            </div>
            <h3>Reminders in your firm’s voice</h3>
            <p>
              Warm, plain drafts in your firm’s name, not a robotic mail merge.
              Follow-ups stop when the file arrives.
            </p>
          </article>

          <article className="fa-tile">
            <div className="art">
              <div className="fa-chips">
                {[
                  "Tally",
                  "Zoho Books",
                  "Gmail",
                  "WhatsApp",
                  "Excel",
                  "CSV",
                  "Bank PDFs",
                ].map((c) => (
                  <span className="fa-chip" key={c}>
                    <i />
                    {c}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--mute)", marginTop: 4 }}>
                Read-only by default. Entries are posted only once a partner
                approves them.
              </div>
            </div>
            <h3>Works with Tally and the tools you keep</h3>
            <p>
              No migration. Keep the ledger where it is and let FynHelp read
              around it.
            </p>
          </article>

          <article className="fa-tile">
            <div className="art">
              <div className="fa-share">
                <div className="t">
                  <Link2 size={16} /> Upload link for Mehta Textiles
                </div>
                <div className="opt">
                  <Lock size={14} /> Anyone with the link can upload · No login
                  needed
                </div>
                <div className="row">
                  <div className="url">fynhelp.com/u/k3Fq…x9</div>
                  <button
                    type="button"
                    className="mini-btn dark"
                    onClick={() => setCopied(true)}
                    aria-live="polite"
                  >
                    {copied ? "Link copied" : "Copy link"}
                  </button>
                </div>
                <div className="opt" style={{ marginTop: 10 }}>
                  Expires in 14 days · Photos from a phone work
                </div>
              </div>
            </div>
            <h3>Links clients can open</h3>
            <p>
              Send a link, not a portal. Clients upload from any phone with
              nothing to sign up for.
            </p>
          </article>

          <article className="fa-tile">
            <div className="art">
              <div className="fa-trace">
                <div
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: 18,
                    marginBottom: 6,
                  }}
                >
                  October MIS · Mehta Textiles
                </div>
                <div className="r">
                  <span>Revenue</span>
                  <span>₹41,82,300 · 126 lines</span>
                </div>
                <div className="r">
                  <span>Purchases</span>
                  <span>₹27,10,940 · 98 lines</span>
                </div>
                <div className="r">
                  <span className="tot">Awaiting partner sign-off</span>
                  <Pill tone="amber">Ask first</Pill>
                </div>
              </div>
            </div>
            <h3>A month-end you can trace</h3>
            <p>
              Once the documents are in, the MIS is drafted and every figure
              opens the lines behind it.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── process ────────────────────────── */

type DocCard = {
  icon: "doc";
  title: string;
  sub: string;
  pill: ["green" | "amber" | "grey" | "line", string];
};
const STEPS: { n: string; t: string; d: string; docs: DocCard[] }[] = [
  {
    n: "01",
    t: "Open a workspace per client",
    d: "Add the engagement and last month’s files. Your checklist, contacts and team sit in one place.",
    docs: [
      {
        icon: "doc",
        title: "Engagement letter",
        sub: "Mehta Textiles · signed",
        pill: ["green", "On file"],
      },
      {
        icon: "doc",
        title: "Monthly checklist",
        sub: "11 items · due the 7th",
        pill: ["line", "Template"],
      },
      {
        icon: "doc",
        title: "September close",
        sub: "Prior month · reconciled",
        pill: ["grey", "Archived"],
      },
    ],
  },
  {
    n: "02",
    t: "Check what’s missing",
    d: "FynHelp compares the checklist against what has arrived and tells you exactly what is still outstanding.",
    docs: [
      {
        icon: "doc",
        title: "Sales register",
        sub: "Received Nov 2",
        pill: ["green", "In workspace"],
      },
      {
        icon: "doc",
        title: "HDFC statement, October",
        sub: "Not yet received",
        pill: ["amber", "Missing"],
      },
      {
        icon: "doc",
        title: "TDS challans, Q2",
        sub: "Not yet received",
        pill: ["amber", "Missing"],
      },
    ],
  },
  {
    n: "03",
    t: "Chase on your schedule",
    d: "Follow-ups go out on Day 0, 3 and 7, or whatever you set, and stop when the file lands. After two unanswered ones, the item goes to a partner.",
    docs: [
      {
        icon: "doc",
        title: "Day 0 · email",
        sub: "Sent Nov 4",
        pill: ["green", "Sent"],
      },
      {
        icon: "doc",
        title: "Day 3 · email",
        sub: "Tomorrow, 10:00",
        pill: ["amber", "Scheduled"],
      },
      {
        icon: "doc",
        title: "WhatsApp message",
        sub: "Opens ready to send",
        pill: ["line", "You press send"],
      },
    ],
  },
  {
    n: "04",
    t: "Reconcile and sign off",
    d: "With the files in, bank lines are matched to the books and the MIS is drafted. Nothing reaches the client until a partner signs it off.",
    docs: [
      {
        icon: "doc",
        title: "Bank to Tally match",
        sub: "412 of 427 lines matched",
        pill: ["green", "15 to review"],
      },
      {
        icon: "doc",
        title: "October MIS",
        sub: "Every figure opens its lines",
        pill: ["amber", "Ask first"],
      },
      {
        icon: "doc",
        title: "Signed-off PDF",
        sub: "After partner approval",
        pill: ["grey", "Pending"],
      },
    ],
  },
];

function Process() {
  const [i, setI] = useState(0);
  const cur = STEPS[i]!;
  return (
    <section
      className="sec"
      id="how"
      style={{
        background: "var(--card)",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="wrap">
        <div className="fa-head">
          <span className="fa-eyebrow">How it works</span>
          <h2>From missing list to a complete file</h2>
        </div>
        <div className="fa-proc">
          <div className="fa-steps" role="tablist" aria-label="Steps">
            {STEPS.map((s, k) => (
              <button
                key={s.n}
                type="button"
                role="tab"
                aria-selected={k === i}
                className="fa-step"
                onClick={() => setI(k)}
                onMouseEnter={() => setI(k)}
              >
                <span className="n">{s.n}</span>
                <span className="tt">{s.t}</span>
                <span className="dd">{s.d}</span>
              </button>
            ))}
          </div>
          <div className="fa-docs" role="tabpanel" aria-live="polite">
            {cur.docs.map((d) => (
              <div className="fa-doc" key={`${cur.n}-${d.title}`}>
                <div className="ic">
                  <FileText size={17} />
                </div>
                <div>
                  <b>{d.title}</b>
                  <small>{d.sub}</small>
                </div>
                <Pill tone={d.pill[0]}>{d.pill[1]}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── integrations ────────────────────────── */

function Integrations() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="fa-int">
          <div className="l">
            <span className="fa-eyebrow">Your stack, untouched</span>
            <h2>Keep the tools your firm already uses</h2>
            <ul>
              {[
                [
                  "Tally",
                  " for the books: upload the day book or ledger export, as you do today.",
                ],
                [
                  "Zoho Books",
                  " read-only: pull a client’s bank ledger and open invoices.",
                ],
                [
                  "Gmail",
                  " for client email, so replies and attachments land in the right workspace.",
                ],
                [
                  "Excel and CSV",
                  " for registers, and PDFs or photos for statements.",
                ],
              ].map(([b, rest]) => (
                <li key={b}>
                  <Check size={18} />
                  <span>
                    <b>{b}</b>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
            <p className="cap">
              No new portal for clients. Just a faster chase.
            </p>
          </div>
          <div className="r">
            <div className="fa-badges" aria-hidden="true">
              <div className="fa-badge2" style={{ top: 6, left: 4 }}>
                <span className="gl">T</span>
                <span>
                  Tally<small>Bank ledger, day book</small>
                </span>
              </div>
              <div className="fa-badge2" style={{ top: 70, right: 0 }}>
                <span className="gl">Z</span>
                <span>
                  Zoho Books<small>Read-only connect</small>
                </span>
              </div>
              <div className="fa-badge2" style={{ top: 148, left: 24 }}>
                <span className="gl">G</span>
                <span>
                  Gmail<small>Client email</small>
                </span>
              </div>
              <div className="fa-badge2" style={{ top: 226, right: 22 }}>
                <span className="gl">W</span>
                <span>
                  WhatsApp<small>Quick-send link</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── trust ────────────────────────── */

function Trust() {
  return (
    <section className="sec fa-dark">
      <div className="wrap fa-trust">
        <div>
          <span className="fa-eyebrow">Security and control</span>
          <h2>
            Client data, handled with care.{" "}
            <em>Every posting waits for a yes.</em>
          </h2>
          <ul>
            {[
              [
                "Each firm’s data kept apart",
                "Isolated at the database level, with files in private storage and shared only through short-lived links.",
              ],
              [
                "A partner approves what matters",
                "Entries posted to Tally or Zoho and the signed-off MIS need a person’s approval first.",
              ],
              [
                "Every action on the record",
                "An audit trail shows what was sent, matched or changed, and by whom.",
              ],
            ].map(([b, s]) => (
              <li key={b}>
                <i>
                  <Check size={14} />
                </i>
                <div>
                  <b>{b}</b>
                  <span>{s}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="fa-perm" role="group" aria-label="Sample permissions">
          <div className="h">
            <h4>Permissions</h4>
            <span>Mehta Textiles</span>
          </div>
          {[
            [
              "Post entries to Tally or Zoho",
              "Previewed first, partner approves",
              "amber",
              "Ask first",
            ],
            [
              "Release the monthly MIS",
              "Partner sign-off",
              "amber",
              "Ask first",
            ],
            [
              "Read bank statements and registers",
              "On upload",
              "green",
              "Automatic",
            ],
            [
              "Email follow-ups for missing files",
              "Your schedule, stops on arrival",
              "green",
              "On schedule",
            ],
            [
              "WhatsApp message to a client",
              "Opens ready to send",
              "line",
              "You press send",
            ],
          ].map(([t, s, tone, label]) => (
            <div className="r" key={t}>
              <div>
                <b>{t}</b>
                <small>{s}</small>
              </div>
              <Pill tone={tone as "green" | "amber" | "line"}>{label}</Pill>
            </div>
          ))}
          <div className="foot">
            Sample view. Posting to a ledger is off until you switch it on for a
            client.
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── faq, close, footer ────────────────────────── */

function Faq() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="fa-head" style={{ marginBottom: 36 }}>
          <span className="fa-eyebrow">Questions</span>
          <h2>Before you ask</h2>
        </div>
        <div className="fa-faq">
          {ACCOUNTING_FAQS.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={20} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section style={{ padding: "0 0 0" }}>
      <div className="wrap">
        <div className="fa-close">
          <h2>
            Spend close week <em>on the close.</em>
          </h2>
          <p>Let FynHelp handle the chasing. Your team handles the judgment.</p>
          <div className="acts">
            <Link
              to={SIGNUP_URL}
              onClick={() => trackCta("start", "afp-close")}
              className="btn btn-acc"
            >
              {CTA_START} <ArrowRight size={17} />
            </Link>
            <DemoLink location="afp-close" className="btn btn-line">
              {CTA_DEMO}
            </DemoLink>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOT: { h: string; links: [string, string][] }[] = [
  {
    h: "Product",
    links: [
      ["How it works", "/pipeline"],
      ["Extract", "/agents/extract"],
      ["Recon", "/agents/recon"],
      ["Narrate", "/agents/narrate"],
      ["Chaser", "/agents/chaser"],
    ],
  },
  {
    h: "Use cases",
    links: [
      ["CA firms", "/ca-firms"],
      ["Accounting firms", "/for/accounting-firms"],
      ["Finance teams", "/enterprise"],
      ["All use cases", "/use-cases"],
    ],
  },
  {
    h: "Compare & connect",
    links: [
      ["Tally vs Zoho Books", "/blog/tally-vs-zoho-books-for-ca-firms"],
      [
        "ChatGPT vs FynHelp",
        "/blog/chatgpt-for-accounting-vs-fynhelp-ca-firms-india",
      ],
      ["Pricing", "/pricing"],
    ],
  },
  {
    h: "Learn",
    links: [
      ["Blog", "/blog"],
      ["Product guide", "/guide"],
      ["Sample files", "/samples"],
      ["Resources", "/resources"],
    ],
  },
  {
    h: "Company",
    links: [
      ["About", "/about"],
      ["Security", "/security"],
      ["Contact", "/contact"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
];

function Footer() {
  return (
    <footer className="fa-foot">
      <div className="wrap">
        <div className="fa-cols">
          <div className="brand">
            <FynLogo size="sm" loading="lazy" />
            <p className="about">
              Practice software for Indian CA firms. Documents in, matched books
              and a signed-off MIS out.
            </p>
          </div>
          {FOOT.map((c) => (
            <nav key={c.h} aria-label={c.h}>
              <h5>{c.h}</h5>
              {c.links.map(([l, to]) => (
                <Link key={l} to={to}>
                  {l}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="fa-bottom">
          <span>
            &copy; {new Date().getFullYear()} {COMPANY.entity || "FynHelp"} ·
            Bengaluru, India
          </span>
          <span>support@fynhelp.com</span>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────── page ────────────────────────── */

export default function AccountingFirmsPage() {
  return (
    <div className="fa">
      <style>{STYLES}</style>
      <PillNav />
      <main>
        <Hero />
        <Statement />
        <Bento />
        <Process />
        <Integrations />
        <Trust />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
