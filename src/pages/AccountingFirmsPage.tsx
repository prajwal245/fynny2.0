import { useState } from "react";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Inbox,
  Mail,
  Menu,
  MessageCircle,
  PanelRight,
  Plus,
  Scale,
  UserRound,
  X,
} from "lucide-react";
import { SiGmail, SiGooglesheets, SiWhatsapp, SiZoho } from "react-icons/si";
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
 * /for/accounting-firms: the document-chasing story for the whole firm
 * (partners, managers, seniors and juniors).
 *
 * Self-contained on purpose: its own quiet palette (warm paper, white cards, soft
 * pastel washes, one terracotta accent) scoped under `.fa`, so it does not disturb
 * the rest of the site.
 *
 * Every product claim is one the code backs, and the mock-ups use the product's own
 * words: chase items are Open / Following Up / Escalated / Resolved; follow-ups run on
 * day 0, 3 and 7 and come to a partner on day 10; email goes Mon-Sat 9:30 am-6:30 pm IST;
 * the channel is Email, WhatsApp or both; tone is gentle, standard or firm; client upload
 * links need no login; postings to Tally or Zoho and the MIS wait for a partner.
 * Brand marks come from Simple Icons; where no genuine mark is available (Tally, Excel)
 * a neutral icon is used instead of an imitation. Mock-ups use sample data.
 */

/* ────────────────────────── styles ────────────────────────── */

