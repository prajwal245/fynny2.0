import { C } from "@/lib/sitePalette";

/**
 * "Four agents, one close": a bento of live product components, one per agent (plus the partner's sign-off and
 * the control room). Everything shown is something FynHelp really does today, on invented sample data
 * (Sundara Textiles, September). Entrance animation rides on the home page's `.fh-rv` / `.in` reveal.
 */

const STYLES = `
.ab { --ab-green:#1F5A46; --ab-greenbg:rgba(31,90,70,.1); --ab-coral:#E2673F; --ab-coralbg:rgba(226,103,63,.12); --ab-goldbg:rgba(139,105,20,.12); }
.ab-head { text-align:center; max-width:760px; margin:0 auto 52px; }
.ab-grid { display:grid; grid-template-columns:repeat(12,1fr); gap:20px; }
.ab-card { position:relative; border-radius:26px; background:${C.card}; border:1px solid ${C.line}; box-shadow:0 1px 0 rgba(255,255,255,.9) inset, 0 24px 48px -32px rgba(42,17,9,.28), 0 6px 16px -10px rgba(42,17,9,.12); padding:22px 22px 26px; overflow:hidden; display:flex; flex-direction:column; height:100%; transition:transform .5s cubic-bezier(.16,1,.3,1), box-shadow .5s; }
.ab-card:hover { transform:translateY(-4px); box-shadow:0 1px 0 rgba(255,255,255,.9) inset, 0 34px 60px -30px rgba(42,17,9,.34), 0 10px 22px -12px rgba(42,17,9,.16); }
.ab-card::after { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:radial-gradient(120% 70% at 85% -10%, rgba(226,103,63,.07), transparent 55%); }
.ab-w6 { grid-column:span 6; } .ab-w3 { grid-column:span 3; }
.ab-stage { flex:1; display:flex; flex-direction:column; justify-content:center; min-height:250px; }
.ab-who { display:flex; align-items:center; gap:10px; margin-top:20px; }
.ab-who h3 { font-size:21px; letter-spacing:-0.03em; }
.ab-dot { width:9px; height:9px; border-radius:50%; flex:0 0 auto; }
.ab-sub { margin:8px 0 0; font-size:15.5px; line-height:1.55; color:${C.body}; max-width:46ch; }
.ab-win { border-radius:16px; background:#fff; border:1px solid ${C.line}; box-shadow:0 18px 36px -26px rgba(42,17,9,.3); overflow:hidden; }
.ab-bar { display:flex; align-items:center; gap:6px; padding:10px 14px; background:${C.pageAlt}; }
.ab-bar i { width:9px; height:9px; border-radius:50%; background:rgba(23,18,8,.16); display:block; }
.ab-bar span { margin-left:auto; font-size:12px; color:${C.muted}; font-weight:500; }
.ab-row { display:grid; grid-template-columns:62px 1fr auto auto; align-items:center; gap:12px; padding:9px 14px; font-size:13.5px; border-top:1px solid ${C.lineSoft}; }
.ab-row .d { color:${C.muted}; } .ab-row .n { color:${C.ink}; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .ab-row .a { color:${C.ink}; font-variant-numeric:tabular-nums; text-align:right; }
.ab-chip { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.ab-chip.g { background:var(--ab-greenbg); color:var(--ab-green); } .ab-chip.y { background:var(--ab-goldbg); color:${C.gold}; } .ab-chip.c { background:var(--ab-coralbg); color:#B4451F; } .ab-chip.k { background:rgba(23,18,8,.06); color:${C.ink}; }
.ab-prog { height:7px; border-radius:99px; background:rgba(23,18,8,.07); overflow:hidden; margin:12px 14px 14px; }
.ab-prog b { display:block; height:100%; width:0; border-radius:99px; background:linear-gradient(90deg, var(--ab-green), #3A8466); transition:width 1.4s cubic-bezier(.16,1,.3,1) .5s; }
.fh-rv.in .ab-prog b { width:71%; }
.ab-wa { background:#EFE7DA; border-radius:18px; padding:14px; display:flex; flex-direction:column; gap:9px; border:1px solid ${C.line}; }
.ab-wh { display:flex; align-items:center; gap:10px; padding:2px 2px 8px; }
.ab-av { width:34px; height:34px; border-radius:50%; background:${C.maroon}; color:#fff; display:grid; place-items:center; font-weight:600; font-size:15px; flex:0 0 auto; }
.ab-wh strong { font-size:14px; display:block; line-height:1.2; } .ab-wh small { font-size:12px; color:${C.muted}; }
.ab-msg { max-width:88%; padding:10px 12px; border-radius:14px 14px 14px 4px; background:#fff; font-size:13.5px; line-height:1.45; color:${C.ink}; box-shadow:0 1px 0 rgba(23,18,8,.06); }
.ab-msg.me { align-self:flex-end; background:#DDEFD2; border-radius:14px 14px 4px 14px; }
.ab-btns { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.ab-btns span { font-size:12px; font-weight:600; color:#1B6FA8; background:#F4F8FB; border-radius:999px; padding:5px 11px; }
.ab-note { align-self:center; font-size:12px; font-weight:600; color:${C.muted}; background:rgba(255,255,255,.7); border-radius:99px; padding:5px 12px; }
.ab-file { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:14px; border:1.5px dashed rgba(23,18,8,.2); background:rgba(255,255,255,.6); }
.ab-fic { width:38px; height:44px; border-radius:8px; background:#fff; border:1px solid ${C.line}; display:grid; place-items:center; font-size:10px; font-weight:700; color:${C.muted}; flex:0 0 auto; }
.ab-list { margin:12px 0 0; padding:0; list-style:none; display:grid; gap:7px; }
.ab-list li { display:flex; align-items:center; gap:9px; font-size:13.5px; color:${C.ink}; }
.ab-tick { width:18px; height:18px; border-radius:50%; background:var(--ab-greenbg); color:var(--ab-green); display:grid; place-items:center; flex:0 0 auto; }
.ab-mis { background:#fff; border:1px solid ${C.line}; border-radius:16px; padding:16px; box-shadow:0 18px 36px -26px rgba(42,17,9,.3); }
.ab-mis .k { font-size:12px; color:${C.muted}; font-weight:500; } .ab-mis .v { font-size:clamp(19px,1.7vw,24px); white-space:nowrap; font-weight:600; letter-spacing:-0.03em; font-variant-numeric:tabular-nums; margin-top:2px; }
.ab-mis .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ab-bars { display:flex; align-items:flex-end; gap:5px; height:54px; margin-top:14px; }
.ab-bars span { flex:1; border-radius:5px 5px 2px 2px; background:rgba(169,56,56,.18); transform-origin:bottom; transform:scaleY(.15); transition:transform 1s cubic-bezier(.16,1,.3,1) var(--d,.4s); }
.fh-rv.in .ab-bars span { transform:scaleY(1); } .ab-bars span:last-child { background:${C.maroon}; }
.ab-sign { background:#fff; border:1px solid ${C.line}; border-radius:16px; padding:16px; box-shadow:0 18px 36px -26px rgba(42,17,9,.3); }
.ab-btn { margin-top:14px; display:flex; align-items:center; justify-content:center; gap:8px; width:100%; border-radius:99px; padding:11px 12px; font-size:14px; white-space:nowrap; font-weight:600; background:${C.ink}; color:${C.onDark}; }
.ab-btn.done { background:var(--ab-greenbg); color:var(--ab-green); }
.ab-todo { display:grid; gap:9px; }
.ab-item { display:flex; align-items:center; gap:10px; padding:11px 12px; border-radius:14px; background:#fff; border:1px solid ${C.line}; font-size:13.5px; line-height:1.3; }
.ab-item .t { flex:1; color:${C.ink}; font-weight:500; }
.ab-anim { opacity:0; transform:translateY(10px); transition:opacity .6s cubic-bezier(.16,1,.3,1) var(--d,0s), transform .6s cubic-bezier(.16,1,.3,1) var(--d,0s); }
.fh-rv.in .ab-anim { opacity:1; transform:none; }
@keyframes ab-pulse { 0%,100% { opacity:1; } 50% { opacity:.35; } }
.ab-live { animation:ab-pulse 1.6s ease-in-out infinite; }
.ab-foot { margin:22px 0 0; text-align:center; font-size:13px; color:${C.muted}; }
@media (max-width:1040px){ .ab-w3 { grid-column:span 6; } }
@media (max-width:720px){ .ab-w6, .ab-w3 { grid-column:span 12; } .ab-stage { min-height:0; } .ab-row { grid-template-columns:52px 1fr auto; } .ab-row .a { display:none; } }
@media (prefers-reduced-motion:reduce){ .ab-anim, .ab-bars span { opacity:1 !important; transform:none !important; transition:none !important; } .ab-prog b { width:71%; transition:none; } .ab-live { animation:none; } .ab-card { transition:none; } }
`;

