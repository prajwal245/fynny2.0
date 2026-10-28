/**
 * The launch page: the first 100 CA firms get 30 days free. Two actions only: start the free trial, or book a walkthrough.
 * Every colour comes from the marketing site's palette (src/lib/sitePalette.ts); the site is light only, so this page is too.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { GST_PERCENT, PLAN_ORDER, PLANS } from "@/lib/practice/billing/plans";
import { LAUNCH_CODE, LAUNCH_DAYS, captureLaunchCode } from "@/lib/launchCode";
import { CALENDLY_URL } from "@/components/site/cta";
import { track } from "@/lib/analytics";
import { C, ON_PRIMARY } from "@/lib/sitePalette";
import FynLogo from "@/components/FynLogo";
import { css } from "./css";
import { AgentFlow, Head, Integrations, MonthStory, PainValue, STORY_STYLES } from "./LaunchStory";

/* ── Constants. An element whose value is empty or "TODO" is not shown. ── */
/** Trial code for the first 100 firms. It is the one the sign-up redeems (src/lib/launchCode.ts). */
const CODE: string = LAUNCH_CODE;
/** Booking link for the walkthrough: the site's existing link. */
const DEMO_URL: string = CALENDLY_URL;
/** Sign-up, with the launch code carried in the address so nothing is typed. */
const TRIAL_URL = `/app/onboarding?mode=signup&code=${CODE}`;
/** A photo for the founder note. Empty: the note is shown without one. */
const TARUN_PHOTO: string = "";
const ready = (v: string) => v !== "" && v !== "TODO";

const FONT = "var(--font-geist-sans), 'Geist', ui-sans-serif, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), 'Geist Mono', ui-monospace, monospace";
const ON_DARK_SOFT = "rgba(247,241,230,.62)";
const ON_DARK_LINE = "rgba(247,241,230,.26)";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const BAR_KEY = "fynhelp-launch-bar-dismissed";

type Where = "hero" | "final" | "bar";

const STYLES = `
.lp { font-family:${FONT}; color:${C.ink}; background:${C.page}; -webkit-font-smoothing:antialiased; width:100%; overflow-x:hidden; }
.lp * { box-sizing:border-box; }
.lp a { color:${C.maroon}; } .lp a:hover { color:${C.maroonDeep}; }
.lp .wrap { width:100%; max-width:1200px; margin:0 auto; padding:0 32px; }
@media (max-width:760px){ .lp .wrap { padding:0 20px; } .lp .hide-sm { display:none !important; } }
.lp details summary { list-style:none; cursor:pointer; }
.lp details summary::-webkit-details-marker { display:none; }
.lp details[open] .plus { transform:rotate(45deg); }
.lp details { transition:border-color .25s ease, box-shadow .25s ease; }
.lp details:hover { border-color:${C.muted} !important; }
.lp details[open] { box-shadow:0 14px 30px -24px rgba(23,18,8,.35); }
.lp .cta { background:${C.coral}; color:${C.ink} !important; transition:transform .45s cubic-bezier(.16,1,.3,1), box-shadow .3s ease; }
.lp .cta:hover { transform:translateY(-2px); box-shadow:0 14px 30px -14px rgba(226,103,63,.8); color:${C.ink} !important; }
.lp .cta:active { transform:scale(.97); }
.lp .cta .knob { transition:transform .45s cubic-bezier(.16,1,.3,1); }
.lp .cta:hover .knob { transform:rotate(45deg); }
.lp .ghost { transition:background .25s ease, transform .45s cubic-bezier(.16,1,.3,1); }
.lp .ghost:hover { transform:translateY(-2px); background:rgba(23,18,8,.05); }
.lp .dark .ghost { border-color:${ON_DARK_LINE} !important; color:${C.onDark} !important; }
.lp .dark .ghost:hover { background:rgba(255,255,255,.08); color:${C.onDark} !important; }
.lp .lift { transition:transform .45s cubic-bezier(.16,1,.3,1), box-shadow .3s ease; }
.lp .lift:hover { transform:translateY(-4px); box-shadow:0 22px 40px -28px rgba(23,18,8,.45); }
.lp .rise { animation:lp-rise .7s cubic-bezier(.16,1,.3,1) both; }
@keyframes lp-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
.lp :focus-visible { outline:2px solid ${C.maroon}; outline-offset:2px; }
@media (prefers-reduced-motion: reduce) { .lp .rise { animation:none; } .lp .cta, .lp .lift, .lp .ghost { transition:none; } }
`;