const STYLES = `
.fa { --paper:#FBFAF7; --card:#FFFFFF; --soft:#F3F1EB; --line:#E7E4DC; --ink:#161614; --mute:#6B6A64; --acc:#F06A32; --acc-ink:#C8461A;
  --mint:#DCEFE5; --peach:#F9DFD2; --butter:#F6EDB6; --sand:#F3F1EB;
  --green-bg:#DFF2E7; --green:#1B6B43; --amber-bg:#FDE6D8; --amber:#B2420F; --grey-bg:#ECEAE4; --grey:#5C5B56;
  --sans:var(--font-geist-sans),'Instrument Sans','Inter',system-ui,sans-serif;
  background:var(--paper); color:var(--ink); font-family:var(--sans); -webkit-font-smoothing:antialiased; overflow-x:clip; }
.fa *, .fa *::before, .fa *::after { box-sizing:border-box; }
.fa h1,.fa h2,.fa h3,.fa h4 { font-family:var(--sans); font-weight:300; letter-spacing:-0.04em; line-height:1.05; margin:0; }
.fa p { margin:0; }
.fa a { color:inherit; }
.fa button { font-family:inherit; }
.fa a:focus-visible, .fa button:focus-visible, .fa summary:focus-visible { outline:2px solid var(--acc-ink); outline-offset:3px; border-radius:10px; }
.fa .wrap { width:min(1100px, 100% - 48px); margin:0 auto; }
.fa .sec { padding:112px 0 0; }
@media (max-width:760px){ .fa .wrap { width:calc(100% - 32px); } .fa .sec { padding-top:72px; } }
.fa .h2 { font-size:clamp(34px,4.6vw,52px); }

/* buttons */
.fa .btn { display:inline-flex; align-items:center; justify-content:center; gap:10px; height:50px; padding:0 8px 0 24px; border-radius:999px; font-size:16px; font-weight:500; text-decoration:none; border:1px solid transparent; cursor:pointer; white-space:nowrap; transition:transform .2s, background .2s, border-color .2s; letter-spacing:-0.01em; }
.fa .btn:hover { transform:translateY(-1px); }
.fa .btn-acc { background:var(--acc-ink); color:#fff; }
.fa .btn-acc:hover { background:#B03C14; }
.fa .btn-acc .ar { width:34px; height:34px; border-radius:50%; background:#fff; color:var(--acc-ink); display:grid; place-items:center; }
.fa .btn-line { background:transparent; color:var(--ink); border-color:#CDCAC0; padding:0 24px; }
.fa .btn-line:hover { border-color:var(--ink); }
.fa .btn-dline { background:transparent; color:#F4F2EC; border-color:rgba(244,242,236,.28); padding:0 22px; height:44px; font-size:15px; }
.fa .btn-dline:hover { border-color:#F4F2EC; }
.fa .btn-sm { height:42px; padding:0 20px; font-size:15px; }

/* floating pill nav */
.fa-navwrap { position:sticky; top:14px; z-index:50; display:flex; justify-content:center; padding:0 14px; pointer-events:none; height:0; }
.fa-nav { pointer-events:auto; display:flex; align-items:center; gap:30px; height:58px; padding:0 8px 0 22px; background:rgba(255,255,255,.84); backdrop-filter:blur(16px) saturate(1.3); -webkit-backdrop-filter:blur(16px) saturate(1.3); border:1px solid var(--line); border-radius:999px; box-shadow:0 10px 30px -18px rgba(22,22,20,.25); }
.fa-nav .links { display:flex; gap:2px; }
.fa-nav .links a { font-size:15px; font-weight:450; text-decoration:none; padding:8px 13px; border-radius:999px; transition:background .15s; }
.fa-nav .links a:hover { background:rgba(22,22,20,.06); }
.fa-nav .burger { display:none; width:40px; height:40px; border-radius:999px; border:1px solid var(--line); background:transparent; align-items:center; justify-content:center; cursor:pointer; color:var(--ink); }
.fa-sheet { position:fixed; inset:82px 14px auto 14px; z-index:49; background:var(--card); border:1px solid var(--line); border-radius:24px; padding:8px 20px 20px; box-shadow:0 30px 60px -30px rgba(22,22,20,.35); }
.fa-sheet a.m { display:block; font-size:22px; font-weight:300; padding:15px 2px; text-decoration:none; border-bottom:1px solid var(--line); letter-spacing:-0.03em; }
@media (max-width:820px){ .fa-nav { gap:14px; width:100%; justify-content:space-between; } .fa-nav .links { display:none; } .fa-nav .burger { display:inline-flex; } .fa-nav .cta-d { margin-left:auto; } }
@media (max-width:420px){ .fa-nav .cta-d { display:none; } }

/* hero */
.fa-hero { position:relative; padding:128px 0 0; }
.fa-hero::before { content:''; position:absolute; inset:0 0 auto 0; height:760px; pointer-events:none; z-index:0;
  background:radial-gradient(38% 42% at 88% 22%, rgba(248,200,170,.55), transparent 70%), radial-gradient(34% 40% at 76% 62%, rgba(250,214,190,.45), transparent 70%), radial-gradient(40% 46% at 18% 12%, rgba(236,232,218,.9), transparent 70%), radial-gradient(30% 36% at 55% 8%, rgba(246,237,182,.45), transparent 70%); filter:blur(14px); }
.fa-hero .wrap { position:relative; z-index:1; }
.fa-crumb { font-size:14px; display:flex; gap:10px; flex-wrap:wrap; }
.fa-crumb a { text-decoration:none; } .fa-crumb a:hover { text-decoration:underline; }
.fa-badge { display:inline-block; margin-top:22px; font-size:13px; font-weight:500; letter-spacing:.04em; text-transform:uppercase; padding:7px 14px; background:var(--butter); border-radius:10px; }
.fa-hero h1 { font-size:clamp(42px,6.3vw,84px); max-width:15em; margin-top:26px; letter-spacing:-0.05em; line-height:1.02; }
.fa-hero .sub { font-size:clamp(18px,1.9vw,21px); line-height:1.55; color:var(--mute); max-width:34em; margin-top:26px; }
.fa-hero .acts { display:flex; gap:12px; flex-wrap:wrap; margin-top:32px; }
.fa-hero .note { margin-top:14px; font-size:13.5px; color:var(--mute); }
.fa-works { display:flex; align-items:center; gap:10px 26px; flex-wrap:wrap; margin-top:34px; font-size:15px; color:var(--mute); }
.fa-works b { font-weight:500; color:var(--ink); display:inline-flex; align-items:center; gap:8px; }
.fa-works b i { width:18px; height:18px; border-radius:5px; background:var(--ink); color:#fff; font-style:normal; font-size:11px; display:grid; place-items:center; font-weight:600; }
@media (max-width:760px){ .fa-hero { padding-top:108px; } .fa-hero .acts .btn { flex:1 1 auto; } }

/* workspace mock */
.fa-ws { margin-top:56px; background:var(--card); border:1px solid var(--line); border-radius:26px; overflow:hidden; box-shadow:0 40px 90px -50px rgba(22,22,20,.35); }
.fa-ws .body { display:grid; grid-template-columns:1.05fr 1fr; min-height:620px; }
.fa-pane { display:flex; flex-direction:column; min-width:0; }
.fa-pane + .fa-pane { border-left:1px solid var(--line); }
.fa-phead { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line); min-height:64px; }
.fa-phead .ic { width:34px; height:34px; border-radius:9px; background:var(--soft); display:grid; place-items:center; color:var(--mute); flex:0 0 auto; }
.fa-phead b { display:block; font-size:14.5px; font-weight:500; letter-spacing:-0.01em; } .fa-phead small { font-size:12px; color:var(--mute); }
.fa-phead .right { margin-left:auto; display:flex; align-items:center; gap:10px; }
.fa-avs { display:flex; } .fa-avs .fa-av { margin-left:-8px; border:2px solid #fff; width:28px; height:28px; } .fa-avs .fa-av:first-child { margin-left:0; }
.fa-av { width:30px; height:30px; border-radius:50%; background:var(--soft); border:1px solid var(--line); display:grid; place-items:center; font-size:11px; font-weight:600; color:var(--grey); flex:0 0 auto; }
.fa-av.f { background:var(--ink); color:#fff; border-color:var(--ink); }
.fa-av.o { background:var(--peach); color:var(--amber); border-color:transparent; }
.fa-thread { padding:22px 22px 18px; display:flex; flex-direction:column; gap:16px; flex:1; }
.fa-msg { display:grid; grid-template-columns:30px minmax(0,1fr); gap:12px; }
.fa-msg > div { min-width:0; }
.fa-msg .who { font-size:13px; color:var(--mute); } .fa-msg .who b { color:var(--ink); font-weight:500; margin-right:4px; }
.fa-msg p { font-size:15px; line-height:1.55; margin-top:2px; } .fa-msg p strong { font-weight:600; }
.fa-work { font-size:12.5px; color:var(--mute); margin-top:6px; }
.fa-chip { width:100%; margin-top:10px; border:1px solid var(--line); border-radius:14px; padding:12px; display:grid; grid-template-columns:38px 1fr auto; gap:12px; align-items:center; max-width:360px; }
.fa-chip .ic { width:38px; height:38px; border-radius:10px; background:var(--soft); display:grid; place-items:center; color:var(--mute); }
.fa-chip b { display:block; font-size:14px; font-weight:500; } .fa-chip small { font-size:12px; color:var(--mute); }
.fa .tag { display:inline-flex; align-items:center; font-size:12px; font-weight:500; padding:3px 10px; border-radius:999px; white-space:nowrap; }
.fa .tag.green { background:var(--green-bg); color:var(--green); } .fa .tag.amber { background:var(--amber-bg); color:var(--amber); }
.fa .tag.grey { background:var(--grey-bg); color:var(--grey); } .fa .tag.line { border:1px solid var(--line); color:var(--grey); background:transparent; }
.fa-action { width:100%; margin-top:10px; border:1px solid var(--line); border-radius:14px; padding:14px 16px; max-width:430px; }
.fa-action .t { flex-wrap:wrap; display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:500; font-size:14.5px; }
.fa-action .t span { display:inline-flex; align-items:center; gap:8px; } .fa-action .t svg { color:var(--acc-ink); }
.fa-action b { display:block; font-size:14px; font-weight:500; margin-top:12px; }
.fa-action p { font-size:13.5px !important; color:var(--mute); line-height:1.5; margin-top:3px !important; }
.fa-action .bt { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.fa .mini { font-size:13px; font-weight:500; height:32px; padding:0 14px; border-radius:9px; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
.fa .mini:hover { border-color:var(--ink); } .fa .mini.dark { background:var(--ink); border-color:var(--ink); color:#fff; }
.fa-composer { margin:0 18px 18px; background:var(--soft); border-radius:18px; padding:16px 16px 12px; }
.fa-composer .ph { font-size:14.5px; color:#8E8D86; }
.fa-composer .row { display:flex; justify-content:space-between; margin-top:22px; }
.fa-composer .row i { width:28px; height:28px; border-radius:50%; background:#F6D9C9; color:var(--acc-ink); display:grid; place-items:center; font-style:normal; }
.fa-tabs { display:flex; border-bottom:1px solid var(--line); }
.fa-tabs span { font-size:13.5px; padding:14px 18px 13px; border-bottom:2px solid var(--acc); margin-bottom:-1px; }
.fa-sub { display:flex; align-items:center; gap:10px; padding:12px 20px; border-bottom:1px solid var(--line); font-size:13px; color:var(--mute); }
.fa-sheetbody { padding:22px 22px 26px; }
.fa-sheetbody h4 { font-size:20px; letter-spacing:-0.03em; font-weight:400; }
.fa-sheetbody .sm { font-size:13px; color:var(--mute); margin-top:3px; }
.fa-stats { display:grid; grid-template-columns:1fr 1fr; border:1px solid var(--line); border-radius:12px; margin-top:18px; }
.fa-stats > div { padding:14px 16px; } .fa-stats > div + div { border-left:1px solid var(--line); }
.fa-stats small { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--mute); }
.fa-stats b { display:block; font-size:28px; font-weight:300; letter-spacing:-0.04em; margin-top:2px; } .fa-stats b span { font-size:13px; color:var(--mute); letter-spacing:0; margin-left:6px; font-weight:400; }
.fa-stats .miss b span { color:var(--acc-ink); }
.fa-grp { font-size:13px; color:var(--mute); margin:22px 0 6px; }
.fa-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 0; border-top:1px solid var(--line); font-size:14px; }
.fa-row > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width:900px){ .fa-ws .body { grid-template-columns:1fr; min-height:0; } .fa-pane + .fa-pane { border-left:0; border-top:1px solid var(--line); } .fa-thread { padding:18px 16px; } .fa-sheetbody { padding:18px 16px 22px; } }
.fa-note { text-align:center; margin-top:14px; font-size:12.5px; color:var(--mute); }

/* statement */
.fa-state { text-align:center; padding-top:120px; }
.fa-state h2 { font-size:clamp(30px,4.2vw,46px); line-height:1.12; letter-spacing:-0.04em; }
.fa-state p { margin-top:14px; font-size:clamp(17px,1.8vw,20px); color:var(--ink); font-weight:300; }

/* bento */
.fa-bento { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:36px 24px; margin-top:56px; align-items:start; }
.fa-art { border-radius:28px; padding:34px 26px; display:flex; align-items:center; justify-content:center; background:var(--sand); }
.fa-art.mint { background:radial-gradient(110% 120% at 100% 0%, #CFEBE0 0%, transparent 60%), var(--sand); }
.fa-art.peach { background:radial-gradient(110% 120% at 100% 0%, #F7D3C5 0%, transparent 62%), var(--sand); }
.fa-art.butter { background:radial-gradient(110% 120% at 100% 0%, #F5EAB0 0%, transparent 62%), var(--sand); }
.fa-art.sand { background:radial-gradient(110% 120% at 100% 0%, #E6E2D6 0%, transparent 62%), var(--sand); }
.fa-mcard { width:100%; background:var(--card); border-radius:16px; box-shadow:0 14px 34px -16px rgba(22,22,20,.22); font-size:14px; overflow:hidden; }
.fa-mcard .h { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--line); font-weight:500; font-size:13.5px; }
.fa-mcard .h small { font-weight:400; font-size:11.5px; background:var(--grey-bg); color:var(--grey); padding:3px 9px; border-radius:999px; }
.fa-mcard .r { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 14px; border-top:1px solid var(--line); } .fa-mcard .h + .r { border-top:0; }
.fa-mcard .r .n { display:flex; align-items:center; gap:10px; min-width:0; }
.fa-mcard .r .n em { font-style:normal; color:#9A988F; font-size:12px; }
.fa-mcard .pad { padding:12px 14px 14px; line-height:1.55; }
.fa-mcard .pad .k { color:var(--mute); } .fa-mcard .pad b { font-weight:500; }
.fa-mcard .sep { border-top:1px solid var(--line); margin:10px 0; }
.fa-bento h3 { font-size:25px; font-weight:350; letter-spacing:-0.03em; margin:20px 4px 0; line-height:1.15; }
.fa-bento p { font-size:16px; line-height:1.55; color:var(--mute); margin:8px 4px 0; }
.fa-pillrow { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; }
.fa-pillrow span { display:inline-flex; align-items:center; gap:8px; background:var(--card); border-radius:999px; padding:9px 16px; font-size:14px; font-weight:500; box-shadow:0 8px 20px -14px rgba(22,22,20,.3); }
.fa-pillrow span i { width:7px; height:7px; border-radius:50%; background:var(--green); }
.fa-dot { width:28px; height:28px; border-radius:50%; background:var(--ink); color:#fff; display:grid; place-items:center; font-size:11px; font-weight:600; }
.fa-bul { padding:2px 14px 14px; } .fa-bul div { padding:9px 0 9px 16px; position:relative; border-top:1px solid var(--line); line-height:1.4; } .fa-bul div:first-child { border-top:0; }
.fa-bul div::before { content:''; position:absolute; left:0; top:17px; width:5px; height:5px; border-radius:50%; background:var(--acc); }
@media (max-width:1000px){ .fa-bento { grid-template-columns:1fr 1fr; } }
@media (max-width:640px){ .fa-bento { grid-template-columns:1fr; gap:34px; } .fa-art { padding:28px 18px; } }

/* process */
.fa-proc { display:grid; grid-template-columns:1fr 1.15fr; gap:56px; margin-top:56px; align-items:center; }
.fa-steps { display:flex; flex-direction:column; border-left:1px solid var(--line); }
.fa-step { all:unset; box-sizing:border-box; display:block; padding:20px 0 20px 22px; margin-left:-1px; border-left:2px solid transparent; cursor:pointer; }
.fa-step .tt { display:flex; align-items:baseline; gap:14px; font-size:clamp(21px,2.2vw,26px); font-weight:300; letter-spacing:-0.03em; color:#A6A49B; transition:color .2s; }
.fa-step .tt i { font-style:normal; font-size:12px; letter-spacing:.05em; }
.fa-step .dd { font-size:16px; line-height:1.55; color:var(--mute); padding-left:30px; max-height:0; opacity:0; overflow:hidden; transition:max-height .35s, opacity .3s; }
.fa-step[aria-selected="true"] { border-left-color:var(--acc); }
.fa-step[aria-selected="true"] .tt { color:var(--ink); } .fa-step[aria-selected="true"] .tt i { color:var(--acc-ink); }
.fa-step[aria-selected="true"] .dd { max-height:120px; opacity:1; margin-top:6px; }
.fa-step:focus-visible { outline:2px solid var(--acc-ink); outline-offset:2px; }
.fa-ptile { border-radius:28px; padding:44px 40px; background:radial-gradient(90% 100% at 100% 0%, #D6ECE2 0%, transparent 62%), var(--sand); min-height:360px; display:flex; align-items:center; }
.fa-files { width:100%; } .fa-files .fr { display:grid; grid-template-columns:38px 1fr auto; gap:12px; align-items:center; padding:12px 14px; border-top:1px solid var(--line); }
.fa-files .fr b { display:block; font-size:14.5px; font-weight:500; } .fa-files .fr small { font-size:12.5px; color:var(--mute); }
.fa-kind { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; background:var(--soft); color:var(--grey); }
.fa-kind.doc { background:#E4EAF7; color:#3157A6; } .fa-kind.sheet { background:#DFF2E7; color:#1B6B43; } .fa-kind.pdf { background:#FBE3DD; color:#B2420F; }
@media (max-width:900px){ .fa-proc { grid-template-columns:1fr; gap:28px; } .fa-ptile { padding:26px 16px; min-height:0; } .fa-step[aria-selected="true"] .dd { max-height:160px; } }

/* integrations */
.fa-int { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; background:var(--soft); border-radius:32px; padding:64px; }
.fa-int .sub { font-size:19px; color:var(--mute); margin-top:18px; font-weight:300; }
.fa-ticks { list-style:none; padding:0; margin:28px 0 0; display:flex; flex-direction:column; gap:14px; }
.fa-ticks li { display:flex; align-items:center; gap:14px; font-size:16.5px; }
.fa-ticks li i { width:24px; height:24px; border-radius:50%; background:var(--butter); display:grid; place-items:center; flex:0 0 auto; color:var(--ink); }
.fa-dark .fa-ticks li i { background:var(--butter); }
.fa-int .cap { font-size:19px; margin-top:30px; font-weight:350; letter-spacing:-0.02em; }
.fa-intart { background:radial-gradient(80% 90% at 100% 0%, #F7EFC2 0%, transparent 60%), #fff; border-radius:24px; min-height:300px; display:flex; align-items:center; justify-content:center; padding:30px; }
.fa-intart .fa-pillrow span { box-shadow:0 0 0 1px var(--line); }
@media (max-width:900px){ .fa-int { grid-template-columns:1fr; padding:36px 22px; gap:30px; border-radius:26px; } .fa-intart { min-height:200px; padding:22px; } }

/* trust (the one dark card) */
.fa-dark { background:#141413; color:#F4F2EC; border-radius:32px; padding:64px; display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; }
.fa-dark .sub { font-size:19px; line-height:1.5; color:rgba(244,242,236,.6); margin-top:18px; font-weight:300; }
.fa-dark .fa-ticks { margin-top:26px; } .fa-dark .fa-ticks li { font-size:16px; }
.fa-dark .lnk { display:inline-block; margin-top:26px; font-size:15px; text-decoration:underline; text-underline-offset:4px; text-decoration-color:rgba(244,242,236,.4); }
.fa-dart { background:radial-gradient(80% 90% at 100% 0%, #F3CDBE 0%, transparent 62%), #F1EEE7; border-radius:24px; padding:44px 36px; }
.fa-perm { background:#fff; color:var(--ink); border-radius:16px; box-shadow:0 14px 34px -16px rgba(22,22,20,.3); overflow:hidden; }
.fa-perm .h { padding:14px 16px; border-bottom:1px solid var(--line); font-weight:500; font-size:14.5px; }
.fa-perm .r { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:13px 16px; border-top:1px solid var(--line); font-size:14px; } .fa-perm .h + .r { border-top:0; }
@media (max-width:900px){ .fa-dark { grid-template-columns:1fr; padding:36px 22px; gap:30px; border-radius:26px; } .fa-dart { padding:24px 16px; } }

/* faq */
.fa-faqgrid { display:grid; grid-template-columns:.8fr 1.4fr; gap:56px; align-items:start; }
.fa-faqgrid .links { margin-top:28px; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
.fa-faqgrid .links a { font-size:15px; text-decoration:none; border-bottom:1px solid #BEBBB0; padding-bottom:2px; } .fa-faqgrid .links a:hover { border-color:var(--ink); }
.fa-faq { display:flex; flex-direction:column; gap:12px; }
.fa-faq details { background:var(--soft); border-radius:22px; }
.fa-faq summary { list-style:none; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:18px; padding:22px 26px; font-size:18px; font-weight:400; letter-spacing:-0.02em; }
.fa-faq summary::-webkit-details-marker { display:none; }
.fa-faq summary svg { flex:0 0 auto; color:var(--mute); transition:transform .25s; }
.fa-faq details[open] summary svg { transform:rotate(45deg); }
.fa-faq details p { padding:0 60px 26px 26px; font-size:16px; line-height:1.65; color:var(--mute); }
@media (max-width:900px){ .fa-faqgrid { grid-template-columns:1fr; gap:28px; } .fa-faq summary { padding:18px 20px; font-size:17px; } .fa-faq details p { padding:0 20px 22px; } }

/* closing + footer (one dark block) */
.fa-end { background:#1A1A19; color:#F4F2EC; margin-top:120px; }
.fa-close { text-align:center; padding:96px 0 84px; }
.fa-close h2 { font-size:clamp(34px,5vw,56px); }
.fa-close p { font-size:19px; color:rgba(244,242,236,.62); font-weight:300; margin-top:14px; line-height:1.6; }
.fa-close .acts { margin-top:30px; display:flex; flex-direction:column; align-items:center; gap:18px; }
.fa-foot { border-top:1px solid rgba(244,242,236,.1); padding:56px 0 30px; }
.fa-cols { display:grid; grid-template-columns:1.5fr repeat(5, minmax(0,1fr)); gap:28px; }
.fa-cols h5 { font-size:12px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:rgba(244,242,236,.5); margin:0 0 16px; }
.fa-cols a { display:block; text-decoration:none; font-size:15px; padding:6px 0; color:rgba(244,242,236,.88); } .fa-cols a:hover { color:#fff; text-decoration:underline; }
.fa-cols .about { font-size:16px; line-height:1.5; color:rgba(244,242,236,.75); max-width:20em; margin-top:16px; font-weight:300; }
.fa-cols .addr { font-size:13.5px; color:rgba(244,242,236,.5); margin-top:14px; line-height:1.5; }
.fa-cols .mail { display:block; margin-top:14px; font-size:14px; padding:0; }
.fa-bottom { margin-top:40px; padding-top:22px; border-top:1px solid rgba(244,242,236,.1); font-size:14px; color:rgba(244,242,236,.5); display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; }
@media (max-width:1000px){ .fa-cols { grid-template-columns:repeat(3, minmax(0,1fr)); } .fa-cols .brand { grid-column:1 / -1; } }
@media (max-width:520px){ .fa-cols { grid-template-columns:1fr 1fr; } .fa-close { padding:72px 0 64px; } }

@media (prefers-reduced-motion: reduce){ .fa .btn, .fa-step .dd, .fa-faq summary svg { transition:none; } .fa .btn:hover { transform:none; } }

.fa .tag.red { background:#F8DDD8; color:#A12B1F; }
.fa-tl { position:relative; display:flex; flex-direction:column; gap:0; }
.fa-ev { display:grid; grid-template-columns:34px minmax(0,1fr); gap:12px; padding-bottom:18px; position:relative; }
.fa-ev:not(:last-child)::before { content:''; position:absolute; left:16px; top:34px; bottom:2px; width:1px; background:var(--line); }
.fa-ev .dot { width:34px; height:34px; border-radius:50%; background:var(--soft); border:1px solid var(--line); display:grid; place-items:center; color:var(--grey); }
.fa-ev .dot.ok { background:var(--green-bg); color:var(--green); border-color:transparent; }
.fa-ev .dot.next { background:#fff; border-style:dashed; }
.fa-ev b { display:block; font-size:14.5px; font-weight:500; letter-spacing:-0.01em; }
.fa-ev p { font-size:13.5px; line-height:1.5; color:var(--mute); margin-top:2px; }
.fa-ev small { font-size:12px; color:#9A988F; }
.fa-quote { margin-top:10px; background:var(--soft); border-radius:12px; padding:12px 14px; font-size:13.5px; line-height:1.55; }
.fa-quote .k { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--mute); margin-bottom:6px; flex-wrap:wrap; }
.fa-actbar { display:flex; gap:8px; flex-wrap:wrap; padding:14px 18px 18px; border-top:1px solid var(--line); }
.fa-brandchip { display:inline-flex; align-items:center; gap:8px; }
.fa-seg { display:flex; gap:4px; background:var(--soft); border-radius:10px; padding:3px; margin:12px 14px 0; }
.fa-seg span { flex:1; text-align:center; font-size:12.5px; padding:6px 0; border-radius:8px; color:var(--mute); }
.fa-seg span.on { background:#fff; color:var(--ink); font-weight:500; box-shadow:0 1px 3px rgba(22,22,20,.12); }
.fa-mcard .ic { width:30px; height:30px; border-radius:9px; background:var(--soft); display:grid; place-items:center; color:var(--grey); flex:0 0 auto; }
`;

