/**
 * The launch page: the first 100 CA firms get 30 days free. Two actions only: start the free trial, or book a demo.
 * Anyone who lands here keeps the launch code, and the sign-up applies it, so nobody has to type it.
 */
import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { PLAN_ORDER, PLANS } from "@/lib/practice/billing/plans";
import { LAUNCH_CODE, LAUNCH_DAYS, captureLaunchCode } from "@/lib/launchCode";
import { CALENDLY_URL } from "@/components/site/cta";
import { track } from "@/lib/analytics";
import FynLogo from "@/components/FynLogo";

/** Writes a style the way the design does ("a: b; c: d") and returns the React object. */
const css = (text: string): CSSProperties => {
  const out: Record<string, string> = {};
  for (const part of text.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  }
  return out as CSSProperties;
};

const SIGNUP = `/app/onboarding?mode=signup&code=${LAUNCH_CODE}`;
const FONT = "'Geist', ui-sans-serif, system-ui, sans-serif";
const MONO = "'Geist Mono', ui-monospace, monospace";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const STYLES = `
.lp { font-family:${FONT}; color:#141210; background:#FAF7F2; -webkit-font-smoothing:antialiased; width:100%; }
.lp * { box-sizing:border-box; }
.lp a { color:#B3221F; } .lp a:hover { color:#8E1B1F; }
.lp .wrap { width:100%; max-width:1200px; margin:0 auto; padding:0 32px; }
@media (max-width:760px){ .lp .wrap { padding:0 20px; } .lp .navlinks { display:none !important; } .lp .hide-sm { display:none !important; } }
.lp details summary { list-style:none; cursor:pointer; }
.lp details summary::-webkit-details-marker { display:none; }
.lp details[open] .plus { transform:rotate(45deg); }
.lp details { transition:border-color .25s ease, box-shadow .25s ease; }
.lp details:hover { border-color:#D9CFC2 !important; }
.lp details[open] { box-shadow:0 14px 30px -24px rgba(20,18,16,.35); }
.lp input:focus, .lp select:focus { outline:2px solid rgba(217,43,43,.45); outline-offset:1px; }
.lp .cta { transition:transform .5s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease, background .25s ease; }
.lp .cta:hover { transform:translateY(-2px); box-shadow:0 14px 30px -14px rgba(217,43,43,.7); }
.lp .cta:active { transform:scale(.97); }
.lp .cta .knob { transition:transform .5s cubic-bezier(.34,1.56,.64,1); }
.lp .cta:hover .knob { transform:rotate(45deg) scale(1.08); }
.lp .ghost { transition:background .25s ease, transform .5s cubic-bezier(.34,1.56,.64,1); }
.lp .ghost:hover { background:rgba(250,247,242,.14) !important; transform:translateY(-2px); }
.lp .navlink { transition:background .2s ease; }
.lp .navlink:hover { background:rgba(250,247,242,.1); color:#fff !important; }
.lp .lift { transition:transform .5s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease; }
.lp .lift:hover { transform:translateY(-4px); box-shadow:0 22px 40px -28px rgba(20,18,16,.45); }
.lp .rise { animation:lp-rise .7s cubic-bezier(.16,1,.3,1) both; }
@keyframes lp-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .lp .rise { animation:none; } .lp .cta, .lp .lift, .lp .ghost { transition:none; } }
`;

const Arrow = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

/** The red pill with a white knob: the one way in. */
function StartButton({ children, where, big = false }: { children: ReactNode; where: string; big?: boolean }) {
  return (
    <a
      href={SIGNUP}
      className="cta"
      onClick={() => track("cta_click", { cta: "start", location: where })}
      style={css(
        big
          ? "display:inline-flex;align-items:center;gap:10px;background:#D92B2B;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:16px;padding:12px 12px 12px 24px;border-radius:999px;min-height:52px;box-sizing:border-box"
          : "display:inline-flex;align-items:center;gap:8px;background:#D92B2B;color:#FFFFFF;text-decoration:none;font-weight:500;font-size:14px;padding:10px 10px 10px 18px;border-radius:999px;min-height:44px;box-sizing:border-box",
      )}
    >
      {children}
      <span className="knob" style={css(`width:${big ? 30 : 26}px;height:${big ? 30 : 26}px;border-radius:999px;background:#FFFFFF;color:#D92B2B;display:flex;align-items:center;justify-content:center`)}>
        <Arrow size={big ? 15 : 14} />
      </span>
    </a>
  );
}

