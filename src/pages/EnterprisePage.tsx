import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  GitCompareArrows,
  Inbox,
  Landmark,
  LockKeyhole,
  Receipt,
  ShieldCheck,
  Timer,
  Users,
  X,
} from "lucide-react";
import { openDemo } from "@/components/site/BookDemo";
import { Link } from "@/lib/router-compat";

/**
 * /enterprise: landing page for in-house finance teams (not indexed).
 * Visual language follows the cool, bordered-grid style of modern finance-software
 * sites: light grey-teal ground, hairline grid cells, dark teal gradient close.
 */

const INK = "#0B1F1E";
const TEAL = "#0F4F4C";
const TEAL_DEEP = "#0A3836";
const GROUND = "#EFF4F4";
const LINE = "#D3DEDE";
const MUTED = "#4C6361";
const FONT = '"Inter", "DM Sans", system-ui, sans-serif';

const STEPS = [
  { icon: Inbox, n: "1", t: "Collect", d: "Reads Indian bank statements (PDF, Excel, even a phone photo), the Tally day book and supporting documents. Clients can send them on WhatsApp or email." },
  { icon: GitCompareArrows, n: "2", t: "Reconcile", d: "Matches bank lines to your Tally or Zoho books. Surfaces only real exceptions with clear reasons. GST and TDS matching is in design with finance heads." },
  { icon: BookOpenCheck, n: "3", t: "Narrate", d: "Generates a source-traceable close pack. Every number links back to the original document." },
  { icon: ClipboardCheck, n: "4", t: "Review and approve", d: "Your team reviews only what needs attention. Approved entries can be written to your ledger, never without human approval." },
];

const REASONS = [
  { icon: Landmark, t: "No migration required" },
  { icon: Users, t: "Works with Tally and Zoho Books you already use" },
  { icon: LockKeyhole, t: "Zero silent posting, full human control" },
  { icon: FileSearch, t: "Exception-only workflow" },
  { icon: ShieldCheck, t: "Clean audit trail on every figure" },
  { icon: Timer, t: "Faster close without adding headcount" },
];

const PAIN = [
  "Chasing statements and invoices",
  "Matching bank feeds to the ledger line by line",
  "Reconciling GST and TDS data",
  "Preparing packs that leadership can actually trust",
  "Working late to hit the close deadline",
];

const BEFORE_AFTER = [
  ["Hours of manual matching", "Only exceptions need review"],
  ["Late-night pack prep", "Source-linked pack ready faster"],
  ["Heavy review load", "Leadership reviews with confidence"],
  ["Close slips easily", "Tighter, more predictable close"],
];

const btnDark = {
  background: INK,
  color: "#fff",
} as const;

function TopBar() {
  return (
    <div className="text-center text-[13px] py-3 px-4" style={{ background: `linear-gradient(90deg, ${INK}, ${TEAL})`, color: "#fff" }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ background: "#B7F0C8" }} />
      Enterprise finance teams: early access is open.{" "}
      <button onClick={() => openDemo("enterprise-bar")} className="underline underline-offset-2 font-medium">
        Book a walkthrough
      </button>
    </div>
  );
}