/* ────────────────────────── small pieces ────────────────────────── */

type Tone = "green" | "amber" | "grey" | "line" | "red";
function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** Chase statuses exactly as the product names them. */
const STATUS_TONE: Record<string, Tone> = {
  Open: "line",
  "Following up": "amber",
  Escalated: "red",
  Resolved: "green",
};

type BrandKey = "tally" | "zoho" | "gmail" | "whatsapp" | "excel";
const BRAND_LABEL: Record<BrandKey, string> = {
  tally: "Tally",
  zoho: "Zoho Books",
  gmail: "Gmail",
  whatsapp: "WhatsApp",
  excel: "Excel and CSV",
};

/** Real marks where Simple Icons has them; a plain icon (never an imitation logo) where it does not. */
function BrandIcon({ k, size = 18 }: { k: BrandKey; size?: number }) {
  switch (k) {
    case "zoho":
      return <SiZoho size={size + 8} color="#C8202B" aria-hidden="true" />;
    case "gmail":
      return <SiGmail size={size} color="#EA4335" aria-hidden="true" />;
    case "whatsapp":
      return <SiWhatsapp size={size} color="#25D366" aria-hidden="true" />;
    case "excel":
      return (
        <SiGooglesheets size={size - 2} color="#188038" aria-hidden="true" />
      );
    default:
      return <BookOpen size={size} color="#1F4E79" aria-hidden="true" />;
  }
}