const DemoLink = ({ children, where, style, className }: { children: ReactNode; where: string; style?: CSSProperties; className?: string }) => (
  <a href={CALENDLY_URL} target="_blank" rel="noreferrer" className={className} onClick={() => track("cta_click", { cta: "demo", location: where })} style={style}>
    {children}
  </a>
);

const Pill = ({ children, light = false }: { children: ReactNode; light?: boolean }) => (
  <div style={css(light ? "display:inline-flex;background:#FFFFFF;color:#6B4A2B;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500" : "display:inline-flex;align-items:center;gap:8px;background:#F1E7DA;color:#6B4A2B;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500")}>{children}</div>
);

const FAQS: [string, ReactNode][] = [
  ["Is my clients’ data safe?", <>Each firm’s data is kept separate and used only to serve that firm. It is never shared with anyone else. The details are on our <a href="/security">Security page</a>.</>],
  ["Does AI do the matching?", "No. Matching is rule-based and every match can be traced. AI only helps sort documents into their type, and every amount it reads must appear in the document. Your team reviews the exceptions and a partner signs off the MIS."],
  ["Do we have to change our accounting software?", "No. FynHelp works on top of the tools your firm already uses: Tally, Zoho Books, Excel, CSV and PDF statements."],
  ["How does the launch offer work?", `The first 100 CA firms get ${LAUNCH_DAYS} days free on any plan. Sign up from this page and the offer is applied for you, with nothing to type. The ${LAUNCH_DAYS} days count from your first upload.`],
  ["What happens after 30 days?", "Choose a plan and continue, or simply stop. We remind you before the trial ends, and your data stays readable and exportable for 30 days after it."],
  ["You’re new. What if something goes wrong?", "Fair question. Early firms get direct access to our founders and a named person to call. Your data stays yours: you can export it any time."],
];