function Nav() {
  return (
    <header style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
      <div className="mx-auto max-w-[1180px] px-6 h-[72px] flex items-center justify-between">
        <Link to="/" className="text-[26px] font-semibold tracking-tight" style={{ color: INK, fontFamily: FONT }}>
          FynHelp
        </Link>
        <nav className="hidden md:flex items-center gap-9 text-[15px]" style={{ color: INK }}>
          <a href="#how">How it works</a>
          <a href="#why">Why FynHelp</a>
          <a href="#change">What changes</a>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-4 text-[15px]">
          <Link to="/login" className="hidden sm:inline" style={{ color: INK }}>
            Login
          </Link>
          <button onClick={() => openDemo("enterprise-nav")} className="rounded-md px-5 py-2.5 text-[15px] font-medium" style={btnDark}>
            Book a walkthrough
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [email, setEmail] = useState("");
  const go = (e: FormEvent) => {
    e.preventDefault();
    openDemo("enterprise-hero");
  };
  return (
    <section style={{ background: `linear-gradient(180deg, ${GROUND} 0%, #fff 100%)` }}>
      <div className="mx-auto max-w-[1180px] px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <h1 className="text-[40px] md:text-[68px] leading-[1.04] font-medium tracking-[-0.03em]" style={{ color: INK, fontFamily: FONT }}>
          End the manual month-end.
          <br />
          Keep your existing books.
        </h1>
        <p className="mt-7 mx-auto max-w-[720px] text-[18px] md:text-[20px] leading-relaxed" style={{ color: MUTED }}>
          FynHelp is the intelligence layer that sits on top of your current accounting system. It extracts, reconciles
          and prepares a clean, source-traceable close pack, so your team only reviews exceptions.
        </p>
        <form onSubmit={go} className="mt-10 mx-auto flex flex-col sm:flex-row gap-3 max-w-[560px]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your work email"
            aria-label="Work email"
            className="flex-1 rounded-md px-4 py-3.5 text-[15px] outline-none"
            style={{ background: "#fff", border: `1px solid ${LINE}`, color: INK }}
          />
          <button type="submit" className="rounded-md px-6 py-3.5 text-[15px] font-medium inline-flex items-center justify-center gap-2" style={{ background: TEAL, color: "#fff" }}>
            Book a walkthrough <ArrowRight size={16} />
          </button>
        </form>
        <div className="mt-5 flex items-center justify-center gap-6 text-[15px]">
          <a href="#how" className="font-medium underline underline-offset-4" style={{ color: INK }}>
            See how it works
          </a>
          <Link to="/samples" className="underline underline-offset-4" style={{ color: MUTED }}>
            See a sample close pack
          </Link>
        </div>
      </div>
    </section>
  );
}

function IndiaStrip() {
  const items = ["Tally day book", "Zoho Books", "HDFC, ICICI, SBI and other bank statements", "WhatsApp follow-ups", "Amounts in ₹ and lakh format", "SAP and Oracle connectors in design"];
  return (
    <section style={{ background: "#fff", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
      <div className="mx-auto max-w-[1180px] px-6 py-8">
        <div className="text-center text-[12px] tracking-[0.14em] uppercase font-medium" style={{ color: MUTED }}>
          Built for how Indian finance teams work
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[15px] font-medium" style={{ color: INK }}>
          {items.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section style={{ background: "#fff" }}>
      <div className="mx-auto max-w-[1180px] px-6 py-20 grid lg:grid-cols-2 gap-12">
        <div>
          <div className="text-[12px] tracking-[0.14em] uppercase font-medium" style={{ color: MUTED }}>
            The problem
          </div>
          <h2 className="mt-4 text-[32px] md:text-[44px] leading-[1.1] font-medium tracking-[-0.025em]" style={{ color: INK, fontFamily: FONT }}>
            Month-end still looks the same in most finance teams.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed" style={{ color: MUTED }}>
            Adding more people only increases the review burden. You need a better layer, not another full system
            replacement.
          </p>
        </div>
        <ul style={{ border: `1px solid ${LINE}` }}>
          {PAIN.map((p, i) => (
            <li key={p} className="flex items-center gap-4 px-6 py-5 text-[17px]" style={{ color: INK, borderTop: i ? `1px solid ${LINE}` : "none" }}>
              <X size={18} color="#B5483B" className="shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" style={{ background: GROUND }}>
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="text-[12px] tracking-[0.14em] uppercase font-medium" style={{ color: MUTED }}>
          How FynHelp works
        </div>
        <h2 className="mt-4 text-[32px] md:text-[44px] leading-[1.1] font-medium tracking-[-0.025em] max-w-[760px]" style={{ color: INK, fontFamily: FONT }}>
          Four steps. Your team only touches the last one.
        </h2>
        <div className="mt-12 grid md:grid-cols-2" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
          {STEPS.map((s, i) => (
            <div key={s.t} className="flex" style={{ borderTop: i > 1 ? `1px solid ${LINE}` : "none", borderLeft: i % 2 ? `1px solid ${LINE}` : "none" }}>
              <div className="w-[76px] shrink-0 flex items-start justify-center pt-7" style={{ borderRight: `1px solid ${LINE}`, background: GROUND }}>
                <s.icon size={22} color={TEAL} />
              </div>
              <div className="p-7">
                <div className="text-[12px] font-medium" style={{ color: MUTED }}>
                  Step {s.n}
                </div>
                <h3 className="mt-1 text-[22px] font-medium tracking-tight" style={{ color: INK }}>
                  {s.t}
                </h3>
                <p className="mt-2 text-[15.5px] leading-relaxed" style={{ color: MUTED }}>
                  {s.d}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Why() {
  return (
    <section id="why" style={{ background: "#fff" }}>
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="text-[12px] tracking-[0.14em] uppercase font-medium" style={{ color: MUTED }}>
          Why finance teams choose this approach
        </div>
        <h2 className="mt-4 text-[32px] md:text-[44px] leading-[1.1] font-medium tracking-[-0.025em] max-w-[760px]" style={{ color: INK, fontFamily: FONT }}>
          You keep your current stack. You remove the most painful part of the close.
        </h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3" style={{ border: `1px solid ${LINE}` }}>
          {REASONS.map((r, i) => (
            <div
              key={r.t}
              className="flex items-center gap-4 p-6"
              style={{
                borderTop: i >= 3 ? `1px solid ${LINE}` : "none",
                borderLeft: i % 3 ? `1px solid ${LINE}` : "none",
              }}
            >
              <div className="w-11 h-11 flex items-center justify-center shrink-0" style={{ background: GROUND }}>
                <r.icon size={20} color={TEAL} />
              </div>
              <div className="text-[16px] font-medium leading-snug" style={{ color: INK }}>
                {r.t}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Change() {
  return (
    <section id="change" style={{ background: GROUND }}>
      <div className="mx-auto max-w-[1000px] px-6 py-20">
        <h2 className="text-[32px] md:text-[44px] leading-[1.1] font-medium tracking-[-0.025em] text-center" style={{ color: INK, fontFamily: FONT }}>
          What changes
        </h2>
        <div className="mt-10" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
          <div className="grid grid-cols-2 text-[12px] tracking-[0.14em] uppercase font-medium" style={{ background: GROUND, color: MUTED }}>
            <div className="px-6 py-4">Before</div>
            <div className="px-6 py-4" style={{ borderLeft: `1px solid ${LINE}` }}>
              After FynHelp
            </div>
          </div>
          {BEFORE_AFTER.map(([b, a]) => (
            <div key={b} className="grid grid-cols-2 text-[16px]" style={{ borderTop: `1px solid ${LINE}` }}>
              <div className="px-6 py-5" style={{ color: MUTED }}>
                {b}
              </div>
              <div className="px-6 py-5 flex items-center gap-3 font-medium" style={{ borderLeft: `1px solid ${LINE}`, color: INK }}>
                <CheckCircle2 size={18} color={TEAL} className="shrink-0" />
                {a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section style={{ background: `linear-gradient(120deg, ${TEAL_DEEP} 0%, ${TEAL} 55%, #2A7A74 100%)` }}>
      <div className="mx-auto max-w-[900px] px-6 py-24 text-center">
        <h2 className="text-[34px] md:text-[52px] leading-[1.1] font-medium tracking-[-0.03em]" style={{ color: "#fff", fontFamily: FONT }}>
          Stop spending your best people on matching.
        </h2>
        <p className="mt-5 text-[19px]" style={{ color: "rgba(255,255,255,0.8)" }}>
          Give them time to analyse and advise.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => openDemo("enterprise-close")} className="rounded-md px-7 py-3.5 text-[15px] font-medium" style={{ background: "#fff", color: INK }}>
            Book a walkthrough
          </button>
          <Link to="/samples" className="rounded-md px-7 py-3.5 text-[15px] font-medium" style={{ border: "1px solid rgba(255,255,255,0.45)", color: "#fff" }}>
            See a sample close pack
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: INK }}>
      <div className="mx-auto max-w-[1180px] px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[14px]" style={{ color: "rgba(255,255,255,0.6)" }}>
        <div className="text-[18px] font-semibold" style={{ color: "#fff" }}>
          FynHelp
        </div>
        <div className="flex gap-6">
          <Link to="/security">Security</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

export default function EnterprisePage() {
  return (
    <div style={{ background: "#fff", fontFamily: FONT }}>
      <TopBar />
      <Nav />
      <Hero />
      <IndiaStrip />
      <Problem />
      <How />
      <Why />
      <Change />
      <Close />
      <Footer />
    </div>
  );
}