function Brand({ k }: { k: BrandKey }) {
  return (
    <span className="fa-brandchip">
      <BrandIcon k={k} />
      {BRAND_LABEL[k]}
    </span>
  );
}

function StartButton({ where }: { where: string }) {
  return (
    <Link
      to={SIGNUP_URL}
      onClick={() => trackCta("start", where)}
      className="btn btn-acc"
    >
      {CTA_START}
      <span className="ar">
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}

function PillNav() {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "How it works", href: "#how" },
    { label: "Knowledge base", href: "/blog" },
    { label: "Pricing", href: "/pricing" },
    { label: "About", href: "/about" },
  ];
  const item = (l: { label: string; href: string }, cls?: string) =>
    l.href.startsWith("#") ? (
      <a key={l.label} className={cls} href={l.href}>
        {l.label}
      </a>
    ) : (
      <Link key={l.label} className={cls} to={l.href}>
        {l.label}
      </Link>
    );
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
          <div className="links">{links.map((l) => item(l))}</div>
          <Link
            to={SIGNUP_URL}
            onClick={() => trackCta("start", "afp-nav")}
            className="btn btn-acc btn-sm cta-d"
            style={{ padding: "0 20px" }}
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
          {links.map((l) => item(l, "m"))}
          <div style={{ marginTop: 18 }}>
            <StartButton where="afp-nav-m" />
          </div>
        </div>
      )}
    </>
  );
}

