/**
 * The part of the launch page that explains the product at a glance, right after the hero:
 *  - AgentFlow: the four agents working a month, as it happens (animated, and readable without animation)
 *  - PainValue: each pain a CA firm feels, and what changes
 *  - Integrations: what FynHelp reads and talks to
 *  - MonthStory: one month at a firm, without and with FynHelp
 * Names and figures in the story are an example, and the page says so.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { BellRing, Check, FileSearch, FileSpreadsheet, FileText, GitCompareArrows, Image as ImageIcon, MessageSquareText, Repeat, ShieldCheck, UserCheck } from "lucide-react";
import { GmailIcon, TallyIcon, WhatsAppIcon, ZohoIcon } from "@/v2/components/BrandIcons";
import { css } from "./css";

const MONO = "'Geist Mono', ui-monospace, monospace";

const Head = ({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) => (
  <div style={css("text-align:center;display:flex;flex-direction:column;align-items:center;margin-bottom:44px")}>
    <div style={css("display:inline-flex;background:#F1E7DA;color:#6B4A2B;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:500")}>{kicker}</div>
    <h2 style={css("margin:18px 0 12px;font-weight:500;font-size:clamp(30px, 3.6vw, 46px);line-height:1.1;letter-spacing:-0.03em;max-width:760px")}>{title}</h2>
    {sub && <p style={css("margin:0;font-size:17px;line-height:1.6;color:#5E5953;max-width:640px")}>{sub}</p>}
  </div>
);

export const STORY_STYLES = `
.ls { font-family:'Geist', ui-sans-serif, system-ui, sans-serif; color:#141210; }
.ls .wrap { width:100%; max-width:1200px; margin:0 auto; padding:0 32px; }
@media (max-width:760px){ .ls .wrap { padding:0 20px; } }
.ls .node { position:relative; background:#fff; border:1px solid #E8E1D7; border-radius:18px; padding:16px; transition:border-color .4s ease, box-shadow .5s ease, transform .5s cubic-bezier(.34,1.56,.64,1); }
.ls .node[data-on="true"] { border-color:#D92B2B; box-shadow:0 18px 40px -22px rgba(217,43,43,.55); transform:translateY(-4px); }
.ls .node .ico { width:42px; height:42px; border-radius:13px; display:grid; place-items:center; background:#F3ECE2; color:#8E1B1F; transition:background .4s ease, color .4s ease; }
.ls .node[data-on="true"] .ico { background:#D92B2B; color:#fff; }
.ls .node .st { margin-top:10px; font-size:12px; line-height:1.45; color:#5E5953; min-height:34px; }
.ls .bar { height:4px; border-radius:99px; background:#EFE8DE; overflow:hidden; margin-top:10px; }
.ls .bar i { display:block; height:100%; width:0; border-radius:99px; background:#D92B2B; }
.ls .node[data-on="true"] .bar i { animation:ls-fill 2.4s linear forwards; }
.ls .node[data-done="true"] .bar i { width:100%; background:#2F9E6B; }
@keyframes ls-fill { to { width:100%; } }
.ls .link { position:relative; height:2px; background:repeating-linear-gradient(90deg, #D9CFC2 0 6px, transparent 6px 12px); align-self:center; }
.ls .link::after { content:""; position:absolute; top:-3px; left:0; width:8px; height:8px; border-radius:99px; background:#D92B2B; opacity:0; }
.ls .link[data-on="true"]::after { animation:ls-dot 1.2s ease-in-out infinite; }
@keyframes ls-dot { 0% { left:0; opacity:1; } 90% { opacity:1; } 100% { left:calc(100% - 8px); opacity:0; } }
.ls .doc { display:flex; align-items:center; gap:8px; background:#fff; border:1px solid #E8E1D7; border-radius:12px; padding:9px 12px; font-size:12.5px; }
.ls .log { background:#141210; color:#E9E3DA; border-radius:16px; padding:16px 18px; font-family:${MONO}; font-size:12.5px; line-height:1.6; min-height:132px; }
.ls .log .t { color:#8E8A83; margin-right:8px; }
.ls .log .a { color:#FF8A80; margin-right:8px; }
.ls .flow { display:grid; grid-template-columns:150px 28px repeat(4, minmax(0,1fr) 28px) 150px; gap:0; align-items:stretch; }
@media (max-width:1020px){ .ls .flow { grid-template-columns:1fr 1fr; gap:12px; } .ls .link { display:none; } .ls .flow > .ins, .ls .flow > .outs { grid-column:1 / -1; } }
.ls .card { background:#fff; border:1px solid #E8E1D7; border-radius:20px; padding:24px; transition:transform .5s cubic-bezier(.34,1.56,.64,1), box-shadow .3s ease; }
.ls .card:hover { transform:translateY(-4px); box-shadow:0 22px 40px -28px rgba(20,18,16,.45); }
.ls .pv { display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:16px; }
.ls .mq { position:relative; overflow:hidden; -webkit-mask-image:linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent); mask-image:linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent); padding:10px 0; }
.ls .mq-track { display:flex; gap:16px; width:max-content; animation:ls-marquee 38s linear infinite; padding-left:16px; }
.ls .mq[data-reverse="true"] .mq-track { animation-direction:reverse; animation-duration:46s; }
.ls .mq:hover .mq-track, .ls .mq:focus-within .mq-track { animation-play-state:paused; }
@keyframes ls-marquee { to { transform:translateX(calc((100% + 16px) / -3)); } }
.ls .mq-tool { display:flex; align-items:center; gap:16px; min-width:330px; background:#fff; border:1px solid #E8E1D7; border-radius:22px; padding:18px 22px; box-shadow:0 14px 30px -26px rgba(20,18,16,.5); transition:transform .5s cubic-bezier(.34,1.56,.64,1), border-color .3s ease, box-shadow .3s ease; }
.ls .mq-tool:hover { transform:translateY(-5px); border-color:#D92B2B; box-shadow:0 24px 44px -26px rgba(217,43,43,.45); }
.ls .mq-tool .lg { width:62px; height:62px; border-radius:18px; display:grid; place-items:center; background:#FAF7F2; border:1px solid #EFE8DE; flex:0 0 auto; }
.ls .mq-tool .tg { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; padding:2px 8px; border-radius:99px; background:#F3ECE2; color:#6B4A2B; font-weight:600; }
.ls .mq-fmt { display:inline-flex; align-items:center; gap:10px; white-space:nowrap; background:#fff; border:1px solid #E8E1D7; border-radius:999px; padding:11px 20px; font-size:14px; font-weight:500; transition:transform .5s cubic-bezier(.34,1.56,.64,1); }
.ls .mq-fmt:hover { transform:translateY(-3px); }
@media (prefers-reduced-motion: reduce) { .ls .mq { -webkit-mask-image:none; mask-image:none; } .ls .mq-track { animation:none; flex-wrap:wrap; width:auto; padding:0 20px; justify-content:center; } }
.ls .story { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
@media (max-width:860px){ .ls .story { grid-template-columns:1fr; } }
.ls .tl { position:relative; display:grid; gap:14px; padding-left:22px; }
.ls .tl::before { content:""; position:absolute; left:6px; top:6px; bottom:6px; width:2px; background:#E8E1D7; }
.ls .tl li { position:relative; list-style:none; }
.ls .tl li::before { content:""; position:absolute; left:-21px; top:6px; width:10px; height:10px; border-radius:99px; background:#C9BBA8; box-shadow:0 0 0 3px #fff; }
.ls .tl.good li::before { background:#D92B2B; }
.ls .tl .d { font-family:${MONO}; font-size:11.5px; color:#8E8A83; }
.ls .tl p { margin:2px 0 0; font-size:14px; line-height:1.55; color:#3A3631; }
@media (prefers-reduced-motion: reduce) { .ls .node[data-on="true"] .bar i, .ls .link[data-on="true"]::after { animation:none; width:100%; } }
`;

type Agent = "chaser" | "extract" | "recon" | "narrate" | "partner";
const STEPS: { agent: Agent; log: string }[] = [
  { agent: "chaser", log: "Sharma Traders: August bank statement not received. Reminder sent on WhatsApp (day 0)." },
  { agent: "extract", log: "Statement received. Read 412 lines. 2 unsure lines sent to review." },
  { agent: "recon", log: "Matched 409 of 412 to the Tally ledger. 3 exceptions, each with a reason." },
  { agent: "narrate", log: "August MIS drafted. Every figure links to the lines behind it." },
  { agent: "partner", log: "Meera reviews 3 exceptions, then signs off the MIS." },
];
const AGENTS: { key: Agent; name: string; icon: ReactNode; line: string }[] = [
  { key: "chaser", name: "Chaser", icon: <BellRing size={20} />, line: "Asks clients for what is missing, on WhatsApp and email" },
  { key: "extract", name: "Extract", icon: <FileSearch size={20} />, line: "Reads statements, exports and registers into lines" },
  { key: "recon", name: "Recon", icon: <GitCompareArrows size={20} />, line: "Matches bank to books and lists what is left" },
  { key: "narrate", name: "Narrate", icon: <MessageSquareText size={20} />, line: "Drafts the MIS from matched lines only" },
];

/** The four agents working one client's month, step by step. Plays while on screen; the log reads on its own without motion. */
export function AgentFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { margin: "-15% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<number[]>([0]);
  const at = useRef(0);
  useEffect(() => {
    if (!seen || reduce) return;
    const t = setInterval(() => {
      const next = (at.current + 1) % STEPS.length;
      at.current = next;
      setStep(next);
      setLines((l) => (next === 0 ? [0] : l.includes(next) ? l : [...l, next]));
    }, 2600);
    return () => clearInterval(t);
  }, [seen, reduce]);
  const shown = reduce ? STEPS.map((_, i) => i) : lines;
  const active = STEPS[step].agent;
  const order: Agent[] = ["chaser", "extract", "recon", "narrate", "partner"];
  const done = (a: Agent) => order.indexOf(a) < order.indexOf(active);

  return (
    <section className="ls" id="how-it-works" style={css("padding:96px 0 40px")}>
      <div className="wrap" ref={ref}>
        <Head kicker="See it at a glance" title="Four agents run the month. You review what is left." sub="This is one client's month-end, as it happens. Documents come in on the left, a partner signs off on the right, and the agents do the work in between." />
        <div className="flow">
          <div className="ins" style={css("display:grid;gap:8px;align-content:center")}>
            {[[<FileText key="a" size={16} />, "Bank statement"], [<FileSpreadsheet key="b" size={16} />, "Tally export"], [<ImageIcon key="c" size={16} />, "Invoice photo"]].map(([i, l]) => (
              <div key={String(l)} className="doc"><span style={{ color: "#8E1B1F", display: "grid" }}>{i as ReactNode}</span>{l as string}</div>
            ))}
          </div>
          <div className="link" data-on={active === "chaser" || active === "extract"} />
          {AGENTS.map((a, i) => (
            <div key={a.key} style={{ display: "contents" }}>
              <div className="node" data-on={active === a.key} data-done={done(a.key)}>
                <div className="ico">{done(a.key) ? <Check size={20} /> : a.icon}</div>
                <div style={css("margin-top:10px;font-weight:600;font-size:15px")}>{a.name}</div>
                <div className="st">{a.line}</div>
                <div className="bar"><i key={`${a.key}-${active === a.key}`} /></div>
              </div>
              <div className="link" data-on={active === AGENTS[i + 1]?.key || (i === 3 && active === "partner")} />
            </div>
          ))}
          <div className="outs node" data-on={active === "partner"} data-done={false} style={css("display:grid;align-content:center;justify-items:center;text-align:center;gap:6px")}>
            <div className="ico"><UserCheck size={20} /></div>
            <div style={css("font-weight:600;font-size:15px")}>Partner</div>
            <div className="st" style={{ minHeight: 0 }}>Reviews exceptions and signs off</div>
          </div>
        </div>

        <div className="log" role="log" aria-label="What the agents did" style={{ marginTop: 20 }}>
          <AnimatePresence initial={false}>
            {shown.map((i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <span className="t">{String(9 + i).padStart(2, "0")}:{String(i * 7 + 4).padStart(2, "0")}</span>
                <span className="a">{STEPS[i].agent === "partner" ? "Partner" : STEPS[i].agent[0].toUpperCase() + STEPS[i].agent.slice(1)}</span>
                {STEPS[i].log}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <p style={css("margin:12px 0 0;font-size:12.5px;color:#8E8A83;text-align:center")}>An example client month. Names and numbers are illustrative.</p>
      </div>
    </section>
  );
}

const PAINS: { icon: ReactNode; pain: string; what: string; result: string }[] = [
  { icon: <BellRing size={22} />, pain: "Chasing clients for statements", what: "The Chaser asks on WhatsApp and email on day 0, 3 and 7, and stops when the file arrives.", result: "Documents come in without a junior asking three times." },
  { icon: <GitCompareArrows size={22} />, pain: "Matching bank lines by hand", what: "Recon matches exact, same-day and close lines, then your own rules and split payments.", result: "Your team opens a short list of exceptions, not hundreds of lines." },
  { icon: <Repeat size={22} />, pain: "Rework after review", what: "Every exception carries a reason, and every decision keeps a note and a name.", result: "Nothing goes back and forth without a record of why." },
  { icon: <ShieldCheck size={22} />, pain: "Signing off on faith", what: "Every MIS figure links to the bank and book lines behind it.", result: "A partner can check a number in one click and defend it later." },
];

export function PainValue() {
  return (
    <section className="ls" style={css("padding:56px 0")}>
      <div className="wrap">
        <Head kicker="Where it helps" title="What changes for each thing that eats your week" />
        <div className="pv">
          {PAINS.map((p, i) => (
            <motion.div key={p.pain} className="card" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: i * 0.08 }}>
              <div style={css("width:46px;height:46px;border-radius:14px;background:#F6E2DF;color:#8E1B1F;display:grid;place-items:center")}>{p.icon}</div>
              <div style={css("margin-top:16px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8E8A83;font-weight:500")}>The pain</div>
              <h3 style={css("margin:4px 0 12px;font-size:19px;font-weight:500;line-height:1.25")}>{p.pain}</h3>
              <p style={css("margin:0 0 12px;font-size:14.5px;line-height:1.6;color:#3A3631")}>{p.what}</p>
              <p style={css("margin:0;font-size:14px;line-height:1.55;color:#8E1B1F;font-weight:500;display:flex;gap:8px")}><Check size={16} style={{ flex: "0 0 16px", marginTop: 3 }} />{p.result}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Tools whose real marks we show, with what FynHelp does with each. */
const TOOLS: { icon: ReactNode; name: string; line: string; tag: string }[] = [
  { icon: <TallyIcon size={34} />, name: "TallyPrime", line: "Reads your exports, including Tally on Cloud", tag: "Books" },
  { icon: <ZohoIcon size={34} />, name: "Zoho Books", line: "Connects to your organisation", tag: "Books" },
  { icon: <WhatsAppIcon size={34} />, name: "WhatsApp", line: "Asks clients and receives their files", tag: "Clients" },
  { icon: <GmailIcon size={34} />, name: "Gmail", line: "Statements emailed to the firm inbox come in", tag: "Inbox" },
];
const FORMATS: { icon: ReactNode; name: string }[] = [
  { icon: <FileSpreadsheet size={18} color="#1F7A52" />, name: "Excel" },
  { icon: <FileSpreadsheet size={18} color="#2B6CB0" />, name: "CSV" },
  { icon: <FileText size={18} color="#B3221F" />, name: "PDF statements" },
  { icon: <ImageIcon size={18} color="#8E1B1F" />, name: "Photos and scans" },
  { icon: <FileText size={18} color="#1E4E8C" />, name: "Tally XML" },
  { icon: <FileSpreadsheet size={18} color="#1F7A52" />, name: "GST registers" },
  { icon: <FileSpreadsheet size={18} color="#6B4A2B" />, name: "TDS registers" },
  { icon: <FileText size={18} color="#5E5953" />, name: "Payroll registers" },
];

/** Two slow, opposite rows: the tools (real marks) above, the file types below. Pauses on hover; still and wrapped for reduced motion. */
export function Integrations() {
  const reduce = useReducedMotion();
  const row = (kids: ReactNode, reverse = false, label: string) => (
    <div className="mq" data-reverse={reverse} aria-label={label} role="group">
      <div className="mq-track">
        {kids}
        {!reduce && (
          <>
            <span aria-hidden="true" style={{ display: "contents" }}>{kids}</span>
            <span aria-hidden="true" style={{ display: "contents" }}>{kids}</span>
          </>
        )}
      </div>
    </div>
  );
  return (
    <section className="ls" style={css("padding:48px 0 72px;overflow:hidden")}>
      <div className="wrap">
        <Head kicker="Works with what you already use" title="No new ledger. No migration." sub="FynHelp sits on top of the books your clients already keep, and reads the files they already send." />
      </div>
      {row(
        TOOLS.map((t) => (
          <div key={t.name} className="mq-tool">
            <span className="lg">{t.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={css("display:flex;align-items:center;gap:8px")}>
                <span style={css("font-weight:600;font-size:17px")}>{t.name}</span>
                <span className="tg">{t.tag}</span>
              </div>
              <div style={css("font-size:13px;color:#5E5953;line-height:1.4;margin-top:3px")}>{t.line}</div>
            </div>
          </div>
        )),
        false,
        "Tools FynHelp works with",
      )}
      <div style={{ height: 14 }} />
      {row(
        FORMATS.map((f) => (
          <div key={f.name} className="mq-fmt">{f.icon}{f.name}</div>
        )),
        true,
        "Files FynHelp reads",
      )}
      <div className="wrap">
        <p style={css("margin:22px 0 0;text-align:center;font-size:13.5px;color:#5E5953")}>Clients keep their software. Your team keeps one way of reviewing them all.</p>
      </div>
    </section>
  );
}

const WITHOUT: [string, string][] = [
  ["Day 1", "Statements have not come in. A junior messages clients one by one."],
  ["Day 4", "Half the files arrive in four formats. Re-typing starts."],
  ["Day 7", "Bank in one tab, books in another. Hundreds of lines matched by eye."],
  ["Day 11", "The manager flags a line. The junior cannot recall why. Back it goes."],
  ["Day 14", "The partner signs a P&L with no trail to the lines behind it."],
];
const WITH: [string, string][] = [
  ["Day 1", "Requests go out on their own, on WhatsApp and email, with a schedule."],
  ["Day 2", "Statements are read as they arrive. Unsure lines wait in a review queue."],
  ["Day 3", "Bank is matched to books. The team opens a short list of exceptions."],
  ["Day 5", "Each exception is decided with a note. The MIS is drafted from matched lines."],
  ["Day 6", "The partner clicks through the figures and signs off."],
];

export function MonthStory() {
  return (
    <section className="ls" style={css("padding:56px 0 72px;background:#F3ECE2")}>
      <div className="wrap">
        <Head kicker="A month at a CA firm" title="Same firm, same clients. Two different months." sub="Meera runs a 30-client practice. Here is what a close looks like for her team, before and after." />
        <div className="story">
          {[["Without FynHelp", WITHOUT, ""], ["With FynHelp", WITH, "good"]].map(([title, items, cls]) => (
            <div key={title as string} className="card" style={{ padding: 28 }}>
              <h3 style={css(`margin:0 0 18px;font-size:20px;font-weight:500;color:${cls ? "#8E1B1F" : "#141210"}`)}>{title as string}</h3>
              <ul className={`tl ${cls}`} style={{ margin: 0, padding: "0 0 0 22px" }}>
                {(items as [string, string][]).map(([d, t], i) => (
                  <motion.li key={d} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4, delay: i * 0.08 }}>
                    <div className="d">{d}</div>
                    <p>{t}</p>
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={css("margin:16px 0 0;text-align:center;font-size:12.5px;color:#8E8A83")}>An illustrative month. Your timings will differ.</p>
      </div>
    </section>
  );
}