const Arrow = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" />
  </svg>
);

/** The coral pill with an arrow knob: the one way in. */
function StartButton({ children, where, big = false }: { children: ReactNode; where: Where; big?: boolean }) {
  return (
    <a
      href={TRIAL_URL}
      className="cta"
      onClick={() => track("launch_cta_trial_click", { location: where })}
      style={css(
        big
          ? "display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-weight:500;font-size:16px;padding:10px 10px 10px 24px;border-radius:999px;min-height:52px"
          : "display:inline-flex;align-items:center;gap:8px;text-decoration:none;font-weight:500;font-size:14px;padding:8px 8px 8px 18px;border-radius:999px;min-height:44px",
      )}
    >
      {children}
      <span className="knob" style={css(`width:${big ? 32 : 28}px;height:${big ? 32 : 28}px;border-radius:999px;background:${C.ink};color:${C.onDark};display:flex;align-items:center;justify-content:center;flex:0 0 auto`)}>
        <Arrow size={big ? 15 : 14} />
      </span>
    </a>
  );
}

function DemoButton({ where }: { where: Where }) {
  if (!ready(DEMO_URL)) return null;
  return (
    <a
      href={DEMO_URL}
      target="_blank"
      rel="noreferrer"
      className="ghost"
      onClick={() => track("launch_cta_demo_click", { location: where })}
      style={css(`display:inline-flex;align-items:center;border:1px solid ${C.line};color:${C.ink};text-decoration:none;font-weight:500;font-size:16px;padding:10px 24px;border-radius:999px;min-height:52px`)}
    >
      Book a 15-minute walkthrough
    </a>
  );
}

const CtaPair = ({ where }: { where: Where }) => (
  <div style={css("display:flex;flex-wrap:wrap;gap:12px;justify-content:center")}>
    <StartButton big where={where}>Start your free {LAUNCH_DAYS} days</StartButton>
    <DemoButton where={where} />
  </div>
);

const Pill = ({ children }: { children: ReactNode }) => (
  <div style={css(`display:inline-flex;align-items:center;background:${C.pageAlt};color:${C.maroonDeep};border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500`)}>{children}</div>
);

const FAQS: [string, ReactNode][] = [
  ["Is my clients’ data safe?", <>Each firm’s data is kept separate and used only to serve that firm. It is never shared with anyone else. The details are on our <a href="/security">Security page</a>.</>],
  ["Does AI do the matching?", "No. Matching is rule-based and every match can be traced. AI only helps sort documents into their type, and every amount it reads must appear in the document. Your team reviews the exceptions and a partner signs off the MIS."],
  ["Do we have to change our accounting software?", "No. FynHelp works on top of the tools your firm already uses: Tally, Zoho Books, Excel, CSV and PDF statements."],
  ["Does FynHelp file returns?", "No. FynHelp prepares the work. Your firm reviews, signs and files."],
  ["Does it change anything in Tally?", "No. FynHelp reads your Tally data and never writes to it."],
  ["Do my clients need to install an app?", "No. They reply on WhatsApp or upload through a secure link, with no login needed."],
  ["How does the launch offer work?", `The first 100 CA firms get ${LAUNCH_DAYS} days free on any plan. Use code ${CODE}. Sign up from this page and it is applied for you. The ${LAUNCH_DAYS} days count from your first upload.`],
  ["What happens after 30 days?", "Choose a plan and continue, or simply stop. We remind you before the trial ends, and your data stays readable and exportable for 30 days after it."],
  ["You’re new. What if something goes wrong?", "Fair question. Early firms get direct access to Tarun, our founder, and a named person to call. Your data stays yours: you can export it any time."],
  ["What’s coming next?", "GST reconciliation against GSTR-2B is next on our roadmap."],
];

