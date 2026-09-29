// Shared FynHelp marketing design system (extracted from HomePage).

export const C = {
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

export const SITE_STYLES = `
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
.fh-foot-grid { display:grid; grid-template-columns:1.5fr repeat(4,1fr); gap:30px; }
@media (max-width:1000px){ .fh-foot-grid{ grid-template-columns:1fr 1fr 1fr; } }
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


/* ── shared page chrome (inner marketing pages) ── */
.fh-phero { padding:104px 0 34px; position:relative; }
.fh-phero::before { content:''; position:absolute; inset:-40px 0 auto; height:420px; background:radial-gradient(55% 80% at 50% 0%, rgba(226,103,63,.12), transparent 70%); pointer-events:none; }
.fh-phero .in { position:relative; z-index:2; max-width:62ch; }
.fh-phero.center .in { margin-inline:auto; text-align:center; }
.fh-phero h1 { font-size:clamp(34px,5.6vw,64px); margin-top:16px !important; }
.fh-phero p.sub { color:${C.body}; font-size:15.5px; line-height:1.66; margin-top:18px; max-width:56ch; }
.fh-phero.center p.sub { margin-inline:auto; }
.fh-phero .acts { display:flex; gap:10px; flex-wrap:wrap; margin-top:26px; }
.fh-phero.center .acts { justify-content:center; }
.fh-strip { border-top:1px solid ${C.line}; border-bottom:1px solid ${C.line}; padding:20px 0; }
.fh-strip-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
@media (max-width:760px){ .fh-strip-grid{ grid-template-columns:1fr 1fr; } }
.fh-strip .v { font-size:22px; font-weight:700; letter-spacing:-0.04em; font-variant-numeric:tabular-nums; }
.fh-strip .l { font-size:11.5px; color:${C.muted}; margin-top:3px; }
.fh-list { list-style:none; padding:0; margin:18px 0 0; display:grid; gap:10px; }
.fh-list li { display:flex; gap:10px; font-size:13.5px; line-height:1.6; color:${C.body}; }
.fh-list li svg { flex:0 0 auto; margin-top:3px; color:${C.coral}; }
.fh-note { font-size:12.5px; color:${C.muted}; margin-top:14px; }
.fh-soon { display:inline-flex; align-items:center; gap:7px; font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; padding:6px 12px; border-radius:999px; background:rgba(226,103,63,.12); color:${C.coral}; }
`;