const Tick = () => (
  <span className="ab-tick" aria-hidden="true">
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

const MATCHES: { d: string; n: string; a: string; chip: string; tone: "g" | "y" | "c" }[] = [
  { d: "03 Sep", n: "NEFT Sundara Textiles", a: "48,200", chip: "Exact match", tone: "g" },
  { d: "05 Sep", n: "UPI Acme Traders", a: "12,500", chip: "Exact match", tone: "g" },
  { d: "09 Sep", n: "RTGS Lotus Fabrics", a: "66,000", chip: "Close match", tone: "y" },
  { d: "12 Sep", n: "Cheque 4471", a: "3,150", chip: "Your rule", tone: "g" },
  { d: "18 Sep", n: "Bank charges", a: "590", chip: "Needs you", tone: "c" },
];

function Delay(i: number, base = 0.15, step = 0.12) {
  return { ["--d" as string]: `${(base + i * step).toFixed(2)}s` } as React.CSSProperties;
}

export default function AgentsBento() {
  return (
    <div className="ab">
      <style>{STYLES}</style>

      <div className="ab-head">
        <span className="fh-kicker">Four agents, one close</span>
        <h2 className="fh-h2">
          Hire four agents.
          <br />
          <span className="ital">You make the calls.</span>
        </h2>
        <p className="fh-lead" style={{ marginLeft: "auto", marginRight: "auto" }}>
          Each agent has one job. They start on their own, show their work, and come to you only when a decision is
          yours. The partner signs off.
        </p>
      </div>

      <div className="ab-grid">
        {/* Recon */}
        <div className="ab-w6 fh-rv">
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-win">
                <div className="ab-bar"><i /><i /><i /><span>Recon · Sundara Textiles · September</span></div>
                {MATCHES.map((m, i) => (
                  <div className="ab-row ab-anim" style={Delay(i)} key={m.n}>
                    <span className="d">{m.d}</span>
                    <span className="n">{m.n}</span>
                    <span className="a">{m.a}</span>
                    <span className={`ab-chip ${m.tone}`}>{m.chip}</span>
                  </div>
                ))}
                <div className="ab-prog" aria-hidden="true"><b /></div>
              </div>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: "#2F855A" }} /><h3>Recon matches the bank to your books</h3></div>
            <p className="ab-sub">Starts by itself once the books are in. Exact, close and your own rules, and it leaves only the odd lines for you, with the reason beside each.</p>
          </div>
        </div>

        {/* Chaser */}
        <div className="ab-w6 fh-rv" style={{ transitionDelay: "80ms" }}>
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-wa">
                <div className="ab-wh">
                  <span className="ab-av">M</span>
                  <div><strong>Mehta &amp; Co</strong><small>Chaser · reminder 1 of 3</small></div>
                  <span className="ab-chip g ab-live" style={{ marginLeft: "auto" }}>Waiting for client</span>
                </div>
                <div className="ab-msg ab-anim" style={Delay(0)}>
                  Hello Rao Steels, a gentle reminder from Mehta &amp; Co. For September we are still waiting for: bank statement. Please reply here with the file attached.
                  <div className="ab-btns"><span>Upload documents</span><span>Sending today</span><span>Need more time</span></div>
                </div>
                <div className="ab-msg me ab-anim" style={Delay(1, 0.35, 0.25)}>Sending today</div>
                <div className="ab-note ab-anim" style={Delay(2, 0.35, 0.3)}>The moment the file arrives, Chaser stops</div>
              </div>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: "#C9A227" }} /><h3>Chaser follows up with your clients</h3></div>
            <p className="ab-sub">Polite WhatsApp or email reminders. Your client taps Upload, no login, no app. You see who sent what, and who promised when.</p>
          </div>
        </div>

        {/* Extract */}
        <div className="ab-w3 fh-rv" style={{ transitionDelay: "40ms" }}>
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-file ab-anim" style={Delay(0)}>
                <span className="ab-fic">CSV</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>hdfc_statement_sep2026.csv</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Bank statement</div>
                </div>
              </div>
              <ul className="ab-list">
                {["Dates and amounts read", "Parties and references found", "7 bank lines structured"].map((t, i) => (
                  <li className="ab-anim" style={Delay(i + 1, 0.2, 0.18)} key={t}><Tick />{t}</li>
                ))}
              </ul>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: "#2B6CB0" }} /><h3>Extract reads your papers</h3></div>
            <p className="ab-sub">Statements, Tally files, even photos. Read in seconds and checked before anything is used.</p>
          </div>
        </div>

        {/* Narrate */}
        <div className="ab-w3 fh-rv" style={{ transitionDelay: "100ms" }}>
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-mis ab-anim" style={Delay(0)}>
                <div className="row">
                  <div><div className="k">Revenue</div><div className="v">₹1,65,000</div></div>
                  <div><div className="k">Expenses</div><div className="v">₹78,516</div></div>
                </div>
                <div style={{ marginTop: 12 }}><div className="k">Net</div><div className="v" style={{ color: C.green }}>₹86,484</div></div>
                <div className="ab-bars" aria-hidden="true">
                  {[34, 46, 40, 58, 52, 70, 100].map((h, i) => <span key={i} style={{ height: `${h}%`, ["--d" as string]: `${0.4 + i * 0.07}s` } as React.CSSProperties} />)}
                </div>
              </div>
              <div style={{ marginTop: 12 }} className="ab-anim" ><span className="ab-chip k" style={Delay(4)}>Click any number to see its source lines</span></div>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: C.maroon }} /><h3>Narrate writes the monthly report</h3></div>
            <p className="ab-sub">A client-ready MIS in one click, with every figure traceable to the bank lines behind it.</p>
          </div>
        </div>

        {/* Sign-off */}
        <div className="ab-w3 fh-rv" style={{ transitionDelay: "160ms" }}>
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-sign ab-anim" style={Delay(0)}>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>Ready for the partner</div>
                <ul className="ab-list">
                  {["Extract: statement and day book read", "Recon: 5 of 7 matched", "2 exceptions decided", "Report generated"].map((t) => (
                    <li key={t}><Tick />{t}</li>
                  ))}
                </ul>
                <div className="ab-btn done"><svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Signed off by Meera</div>
              </div>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: C.ink }} /><h3>The partner signs off</h3></div>
            <p className="ab-sub">Agents prepare. A person decides. One tap closes the month.</p>
          </div>
        </div>

        {/* Control room */}
        <div className="ab-w3 fh-rv" style={{ transitionDelay: "220ms" }}>
          <div className="ab-card">
            <div className="ab-stage">
              <div className="ab-todo">
                {[
                  { t: "Recon finished for 3 clients", chip: "Done", tone: "g" as const },
                  { t: "2 lines need your call", chip: "Needs you", tone: "c" as const },
                  { t: "Chaser is waiting on 4 documents", chip: "Waiting", tone: "y" as const },
                ].map((x, i) => (
                  <div className="ab-item ab-anim" style={Delay(i)} key={x.t}>
                    <span className="t">{x.t}</span>
                    <span className={`ab-chip ${x.tone}`}>{x.chip}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ab-who"><span className="ab-dot" style={{ background: C.coral }} /><h3>Your control room</h3></div>
            <p className="ab-sub">One screen for what the agents finished and what needs you. If a document can&rsquo;t be read, they tell you on WhatsApp.</p>
          </div>
        </div>
      </div>

      <p className="ab-foot">Sample data: Sundara Textiles, September. Your own clients appear here once you upload.</p>
    </div>
  );
}