export default function LaunchPage() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    captureLaunchCode(); // via the link's ?code=
    try {
      localStorage.setItem("fynhelp-launch-code", JSON.stringify({ code: LAUNCH_CODE, at: Date.now() }));
    } catch {
      /* private mode: the link still carries the code */
    }
  }, []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams({ mode: "signup", code: LAUNCH_CODE });
    for (const k of ["name", "email", "firm"]) {
      const v = String(f.get(k) ?? "").trim();
      if (v) q.set(k, v);
    }
    track("cta_click", { cta: "start", location: "launch-form" });
    setDone(true);
    window.location.assign(`/app/onboarding?${q.toString()}`);
  };

  const plans = PLAN_ORDER.map((k) => PLANS[k]);

  return (
    <div className="lp">
      <style>{STYLES}</style>

      {/* ANNOUNCEMENT BAR */}
      <div style={css("background:#D92B2B;color:#FFFFFF;font-size:14px;padding:10px 16px;text-align:center;line-height:1.4")}>
        <span style={{ fontWeight: 500 }}>Launch offer:</span> The first 100 CA firms get <strong style={{ fontWeight: 600 }}>{LAUNCH_DAYS} days free</strong>. Applied for you at sign-up.{" "}
        <a href="#signup" style={css("color:#FFFFFF;font-weight:500;text-decoration:underline;text-underline-offset:3px")}>Claim your spot</a>
      </div>

      {/* HERO */}
      <section id="top" style={css("background:radial-gradient(120% 80% at 50% 115%, #8E1B1F 0%, #3A1214 38%, #141210 70%);color:#FAF7F2;padding-bottom:72px")}>
        <div className="wrap">
          <nav style={css("display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 0")}>
            <a href="#top" aria-label="FynHelp" style={css("display:flex;align-items:center;text-decoration:none")}>
              <FynLogo variant="light" size="md" />
            </a>
            <div className="navlinks" style={css("display:flex;gap:4px;padding:6px;border:1px solid rgba(250,247,242,.14);border-radius:999px;background:rgba(250,247,242,.04)")}>
              {[["#outcomes", "Product"], ["#how", "How it works"], ["#pricing", "Pricing"], ["#trust", "Security"], ["#faq", "FAQ"]].map(([h, l]) => (
                <a key={h} href={h} className="navlink" style={css("color:#E9E3DA;text-decoration:none;font-size:14px;padding:8px 14px;border-radius:999px")}>{l}</a>
              ))}
            </div>
            <div style={css("display:flex;align-items:center;gap:16px")}>
              <DemoLink where="launch-nav" className="hide-sm" style={css("color:#FAF7F2;text-decoration:none;font-size:14px")}>Book a demo</DemoLink>
              <StartButton where="launch-nav">Start free</StartButton>
            </div>
          </nav>

          <div className="rise" style={css("text-align:center;padding:72px 0 56px;display:flex;flex-direction:column;align-items:center;gap:24px")}>
            <div style={css("display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(250,247,242,.16);background:rgba(250,247,242,.06);border-radius:999px;padding:6px 14px 6px 6px;font-size:13px;color:#E9E3DA")}>
              <span style={css("background:#D92B2B;color:#FFFFFF;border-radius:999px;padding:3px 10px;font-weight:500;font-size:12px")}>Now live</span>First 100 firms get {LAUNCH_DAYS} days free
            </div>
            <h1 style={css("margin:0;font-weight:500;font-size:clamp(38px, 5.4vw, 68px);line-height:1.06;letter-spacing:-0.035em;max-width:920px")}>Close every client’s month faster, with every number traceable to its source.</h1>
            <p style={css("margin:0;font-size:clamp(16px, 1.6vw, 19px);line-height:1.6;color:#CFC7BC;max-width:680px")}>FynHelp collects your clients’ documents, reconciles bank to your Tally or Zoho books and drafts a source-traceable MIS, so your team reviews the exceptions instead of matching every line.</p>
            <div style={css("display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px")}>
              <StartButton big where="launch-hero">Claim {LAUNCH_DAYS} days free</StartButton>
              <DemoLink where="launch-hero" className="ghost" style={css("display:inline-flex;align-items:center;background:rgba(250,247,242,.08);border:1px solid rgba(250,247,242,.2);color:#FAF7F2;text-decoration:none;font-weight:500;font-size:16px;padding:12px 24px;border-radius:999px;min-height:52px;box-sizing:border-box")}>See it on a real client · 20 min</DemoLink>
            </div>
            <p style={css("margin:0;font-size:13px;color:#B5ADA4")}>Offer applied for you · No card needed · Your team signs off on everything</p>
          </div>

          {/* PRODUCT PREVIEW */}
          <div style={css("border-radius:20px;padding:10px;background:rgba(250,247,242,.08);border:1px solid rgba(250,247,242,.14);max-width:1000px;margin:0 auto")}>
            <div style={css("background:#FAF7F2;color:#141210;border-radius:14px;overflow:hidden")}>
              <div style={css("display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #E8E1D7;flex-wrap:wrap;gap:12px")}>
                <div style={css("font-size:13px;font-weight:500")}>FynHelp portfolio</div>
                <div style={css("font-size:12px;color:#5E5953")}>The product, with sample data</div>
              </div>
              <img src="/launch/portfolio.jpg" alt="FynHelp portfolio: the four agents at work, open exceptions, and what needs the partner today" width={1440} height={620} style={css("display:block;width:100%;height:auto")} />
            </div>
          </div>

          {/* STAT STRIP */}
          <div style={{ marginTop: 48 }}>
            <div style={css("font-size:14px;color:#CFC7BC;margin-bottom:14px")}>What firms get with FynHelp</div>
            <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px")}>
              {[["Exceptions only", "your team reviews what didn’t match"], ["Source-traceable", "every MIS number links to its lines"], ["Unlimited users", "your whole team, one price"], [`From ${inr(PLANS.starter.monthly)}`, "per month, priced per client"]].map(([a, b]) => (
                <div key={a} className="lift" style={css("background:#FAF7F2;color:#141210;border-radius:14px;padding:18px 20px")}>
                  <div style={css("font-size:26px;font-weight:500;letter-spacing:-0.02em")}>{a}</div>
                  <div style={css("font-size:13px;color:#5E5953;margin-top:4px")}>{b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* OUTCOMES */}
      <section id="outcomes" style={css("padding:112px 0 96px")}>
        <div className="wrap">
          <Pill>What changes for your firm</Pill>
          <h2 style={css("margin:18px 0 48px;font-weight:500;font-size:clamp(30px, 3.6vw, 46px);line-height:1.1;letter-spacing:-0.03em;max-width:720px")}>Less time matching lines. More time with clients.</h2>

          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px")}>
            <div className="lift" style={css("background:#F3ECE2;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:20px;min-height:360px;box-sizing:border-box")}>
              <div style={css("flex:1;display:flex;align-items:center;justify-content:center;gap:12px")}>
                <div style={css("background:#FFFFFF;border:1px solid #E3D8C9;border-radius:12px;padding:14px 16px;width:150px")}>
                  <div style={css("font-size:11px;color:#5E5953")}>Before</div>
                  <div style={css("font-size:18px;font-weight:500;margin-top:4px")}>Every line</div>
                  <div style={css("height:6px;border-radius:99px;background:#E3D8C9;margin-top:10px;overflow:hidden")}><div style={css("width:90%;height:100%;background:#C9BBA8;border-radius:99px")} /></div>
                </div>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8E1B1F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <div style={css("background:#FFFFFF;border:1px solid #E3D8C9;border-radius:12px;padding:14px 16px;width:150px")}>
                  <div style={css("font-size:11px;color:#5E5953")}>With FynHelp</div>
                  <div style={css("font-size:18px;font-weight:500;margin-top:4px;color:#B3221F")}>Exceptions first</div>
                  <div style={css("height:6px;border-radius:99px;background:#E3D8C9;margin-top:10px;overflow:hidden")}><div style={css("width:40%;height:100%;background:#D92B2B;border-radius:99px")} /></div>
                </div>
              </div>
              <div>
                <h3 style={css("margin:0 0 8px;font-size:20px;font-weight:500;letter-spacing:-0.01em")}>Your team gets its hours back</h3>
                <p style={css("margin:0;font-size:15px;line-height:1.6;color:#5E5953")}>Juniors stop matching every bank line by hand. Recon does the matching, and they start with the exceptions and finish the close sooner.</p>
              </div>
            </div>

            <div className="lift" style={css("background:#F3ECE2;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:20px;min-height:360px;box-sizing:border-box")}>
              <div style={css("flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px")}>
                {[["Sample: bank statement not received", "Chasing", "#8E1B1F", 1], ["Sample: amount differs by ₹120", "Add a note", "#6B4A2B", 1], ["Sample: no matching book entry", "Review", "#5E5953", 0.7]].map(([t, a, c, o]) => (
                  <div key={String(t)} style={css(`background:#FFFFFF;border:1px solid #E3D8C9;border-radius:10px;padding:12px 14px;font-size:13px;display:flex;justify-content:space-between;gap:8px;opacity:${o}`)}><span>{t}</span><span style={css(`color:${c};font-weight:500`)}>{a}</span></div>
                ))}
              </div>
              <div>
                <h3 style={css("margin:0 0 8px;font-size:20px;font-weight:500;letter-spacing:-0.01em")}>Nothing slips through</h3>
                <p style={css("margin:0;font-size:15px;line-height:1.6;color:#5E5953")}>Missing documents are chased for you, and unmatched lines stay visible with a reason until someone decides.</p>
              </div>
            </div>
          </div>

          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;margin-top:16px")}>
            {[
              ["Partners review less, trust more", "Every MIS number links back to the lines behind it, so a partner can check it quickly and sign off.", <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></>],
              ["Time for advisory", "With the close done sooner, your team has time for the conversations clients pay for.", <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />],
              ["More clients, same team", "Handle more clients without hiring. Unlimited users come with every plan.", <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.9.7 3.1 2.6 3.5 5.2" /></>],
            ].map(([t, p, icon]) => (
              <div key={String(t)} className="lift" style={css("background:#F3ECE2;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:16px")}>
                <div style={css("width:48px;height:48px;border-radius:14px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;color:#B3221F")}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon as ReactNode}</svg>
                </div>
                <h3 style={css("margin:0;font-size:19px;font-weight:500")}>{t as string}</h3>
                <p style={css("margin:0;font-size:15px;line-height:1.6;color:#5E5953")}>{p as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={css("padding:96px 0;background:#F3ECE2")}>
        <div className="wrap">
          <div style={css("text-align:center;display:flex;flex-direction:column;align-items:center")}>
            <Pill light>How it works</Pill>
            <h2 style={css("margin:18px 0 48px;font-weight:500;font-size:clamp(30px, 3.6vw, 46px);line-height:1.1;letter-spacing:-0.03em;max-width:720px")}>From sign-up to first insight, the same day.</h2>
          </div>
          <ol style={css("list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:12px")}>
            {[
              ["Create your account", "One minute, work email only. Your launch code is applied for you.", "Your firm is set up today"],
              ["Add your first clients", "Start with 3 to 5 clients. Upload a bank statement and the books (Tally, Zoho, Excel, CSV or PDF), or let documents arrive by email and WhatsApp.", "No migration, no disruption"],
              ["See what needs attention", "FynHelp reads the documents, matches bank to books and shows what is left, client by client.", "Your team knows where to look"],
              ["Review, sign off, advise", "Your team resolves the exceptions, reviews the MIS and a partner signs it off.", "Source-linked and signed off by a partner"],
            ].map(([t, p, f], i) => (
              <li key={t} className="lift" style={css("background:#FFFFFF;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:10px")}>
                <div style={css(`font-family:${MONO};font-size:12px;color:#B3221F`)}>STEP 0{i + 1}</div>
                <h3 style={css("margin:0;font-size:18px;font-weight:500")}>{t}</h3>
                <p style={css("margin:0;font-size:14px;line-height:1.6;color:#5E5953")}>{p}</p>
                <div style={css("margin-top:auto;padding-top:12px;font-size:13px;color:#141210;border-top:1px solid #EFE8DE")}>{f}</div>
              </li>
            ))}
          </ol>
          <p style={css("text-align:center;margin:28px 0 0;font-size:15px;color:#5E5953")}>Our team helps you set up your first clients, free.</p>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={css("background:radial-gradient(90% 70% at 50% 0%, #3A1214 0%, #141210 65%);color:#FAF7F2;padding:104px 0")}>
        <div className="wrap">
          <div style={css("text-align:center;display:flex;flex-direction:column;align-items:center")}>
            <div style={css("display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(250,247,242,.16);background:rgba(250,247,242,.06);border-radius:999px;padding:6px 14px;font-size:13px;color:#E9E3DA")}>Simple pricing</div>
            <h2 style={css("margin:18px 0 14px;font-weight:500;font-size:clamp(30px, 3.6vw, 46px);line-height:1.1;letter-spacing:-0.03em;max-width:760px")}>If it saves one hour per client, it pays for itself.</h2>
            <p style={css("margin:0;font-size:17px;color:#CFC7BC;max-width:600px;line-height:1.6")}>Pay per active client. Every plan includes unlimited users, so your whole team benefits.</p>
          </div>

          <div style={css("margin:40px auto 0;max-width:820px;background:rgba(217,43,43,.14);border:1px solid rgba(217,43,43,.45);border-radius:16px;padding:18px 22px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px")}>
            <div style={css("font-size:15px;line-height:1.5")}><strong style={{ fontWeight: 600 }}>Launch offer: {LAUNCH_DAYS} days free on any plan.</strong> First 100 firms only.</div>
          </div>

          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-top:32px;align-items:stretch")}>
            {plans.map((p) => {
              const hot = p.key === "professional";
              const rows: [string, string][] = [
                ["Active clients", `Up to ${p.clientsIncluded}`],
                ["Per client", `~${inr(Math.round(p.monthly / p.clientsIncluded))}`],
                ["Users", "Unlimited"],
                ["Onboarding", "Guided"],
              ];
              return (
                <div key={p.key} className="lift" style={css(hot ? "background:rgba(250,247,242,.09);border:1px solid rgba(217,43,43,.7);border-radius:22px;padding:28px;display:flex;flex-direction:column;gap:18px;position:relative" : "background:rgba(250,247,242,.05);border:1px solid rgba(250,247,242,.12);border-radius:22px;padding:28px;display:flex;flex-direction:column;gap:18px")}>
                  {hot && <div style={css("position:absolute;top:20px;right:20px;background:#D92B2B;color:#FFFFFF;font-size:12px;font-weight:500;border-radius:999px;padding:4px 10px")}>Most popular</div>}
                  <div>
                    <div style={css("font-size:20px;font-weight:500")}>{p.name}</div>
                    <div style={css("font-size:14px;color:#B5ADA4;margin-top:4px")}>{p.key === "starter" ? "For solo and small practices" : hot ? "For growing firms" : "For established, multi-team firms"}</div>
                  </div>
                  <div><span style={css("font-size:40px;font-weight:500;letter-spacing:-0.03em")}>{inr(p.monthly)}</span><span style={css("color:#B5ADA4;font-size:15px")}> /month</span></div>
                  <div style={css("display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;padding:16px 0;border-top:1px solid rgba(250,247,242,.12);border-bottom:1px solid rgba(250,247,242,.12)")}>
                    {rows.map(([a, b]) => (
                      <div key={a}><div style={css("font-size:12px;color:#B5ADA4")}>{a}</div><div style={css("font-size:17px;font-weight:500;margin-top:4px")}>{b}</div></div>
                    ))}
                  </div>
                  <a href={SIGNUP} className="cta" onClick={() => track("cta_click", { cta: "start", location: `launch-plan-${p.key}` })} style={css(`margin-top:auto;display:flex;align-items:center;justify-content:center;background:${hot ? "#D92B2B" : "#FAF7F2"};color:${hot ? "#FFFFFF" : "#141210"};text-decoration:none;font-weight:500;font-size:15px;border-radius:999px;min-height:48px`)}>Start {LAUNCH_DAYS} days free</a>
                </div>
              );
            })}
          </div>
          <p style={css("text-align:center;margin:28px 0 0;font-size:14px;color:#B5ADA4")}>Prices exclude GST. More than {PLANS.scale.clientsIncluded} clients? <DemoLink where="launch-pricing" style={css("color:#FAF7F2")}>Talk to our founders</DemoLink></p>
        </div>
      </section>

      {/* TRUST */}
      <section id="trust" style={css("padding:112px 0 96px")}>
        <div className="wrap">
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:48px;align-items:start")}>
            <div>
              <Pill>Built to earn your trust</Pill>
              <h2 style={css("margin:18px 0 16px;font-weight:500;font-size:clamp(30px, 3.6vw, 44px);line-height:1.1;letter-spacing:-0.03em")}>Your clients trust you with their numbers. We take that seriously.</h2>
              <p style={css("margin:0;font-size:16px;line-height:1.6;color:#5E5953")}>FynHelp reads, matches and drafts. Your team reviews, decides and signs off. Nothing reaches a client without your approval.</p>
            </div>
            <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:12px")}>
              {[
                ["Client data stays protected", "Each firm’s data is kept separate and only serves that firm."],
                ["Built with CA firms", "Shaped with partners at firms of every size and with design-partner firms before launch."],
                ["Works with your tools", "No new ledger, no migration. Tally, Zoho Books, Excel, CSV and PDF."],
                ["Direct founder access", "Early firms talk directly to the people who built FynHelp."],
              ].map(([t, p]) => (
                <div key={t} className="lift" style={css("border:1px solid #E8E1D7;background:#FFFFFF;border-radius:16px;padding:22px")}>
                  <h3 style={css("margin:0 0 6px;font-size:17px;font-weight:500")}>{t}</h3>
                  <p style={css("margin:0;font-size:14px;line-height:1.6;color:#5E5953")}>{p}</p>
                </div>
              ))}
            </div>
          </div>

          <figure style={css("margin:72px 0 0;background:#F3ECE2;border-radius:24px;padding:clamp(28px, 4vw, 56px);display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:32px;align-items:center")}>
            <div style={css("display:flex;flex-direction:column;gap:14px")}>
              <div style={css("display:inline-flex;align-self:flex-start;background:#FFFFFF;color:#6B4A2B;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500")}>Why we built FynHelp</div>
              <figcaption style={css("display:flex;align-items:center;gap:12px;margin-top:12px")}>
                <div style={css("width:48px;height:48px;border-radius:99px;background:#D92B2B;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;color:#FFFFFF")}>TA</div>
                <div><div style={css("font-size:16px;font-weight:500")}>Tarun Adireddy</div><div style={css("font-size:13px;color:#5E5953")}>Co-founder &amp; CEO</div></div>
              </figcaption>
            </div>
            <blockquote style={css("margin:0;font-size:clamp(19px, 2vw, 25px);line-height:1.45;letter-spacing:-0.01em;grid-column:span 2")}>“One of us ran a business where the books were always late and unclear, and it cost us. Then we saw the same problem on the CA side, multiplied across dozens of clients. We built FynHelp with those firms so they could see clearly and advise sooner.”</blockquote>
          </figure>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={css("padding:24px 0 112px")}>
        <div className="wrap" style={{ maxWidth: 880 }}>
          <div style={css("text-align:center;display:flex;flex-direction:column;align-items:center")}>
            <Pill>Questions partners ask us</Pill>
            <h2 style={css("margin:18px 0 40px;font-weight:500;font-size:clamp(30px, 3.6vw, 44px);line-height:1.1;letter-spacing:-0.03em")}>Straight answers.</h2>
          </div>
          <div style={css("display:flex;flex-direction:column;gap:10px")}>
            {FAQS.map(([q, a]) => (
              <details key={q} style={css("background:#FFFFFF;border:1px solid #E8E1D7;border-radius:14px;padding:20px 22px")}>
                <summary style={css("display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:17px;font-weight:500")}>{q}<span className="plus" style={css("font-size:22px;color:#B3221F;transition:transform .3s cubic-bezier(.34,1.56,.64,1)")}>+</span></summary>
                <p style={css("margin:12px 0 0;font-size:15px;line-height:1.6;color:#5E5953")}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA + SIGN-UP */}
      <section id="signup" style={css("padding:0 0 96px")}>
        <div className="wrap">
          <div style={css("background:radial-gradient(100% 90% at 100% 100%, #8E1B1F 0%, #3A1214 40%, #141210 75%);color:#FAF7F2;border-radius:28px;padding:clamp(28px, 5vw, 64px);display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:40px;align-items:center")}>
            <div style={css("display:flex;flex-direction:column;gap:18px")}>
              <div style={css("display:inline-flex;align-self:flex-start;background:#D92B2B;color:#FFFFFF;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500")}>Launch offer · 100 firms only</div>
              <h2 style={css("margin:0;font-weight:500;font-size:clamp(30px, 3.8vw, 48px);line-height:1.08;letter-spacing:-0.03em")}>See your own client’s month closed in FynHelp. Free for {LAUNCH_DAYS} days.</h2>
              <p style={css("margin:0;font-size:16px;line-height:1.6;color:#CFC7BC")}>Add your first clients today, or book 20 minutes with our founders first.</p>
              <DemoLink where="launch-final" style={css("align-self:flex-start;color:#FAF7F2;font-size:15px;font-weight:500;text-underline-offset:4px")}>Prefer a walkthrough? Book a demo</DemoLink>
            </div>

            <form style={css("background:#FAF7F2;color:#141210;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px")} onSubmit={submit}>
              {done ? (
                <div role="status" style={css("display:flex;flex-direction:column;gap:10px;padding:12px 0")}>
                  <div style={css("font-size:22px;font-weight:500")}>Taking you to sign-up…</div>
                  <p style={css("margin:0;font-size:15px;line-height:1.6;color:#5E5953")}>Your {LAUNCH_DAYS} free days are already applied.</p>
                </div>
              ) : (
                <>
                  <div style={css("font-size:20px;font-weight:500")}>Start your {LAUNCH_DAYS}-day free trial</div>
                  {[["Full name", "name", "text", "name", "CA Priya Sharma"], ["Work email", "email", "email", "email", "priya@yourfirm.in"], ["Firm name", "firm", "text", "organization", "Sharma & Associates"]].map(([label, name, type, ac, ph]) => (
                    <label key={name} style={css("display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500")}>{label}
                      <input type={type} name={name} autoComplete={ac} placeholder={ph} required={name === "email"} style={css("font:inherit;font-weight:400;font-size:15px;padding:12px 14px;border:1px solid #D9CFC2;border-radius:10px;background:#FFFFFF;min-height:46px;box-sizing:border-box")} />
                    </label>
                  ))}
                  <button type="submit" className="cta" style={css("font:inherit;font-weight:500;font-size:16px;background:#D92B2B;color:#FFFFFF;border:0;border-radius:999px;min-height:52px;cursor:pointer;margin-top:4px")}>Start my free trial</button>
                  <p style={css("margin:0;font-size:12px;color:#5E5953;text-align:center")}>No card needed. Your data is only used to serve your firm.</p>
                </>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={css("background:#141210;color:#CFC7BC;padding:64px 0 32px")}>
        <div className="wrap">
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:32px")}>
            <div style={css("display:flex;flex-direction:column;gap:12px")}>
              <FynLogo variant="light" size="md" />
              <p style={css("margin:0;font-size:14px;line-height:1.6")}>Month-end close software for CA firms. Bengaluru, India.</p>
            </div>
            {[
              ["Product", [["#outcomes", "Features"], ["#pricing", "Pricing"], ["#how", "How it works"], ["/security", "Security"]]],
              ["Company", [["/about", "About"], ["/blog", "Blog"], ["/contact", "Contact"]]],
              ["Talk to us", [["mailto:support@fynhelp.com", "support@fynhelp.com"]]],
            ].map(([h, links]) => (
              <div key={h as string} style={css("display:flex;flex-direction:column;gap:10px;font-size:14px")}>
                <div style={css("color:#FAF7F2;font-weight:500")}>{h as string}</div>
                {(links as string[][]).map(([href, label]) => <a key={label} href={href} style={css("color:#CFC7BC;text-decoration:none")}>{label}</a>)}
              </div>
            ))}
          </div>
          <div style={css("margin-top:48px;padding-top:24px;border-top:1px solid rgba(250,247,242,.12);display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;font-size:13px")}>
            <span>© 2026 FynHelp. All rights reserved.</span>
            <span style={css("display:flex;gap:20px")}><a href="/privacy" style={{ color: "#CFC7BC" }}>Privacy Policy</a><a href="/terms" style={{ color: "#CFC7BC" }}>Terms of Use</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