/* ────────────────────────── hero + the chase screen ────────────────────────── */

const OPEN_ITEMS: [string, string][] = [
  ["HDFC current account statement, October", "Following up"],
  ["Purchase register (Tally export)", "Open"],
  ["TDS challans, Q2", "Escalated"],
];
const DONE_ITEMS = [
  "Sales register (Tally export)",
  "ICICI cash credit statement",
  "GSTR-2B, October",
];

function Workspace() {
  const [paused, setPaused] = useState(false);
  return (
    <figure style={{ margin: 0 }}>
      <div className="fa-ws" role="group" aria-label="Sample chase screen">
        <div className="body">
          <div className="fa-pane">
            <div className="fa-phead">
              <span className="ic">
                <BellRing size={17} />
              </span>
              <div>
                <b>HDFC statement, October</b>
                <small>Mehta Textiles · Sample data</small>
              </div>
              <div className="right">
                {paused ? (
                  <Tag tone="grey">Paused until Fri</Tag>
                ) : (
                  <Tag tone="amber">Following up</Tag>
                )}
                <span className="ic" aria-hidden="true">
                  <PanelRight size={16} />
                </span>
              </div>
            </div>
            <div className="fa-thread">
              <div className="fa-tl">
                <div className="fa-ev">
                  <span className="dot">
                    <ClipboardList size={16} />
                  </span>
                  <div>
                    <b>Chase created</b>
                    <p>
                      October bank statement for Mehta Textiles, due Friday, by
                      email and WhatsApp.
                    </p>
                    <small>Mon 9:42 AM · Riya</small>
                  </div>
                </div>
                <div className="fa-ev">
                  <span className="dot ok">
                    <Mail size={16} />
                  </span>
                  <div>
                    <b>Day 0 · email sent</b>
                    <p>To Rakesh Mehta. Names the document and the month.</p>
                    <small>Mon 9:45 AM</small>
                  </div>
                </div>
                <div className="fa-ev">
                  <span className="dot ok">
                    <MessageCircle size={16} />
                  </span>
                  <div>
                    <b>Day 3 · email and WhatsApp sent</b>
                    <p>Follow-up 1 of 3.</p>
                    <small>Thu 10:02 AM</small>
                  </div>
                </div>
                <div className="fa-ev">
                  <span className="dot next">
                    <Clock size={16} />
                  </span>
                  <div>
                    <b>Next: day 7</b>
                    <p>
                      Goes out Monday to Saturday, 9:30 am to 6:30 pm IST. Stops
                      the moment the document arrives. On day 10 it comes to a
                      partner.
                    </p>
                    <div className="fa-quote">
                      <div className="k">
                        <span>Next message · WhatsApp</span>
                        <span>Tone: standard</span>
                      </div>
                      Hi Rakesh, hope you’re well. Could you please share the
                      bank statement for Mehta Textiles when you get a chance?
                      Thank you! – Shah &amp; Co
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="fa-actbar">
              <button type="button" className="mini dark">
                Mark resolved
              </button>
              <button type="button" className="mini">
                Escalate to partner
              </button>
              <button
                type="button"
                className="mini"
                onClick={() => setPaused((v) => !v)}
              >
                {paused ? "Resume" : "Pause until promised date"}
              </button>
            </div>
          </div>
          <div className="fa-pane">
            <div className="fa-tabs">
              <span>Chaser</span>
            </div>
            <div className="fa-sub">
              <ClipboardList size={15} /> Document requests · this client
            </div>
            <div className="fa-sheetbody">
              <h4>Mehta Textiles · October close</h4>
              <div className="sm">11 document requests</div>
              <div className="fa-stats">
                <div>
                  <small>Resolved</small>
                  <b>
                    8<span>of 11</span>
                  </b>
                </div>
                <div className="miss">
                  <small>Still open</small>
                  <b>
                    3<span>due Friday</span>
                  </b>
                </div>
              </div>
              <div className="fa-grp">Still open</div>
              {OPEN_ITEMS.map(([n, st]) => (
                <div className="fa-row" key={n}>
                  <span>{n}</span>
                  <Tag tone={STATUS_TONE[st]!}>{st}</Tag>
                </div>
              ))}
              <div className="fa-grp">Resolved</div>
              {DONE_ITEMS.map((n) => (
                <div className="fa-row" key={n}>
                  <span>{n}</span>
                  <Tag tone="green">Resolved</Tag>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="fa-note">
        Sample screen with made-up data, using the product’s own statuses.
        Schedule, channel and tone are set per request.
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
          Stop chasing clients
          <br />
          for documents.
        </h1>
        <p className="sub">
          A workspace for every client. FynHelp tracks what’s missing, follows
          up on your schedule, and asks a partner before anything touches the
          books.
        </p>
        <div className="acts">
          <StartButton where="afp-hero" />
          <DemoLink location="afp-hero" className="btn btn-line">
            {CTA_DEMO}
          </DemoLink>
        </div>
        <p className="note">{CTA_NOTE}</p>
        <div className="fa-works" aria-label="Works with">
          <span>Works with</span>
          {(["tally", "zoho", "gmail", "whatsapp"] as BrandKey[]).map((k) => (
            <b key={k}>
              <BrandIcon k={k} />
              {k === "tally" ? "Tally" : BRAND_LABEL[k]}
            </b>
          ))}
        </div>
        <Workspace />
      </div>
    </section>
  );
}

/* ────────────────────────── statement + bento ────────────────────────── */

function Statement() {
  return (
    <section className="wrap fa-state">
      <h2>
        Your team knows the clients.
        <br />
        FynHelp handles the chasing.
      </h2>
      <p>One workspace per client. One status everyone trusts.</p>
    </section>
  );
}

function Bento() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="sec wrap">
      <h2 className="h2">
        Everything your firm
        <br />
        needs to stop chasing.
      </h2>
      <div className="fa-bento">
        <article>
          <div className="fa-art mint">
            <div className="fa-mcard">
              <div className="h">Mehta Textiles</div>
              {[
                [FileText, "Documents", "14 read"],
                [BellRing, "Chase items", "3 open"],
                [Scale, "Bank reconciliation", "412 of 427 matched"],
                [FileBarChart, "October MIS", "Draft"],
              ].map(([Icon, n, v]) => {
                const I = Icon as typeof FileText;
                return (
                  <div className="r" key={n as string}>
                    <span className="n">
                      <span className="ic">
                        <I size={15} />
                      </span>
                      {n as string}
                    </span>
                    <em
                      style={{
                        fontStyle: "normal",
                        color: "#8E8D86",
                        fontSize: 12.5,
                      }}
                    >
                      {v as string}
                    </em>
                  </div>
                );
              })}
            </div>
          </div>
          <h3>A workspace for every client</h3>
          <p>
            Documents, follow-ups, reconciliation and the MIS for one client, in
            one place.
          </p>
        </article>

        <article>
          <div className="fa-art peach">
            <div className="fa-mcard">
              <div className="h">
                Document requests <small>3 open</small>
              </div>
              {[
                ["Sales register", "Resolved"],
                ["HDFC statement", "Following up"],
                ["Purchase register", "Open"],
                ["Q2 TDS challans", "Escalated"],
              ].map(([n, st]) => (
                <div className="r" key={n}>
                  <span>{n}</span>
                  <Tag tone={STATUS_TONE[st!]!}>{st}</Tag>
                </div>
              ))}
            </div>
          </div>
          <h3>Every request, tracked to closure</h3>
          <p>
            Open, following up, escalated or resolved. A request closes itself
            when the document arrives.
          </p>
        </article>

        <article>
          <div className="fa-art butter">
            <div className="fa-mcard">
              <div className="h">
                Follow-up · Day 3 <Tag tone="line">Email</Tag>
              </div>
              <div className="fa-seg" aria-hidden="true">
                <span>Gentle</span>
                <span className="on">Standard</span>
                <span>Firm</span>
              </div>
              <div className="pad">
                Hi Rakesh, hope you’re well. Could you please share the bank
                statement for Mehta Textiles when you get a chance? Thank you! –
                Shah &amp; Co
              </div>
            </div>
          </div>
          <h3>Reminders in your firm’s name</h3>
          <p>
            Pick a gentle, standard or firm tone. Each message names the exact
            document and month, and signs off as your firm.
          </p>
        </article>

        <article>
          <div className="fa-art sand">
            <div className="fa-pillrow">
              {(
                ["tally", "zoho", "gmail", "whatsapp", "excel"] as BrandKey[]
              ).map((k) => (
                <span key={k}>
                  <BrandIcon k={k} size={16} />
                  {BRAND_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
          <h3>Works with Tally and Zoho Books</h3>
          <p>
            Upload your Tally exports or connect Zoho Books read-only. Anything
            posted to your books waits for a partner.
          </p>
        </article>

        <article>
          <div className="fa-art mint">
            <div className="fa-mcard">
              <div className="h">Upload link</div>
              <div className="r" style={{ borderTop: 0 }}>
                <span className="n">
                  <span className="ic">
                    <Inbox size={15} />
                  </span>
                  <span style={{ lineHeight: 1.3 }}>
                    Mehta Textiles
                    <br />
                    <span style={{ color: "var(--mute)", fontSize: 12.5 }}>
                      HDFC statement, October
                    </span>
                  </span>
                </span>
              </div>
              <div
                className="r"
                style={{
                  background: "var(--soft)",
                  margin: "0 12px",
                  borderRadius: 12,
                  borderTop: 0,
                }}
              >
                <span style={{ lineHeight: 1.3 }}>
                  Anyone with
                  <br />
                  the link
                </span>
                <span style={{ color: "var(--mute)", fontSize: 13 }}>
                  can upload
                </span>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setCopied(true)}
                  aria-live="polite"
                  style={{ height: 28, fontSize: 12 }}
                >
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
              <div
                className="pad"
                style={{ fontSize: 12.5, color: "var(--mute)" }}
              >
                No account needed to open it. Expires in 14 days.
              </div>
            </div>
          </div>
          <h3>Links clients can open</h3>
          <p>
            Share an upload link. No client login needed, and photos from a
            phone work.
          </p>
        </article>

        <article>
          <div className="fa-art peach">
            <div className="fa-mcard">
              <div className="h">
                October MIS · Mehta Textiles <small>Draft</small>
              </div>
              <div className="fa-bul">
                <div>Revenue ties to 126 bank lines</div>
                <div>15 lines need a decision</div>
                <div>Partner signs off before it goes out</div>
              </div>
            </div>
          </div>
          <h3>Month-end, traced to source</h3>
          <p>
            Once the files are in, the MIS is drafted. Every figure opens the
            lines behind it.
          </p>
        </article>
      </div>
    </section>
  );
}

/* ────────────────────────── process ────────────────────────── */

type FileRow = {
  icon: "doc" | "sheet" | "mail" | "chat" | "clock" | "user";
  title: string;
  sub: string;
  tag?: [Tone, string];
};
const ICONS = {
  doc: FileText,
  sheet: FileSpreadsheet,
  mail: Mail,
  chat: MessageCircle,
  clock: Clock,
  user: UserRound,
};
const STEPS: { n: string; t: string; d: string; files: FileRow[] }[] = [
  {
    n: "01",
    t: "Open a workspace per client",
    d: "Add the client and their contact. Documents, follow-ups, reconciliation and the MIS all live there.",
    files: [
      { icon: "doc", title: "Engagement letter", sub: "Document · uploaded" },
      {
        icon: "sheet",
        title: "Tally day book, September",
        sub: "Export · read",
      },
      { icon: "doc", title: "HDFC statement, September", sub: "PDF · read" },
    ],
  },
  {
    n: "02",
    t: "Ask for what’s missing",
    d: "Create a request for each document: which one, which month, when it’s due, and whether to use email, WhatsApp or both.",
    files: [
      {
        icon: "doc",
        title: "HDFC statement, October",
        sub: "Due Friday · email + WhatsApp",
        tag: ["line", "Open"],
      },
      {
        icon: "sheet",
        title: "Purchase register",
        sub: "Due Friday · email",
        tag: ["line", "Open"],
      },
      {
        icon: "doc",
        title: "TDS challans, Q2",
        sub: "Due Friday · WhatsApp",
        tag: ["line", "Open"],
      },
    ],
  },
  {
    n: "03",
    t: "Let the follow-ups run",
    d: "Day 0, 3 and 7 by default. They stop the moment the document arrives, and on day 10 the request comes to a partner.",
    files: [
      {
        icon: "mail",
        title: "Day 0 · email",
        sub: "Sent Monday",
        tag: ["green", "Sent"],
      },
      {
        icon: "chat",
        title: "Day 3 · email and WhatsApp",
        sub: "Sent Thursday",
        tag: ["green", "Sent"],
      },
      {
        icon: "clock",
        title: "Day 7 · next follow-up",
        sub: "Mon to Sat, 9:30 am to 6:30 pm IST",
        tag: ["amber", "Scheduled"],
      },
    ],
  },
  {
    n: "04",
    t: "Reconcile, then sign off",
    d: "With the files in, bank lines are matched to the books and the MIS is drafted. A partner signs it off.",
    files: [
      {
        icon: "sheet",
        title: "Bank to Tally match",
        sub: "412 of 427 lines matched",
        tag: ["green", "15 to review"],
      },
      {
        icon: "doc",
        title: "October MIS",
        sub: "Every figure opens its lines",
        tag: ["amber", "Needs sign-off"],
      },
      {
        icon: "user",
        title: "Partner sign-off",
        sub: "Before anything goes to the client",
        tag: ["grey", "Pending"],
      },
    ],
  },
];

function Process() {
  const [i, setI] = useState(0);
  const cur = STEPS[i]!;
  return (
    <section className="sec wrap" id="how">
      <h2 className="h2">
        From missing list
        <br />
        to a complete file.
      </h2>
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
            >
              <span className="tt">
                <i>{s.n}</i>
                {s.t}
              </span>
              <span className="dd" style={{ display: "block" }}>
                {s.d}
              </span>
            </button>
          ))}
        </div>
        <div className="fa-ptile" role="tabpanel" aria-live="polite">
          <div className="fa-mcard fa-files">
            <div className="h">Step {cur.n}</div>
            {cur.files.map((f) => {
              const I = ICONS[f.icon];
              return (
                <div className="fr" key={`${cur.n}-${f.title}`}>
                  <span className="fa-kind">
                    <I size={17} />
                  </span>
                  <div>
                    <b>{f.title}</b>
                    <small>{f.sub}</small>
                  </div>
                  {f.tag ? <Tag tone={f.tag[0]}>{f.tag[1]}</Tag> : <span />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── integrations ────────────────────────── */

function Integrations() {
  const rows: [BrandKey, string][] = [
    ["tally", "Tally for the books: upload exports as you do today"],
    ["zoho", "Zoho Books, read-only, for bank ledgers and open invoices"],
    ["gmail", "Gmail, read-only, to pick up client attachments"],
    ["whatsapp", "WhatsApp to follow up with clients"],
  ];
  return (
    <section className="sec wrap">
      <div className="fa-int">
        <div>
          <h2 className="h2">
            Keep the tools your
            <br />
            firm already uses.
          </h2>
          <p className="sub">
            FynHelp works around your ledger, not instead of it.
          </p>
          <ul className="fa-ticks">
            {rows.map(([k, t]) => (
              <li key={k}>
                <i>
                  <Check size={13} />
                </i>
                {t}
              </li>
            ))}
          </ul>
          <p className="cap">No new portal for clients. Just a faster chase.</p>
        </div>
        <div className="fa-intart" aria-hidden="true">
          <div className="fa-pillrow">
            {(
              ["tally", "zoho", "gmail", "whatsapp", "excel"] as BrandKey[]
            ).map((k) => (
              <span key={k}>
                <BrandIcon k={k} size={16} />
                {BRAND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── trust (the one dark card) ────────────────────────── */

function Trust() {
  return (
    <section className="sec wrap">
      <div className="fa-dark">
        <div>
          <h2 className="h2">
            Client data,
            <br />
            handled with care.
          </h2>
          <p className="sub">
            Each firm’s data is kept apart, and every posting waits for a yes.
          </p>
          <ul className="fa-ticks">
            {[
              "Only your firm’s team can open a client’s records",
              "Partner, manager and junior roles, checked on the server",
              "Postings to your books and MIS sign-off wait for a partner",
            ].map((t) => (
              <li key={t}>
                <i>
                  <Check size={13} />
                </i>
                {t}
              </li>
            ))}
          </ul>
          <Link to="/security" className="lnk">
            How we handle security
          </Link>
        </div>
        <div className="fa-dart">
          <div className="fa-perm" role="group" aria-label="Sample permissions">
            <div className="h">What needs a partner</div>
            {(
              [
                ["Post to Tally or Zoho", "amber", "Ask first"],
                ["Release the monthly MIS", "amber", "Ask first"],
                ["Read bank statements", "green", "Automatic"],
                ["Connect Gmail or WhatsApp", "grey", "Partner only"],
              ] as [string, Tone, string][]
            ).map(([t, tone, l]) => (
              <div className="r" key={t}>
                <span>{t}</span>
                <Tag tone={tone}>{l}</Tag>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── faq, closing, footer ────────────────────────── */

function Faq() {
  return (
    <section className="sec wrap">
      <div className="fa-faqgrid">
        <div>
          <h2 className="h2">
            Questions,
            <br />
            answered.
          </h2>
          <div className="links">
            <Link to="/blog/client-document-collection-reminder-templates-ca-firms">
              Reminder templates for client documents
            </Link>
            <Link to="/blog/chatgpt-for-accounting-vs-fynhelp-ca-firms-india">
              ChatGPT for accounting vs FynHelp
            </Link>
          </div>
        </div>
        <div className="fa-faq">
          {ACCOUNTING_FAQS.map(([q, a], k) => (
            <details key={q} open={k === 0}>
              <summary>
                {q}
                <Plus size={18} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
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
      ["Pricing", "/pricing"],
    ],
  },
  {
    h: "Use cases",
    links: [
      ["Accounting firms", "/for/accounting-firms"],
      ["CA firms", "/ca-firms"],
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
      ["Bank reconciliation", "/agents/recon"],
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

function Closing() {
  return (
    <div className="fa-end">
      <div className="wrap fa-close">
        <h2>Spend tax season on the tax.</h2>
        <p>
          Let FynHelp handle the chasing.
          <br />
          Your team handles the judgment.
        </p>
        <div className="acts">
          <StartButton where="afp-close" />
          <DemoLink location="afp-close" className="btn btn-dline">
            {CTA_DEMO}
          </DemoLink>
        </div>
      </div>
      <footer className="fa-foot">
        <div className="wrap">
          <div className="fa-cols">
            <div className="brand">
              <FynLogo variant="light" size="sm" loading="lazy" />
              <p className="about">
                One workspace for your firm, and every client in it.
              </p>
              <p className="addr">Bengaluru, India</p>
              <a className="mail" href="mailto:support@fynhelp.com">
                support@fynhelp.com
              </a>
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
              &copy; {new Date().getFullYear()} {COMPANY.entity || "FynHelp"}
            </span>
          </div>
        </div>
      </footer>
    </div>
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
      </main>
      <Closing />
    </div>
  );
}