const CONTROL = [
  "Nothing reaches a client until you approve it, unless you switch on automatic sending.",
  "Every number traces to a source document.",
  "Clients can stop reminders anytime, and opt-outs are always respected.",
  "Export all your firm’s data whenever you want.",
  "FynHelp prepares the work. Your firm reviews and files.",
];

function AnnouncementBar() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BAR_KEY) === "1") setOpen(false);
    } catch {
      /* storage blocked: the bar simply shows */
    }
  }, []);
  if (!open || !ready(CODE)) return null;
  const close = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(BAR_KEY, "1");
    } catch {
      /* nothing to remember */
    }
    track("launch_announcement_dismissed");
  };
  return (
    <div role="region" aria-label="Launch offer" style={css(`position:relative;background:${C.maroon};color:${ON_PRIMARY};font-size:14px;padding:10px 48px 10px 16px;text-align:center;line-height:1.45`)}>
      Launch offer: the first 100 CA firms get {LAUNCH_DAYS} days free. Use code <strong style={{ fontWeight: 600, fontFamily: MONO }}>{CODE}</strong>.{" "}
      <a href={TRIAL_URL} onClick={() => track("launch_cta_trial_click", { location: "bar" })} style={css(`color:${ON_PRIMARY};font-weight:500;text-decoration:underline;text-underline-offset:3px;white-space:nowrap`)}>Start free</a>
      <button type="button" onClick={close} aria-label="Dismiss launch offer" style={css(`position:absolute;right:8px;top:50%;transform:translateY(-50%);width:36px;height:36px;display:grid;place-items:center;border:0;background:transparent;color:${ON_PRIMARY};cursor:pointer;border-radius:999px`)}>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function LaunchPage() {
  useEffect(() => {
    captureLaunchCode(); // via the link's ?code=
    try {
      localStorage.setItem("fynhelp-launch-code", JSON.stringify({ code: LAUNCH_CODE, at: Date.now() }));
    } catch {
      /* private mode: the link still carries the code */
    }
  }, []);

  const plans = PLAN_ORDER.map((k) => PLANS[k]);
  const dark: CSSProperties = { background: `radial-gradient(80% 120% at 100% 0%, rgba(226,103,63,.34), transparent 60%), linear-gradient(140deg, ${C.maroon} 0%, ${C.maroonDeep} 62%, ${C.inkDeep} 100%)`, color: C.onDark };

  return (
    <div className="lp">
      <style>{STYLES + STORY_STYLES}</style>

      <AnnouncementBar />

      {/* HERO */}
      <header id="top" style={css("position:relative")}>
        <div aria-hidden="true" style={css("position:absolute;inset:0 0 auto;height:520px;background:radial-gradient(60% 80% at 50% 0%, rgba(226,103,63,.13), transparent 70%);pointer-events:none")} />
        <div className="wrap" style={{ position: "relative" }}>
          <nav style={css("display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 0")}>
            <a href="#top" aria-label="FynHelp" style={css("display:flex;align-items:center;text-decoration:none")}>
              <FynLogo variant="dark" size="md" />
            </a>
            <div style={css("display:flex;align-items:center;gap:20px")}>
              <a href="#pricing" className="hide-sm" style={css(`color:${C.ink};text-decoration:none;font-size:14px`)}>Pricing</a>
              <a href="#faq" className="hide-sm" style={css(`color:${C.ink};text-decoration:none;font-size:14px`)}>FAQ</a>
              <StartButton where="hero">Start free</StartButton>
            </div>
          </nav>

          <div className="rise" style={css("text-align:center;padding:56px 0 64px;display:flex;flex-direction:column;align-items:center;gap:22px")}>
            <h1 style={css("margin:0;font-weight:500;font-size:clamp(32px, 5vw, 48px);line-height:1.1;letter-spacing:-0.03em;max-width:820px")}>Your month-end close, run by agents. Signed by you.</h1>
            <p style={css(`margin:0;font-size:clamp(15px, 1.6vw, 18px);line-height:1.6;color:${C.body};max-width:700px`)}>FynHelp chases your clients on WhatsApp, reads their documents, reconciles bank to Tally or Zoho, and drafts the MIS, with every figure traced to its source. Your team reviews the exceptions. The partner signs.</p>
            <CtaPair where="hero" />
            <p style={css(`margin:0;font-size:13px;color:${C.body}`)}>No migration. Nothing changes in your Tally. Your clients don’t install anything.</p>
          </div>
        </div>
      </header>

      {/* WORKS WITH */}
      <Integrations />

      {/* AGENT WORKFLOW */}
      <AgentFlow />

      {/* PAIN TO VALUE */}
      <PainValue />

      {/* CONTROL AND TRUST */}
      <section id="trust" style={css("padding:72px 0")}>
        <div className="wrap">
          <div style={css("max-width:760px;margin:0 auto")}>
            <h2 style={css("margin:0 0 24px;font-weight:500;font-size:clamp(26px, 3.2vw, 32px);line-height:1.2;letter-spacing:-0.02em;text-align:center")}>Your name is on the report. So you stay in control.</h2>
            <ul style={css("list-style:none;margin:0;padding:0;display:grid;gap:12px")}>
              {CONTROL.map((t) => (
                <li key={t} className="lift" style={css(`display:flex;gap:12px;align-items:flex-start;background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:16px 18px;font-size:15px;line-height:1.5`)}>
                  <span style={css(`flex:0 0 22px;width:22px;height:22px;border-radius:99px;background:${C.maroon};color:${ON_PRIMARY};display:grid;place-items:center;margin-top:1px`)}><Check size={14} strokeWidth={3} aria-hidden="true" /></span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* A MONTH AT A CA FIRM */}
      <MonthStory />

      {/* PRICING */}
      <section id="pricing" className="ls" style={css("padding:88px 0")}>
        <div className="wrap">
          <Head kicker="Pricing" title="Priced per active client. Unlimited users, so your whole team can use it." sub="If FynHelp saves your team about 9 hours a month, the Firm plan pays for itself." />
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr));gap:16px;align-items:stretch")}>
            {plans.map((p) => {
              const firm = p.key === "professional";
              return (
                <div key={p.key} className="lift" style={css(`background:${C.card};border:${firm ? `2px solid ${C.maroon}` : `1px solid ${C.line}`};border-radius:22px;padding:28px;display:flex;flex-direction:column;gap:16px`)}>
                  <div>
                    <div style={css("font-size:20px;font-weight:500")}>{p.name}</div>
                    <div style={css(`font-size:14px;color:${C.body};margin-top:4px`)}>{p.recommendedFor}</div>
                  </div>
                  <div><span style={css("font-size:36px;font-weight:500;letter-spacing:-0.03em")}>{inr(p.monthly)}</span><span style={css(`color:${C.body};font-size:15px`)}> /month</span></div>
                  <ul style={css(`list-style:none;margin:0;padding:16px 0 0;border-top:1px solid ${C.line};display:grid;gap:10px;font-size:14.5px`)}>
                    {[`${p.clientsIncluded} active clients included`, `${inr(p.extraClient)} per extra active client`, "Unlimited users"].map((t) => (
                      <li key={t} style={css("display:flex;gap:10px;align-items:flex-start")}><Check size={16} color={C.maroon} style={{ flex: "0 0 16px", marginTop: 3 }} aria-hidden="true" />{t}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p style={css(`text-align:center;margin:24px 0 0;font-size:14px;color:${C.body}`)}>Prices exclude {GST_PERCENT}% GST. First 100 firms: {LAUNCH_DAYS} days free with code {CODE}.</p>
        </div>
      </section>

      {/* FOUNDER NOTE */}
      <section style={css("padding:0 0 88px")}>
        <div className="wrap">
          <figure style={css(`margin:0 auto;max-width:820px;background:${C.pageAlt};border-radius:24px;padding:clamp(24px, 4vw, 48px);display:flex;flex-direction:column;gap:20px`)}>
            <Pill>A note from the founder</Pill>
            <blockquote style={css("margin:0;font-size:clamp(16px, 1.8vw, 19px);line-height:1.6;letter-spacing:-0.005em")}>“Before FynHelp, I ran Dark Capital, a corporate gifting business. One reason it closed was simple: our books were always late, and we never had a clear view of our numbers. CA firms are the people who keep India’s small businesses on track, and they’re doing it with WhatsApp, Excel and late nights. We built FynHelp so your month-end runs itself, and you get your time back for the work only you can do.”</blockquote>
            <figcaption style={css("display:flex;align-items:center;gap:12px")}>
              {ready(TARUN_PHOTO) && <img src={TARUN_PHOTO} alt="Tarun Adireddy" width={48} height={48} style={css("width:48px;height:48px;border-radius:99px;object-fit:cover")} />}
              <div style={css("font-size:15px;font-weight:500")}>Tarun Adireddy<span style={css(`font-weight:400;color:${C.body}`)}>, Co-founder &amp; CEO, FynHelp</span></div>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="ls" style={css("padding:0 0 96px")}>
        <div className="wrap" style={{ maxWidth: 880 }}>
          <Head kicker="Questions partners ask us" title="Straight answers." />
          <div style={css("display:flex;flex-direction:column;gap:10px")}>
            {FAQS.map(([q, a]) => (
              <details key={q} style={css(`background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px`)}>
                <summary style={css("display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:16px;font-weight:500")}>{q}<span className="plus" style={css(`font-size:22px;color:${C.maroon};transition:transform .3s cubic-bezier(.16,1,.3,1)`)}>+</span></summary>
                <p style={css(`margin:12px 0 0;font-size:15px;line-height:1.6;color:${C.body}`)}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="signup" style={css("padding:0 0 88px")}>
        <div className="wrap">
          <div className="dark" style={{ ...dark, borderRadius: 28, padding: "clamp(32px, 6vw, 72px) clamp(20px, 4vw, 48px)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
            <h2 style={css("margin:0;font-weight:500;font-size:clamp(28px, 4vw, 40px);line-height:1.12;letter-spacing:-0.025em")}>Close this month faster.</h2>
            <p style={css(`margin:0 0 6px;font-size:16px;line-height:1.6;color:${ON_DARK_SOFT}`)}>Free for {LAUNCH_DAYS} days for the first 100 CA firms.</p>
            <div className="dark"><CtaPair where="final" /></div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={css(`background:${C.inkDeep};color:${ON_DARK_SOFT};padding:56px 0 32px`)}>
        <div className="wrap">
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:32px")}>
            <div style={css("display:flex;flex-direction:column;gap:12px")}>
              <FynLogo variant="light" size="md" />
              <p style={css("margin:0;font-size:14px;line-height:1.6")}>Month-end close software for CA firms. Bengaluru, India.</p>
            </div>
            {[
              ["Product", [["#how-it-works", "How it works"], ["#pricing", "Pricing"], ["/security", "Security"]]],
              ["Company", [["/about", "About"], ["/blog", "Blog"], ["/contact", "Contact"]]],
              ["Talk to us", [["mailto:support@fynhelp.com", "support@fynhelp.com"]]],
            ].map(([h, links]) => (
              <div key={h as string} style={css("display:flex;flex-direction:column;gap:10px;font-size:14px")}>
                <div style={css(`color:${C.onDark};font-weight:500`)}>{h as string}</div>
                {(links as string[][]).map(([href, label]) => <a key={label} href={href} style={css(`color:${ON_DARK_SOFT};text-decoration:none`)}>{label}</a>)}
              </div>
            ))}
          </div>
          <div style={css("margin-top:40px;padding-top:24px;border-top:1px solid rgba(247,241,230,.14);display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;font-size:13px")}>
            <span>© 2026 FynHelp. All rights reserved.</span>
            <span style={css("display:flex;gap:20px")}><a href="/privacy" style={{ color: ON_DARK_SOFT }}>Privacy Policy</a><a href="/terms" style={{ color: ON_DARK_SOFT }}>Terms of Use</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
