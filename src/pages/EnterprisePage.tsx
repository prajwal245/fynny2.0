import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  FileSpreadsheet,
  GitMerge,
  Landmark,
  Receipt,
  ShieldCheck,
  Send,
  Workflow,
} from "lucide-react";
import Layout from "@/components/Layout";
import { notifyWaitlistLead } from "@/lib/waitlistNotify.functions";

/**
 * /enterprise: "coming soon" page for Heads of Finance at larger Indian companies.
 * Honest by design: it states what is in design, not what is shipped, and collects
 * early-access interest. Leads reach the team through notifyWaitlistLead (email).
 */

const CREAM = "#EFE8D8";
const DARK = "#171208";
const RED = "#A93838";
const SOFT = "#F5EFE2";
const serif = { fontFamily: '"Playfair Display", Georgia, serif' };

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

const CASES = [
  {
    icon: Landmark,
    title: "Bank reconciliation across every account",
    body: "Statements from every bank and entity, matched to Tally, SAP or Zoho Books. Only the exceptions reach your team, each with the evidence beside it.",
  },
  {
    icon: Receipt,
    title: "GST and TDS reconciliation",
    body: "GSTR-2B against purchase books, and TDS deducted against TDS deposited. Mismatches are listed with the vendor, the invoice and the likely reason.",
  },
  {
    icon: GitMerge,
    title: "Intercompany matching",
    body: "Group entities agree on what they owe each other before close, not after. Differences go to the right owner with a due date.",
  },
  {
    icon: Workflow,
    title: "Month-end close checklist",
    body: "A live close calendar per entity: who owes what, what is blocked and what is done. Reviewers sign off in order.",
  },
  {
    icon: FileSpreadsheet,
    title: "MIS and board-pack commentary",
    body: "Draft commentary on why numbers moved, written from your own ledgers. Every figure opens to the lines behind it.",
  },
  {
    icon: Send,
    title: "Vendor and customer follow-ups",
    body: "Missing invoices, confirmations and receivable reminders go out on WhatsApp or email, and stop the moment the document arrives.",
  },
];

const PRINCIPLES = [
  { icon: Building2, t: "Keep your ERP", d: "Works on top of Tally, SAP, Oracle, Dynamics or Zoho Books. Nothing to rip out." },
  { icon: Banknote, t: "Built for India", d: "GST, TDS, e-invoicing, Indian bank formats, WhatsApp and rupees from day one." },
  { icon: ShieldCheck, t: "Humans decide", d: "Agents prepare. Your team approves. Every change is logged with who and when." },
];

const NEEDS = [
  "Multiple entities and approval hierarchies",
  "SSO and role-based access",
  "Audit trail on every decision",
  "India-hosted data",
  "Integrations with your ERP and banks",
];

const ENTITIES = ["1–5", "6–25", "26–100", "100+"];
const TOOLS = ["Tally", "SAP", "Oracle", "Microsoft Dynamics", "Zoho Books", "NetSuite", "Excel", "Other"];

function Hero() {
  return (
    <section style={{ background: CREAM }}>
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 lg:pt-28 lg:pb-20 text-center">
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <span
            className="inline-block text-[12px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full"
            style={{ background: `${RED}14`, color: RED }}
          >
            Enterprise · Coming soon
          </span>
          <h1 className="mt-6 text-4xl md:text-6xl leading-[1.08]" style={{ ...serif, color: DARK }}>
            Month-end for finance teams,
            <br />
            <span style={{ color: RED }}>run by agents.</span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg leading-relaxed" style={{ color: "rgba(23,18,8,0.72)" }}>
            Reconciliations, GST and TDS checks, intercompany matching and MIS commentary, on the Tally, SAP or
            Zoho books you already run. Your team reviews. Your finance head signs off.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#early-access"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold text-white"
              style={{ background: RED }}
            >
              Get early access <ArrowRight size={16} />
            </a>
            <a
              href="/ca-firms"
              className="inline-flex items-center rounded-full px-7 py-3.5 text-[15px] font-semibold"
              style={{ background: "#fff", color: DARK, border: "1px solid rgba(23,18,8,0.12)" }}
            >
              See it live for CA firms
            </a>
          </div>
          <p className="mt-4 text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            Already running month-end for CA firms in production. Enterprise is opening to a small first group.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section style={{ background: SOFT }}>
      <div className="mx-auto max-w-6xl px-6 py-14 grid md:grid-cols-3 gap-6">
        {PRINCIPLES.map((p) => (
          <div key={p.t} className="rounded-2xl p-6" style={{ background: "#fff" }}>
            <p.icon size={22} color={RED} />
            <h3 className="mt-4 text-lg font-semibold" style={{ color: DARK }}>
              {p.t}
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "rgba(23,18,8,0.7)" }}>
              {p.d}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section style={{ background: CREAM }}>
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl md:text-4xl max-w-2xl" style={{ ...serif, color: DARK }}>
          The work that fills your close calendar, taken off your team.
        </h2>
        <p className="mt-4 max-w-2xl text-[16px]" style={{ color: "rgba(23,18,8,0.7)" }}>
          These are the automations we are designing with finance heads. Tell us which ones matter most and they move
          up the list.
        </p>
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CASES.map((c) => (
            <div key={c.title} className="rounded-2xl p-6" style={{ background: "#fff" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${RED}14` }}>
                <c.icon size={20} color={RED} />
              </div>
              <h3 className="mt-4 text-[17px] font-semibold leading-snug" style={{ color: DARK }}>
                {c.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "rgba(23,18,8,0.7)" }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Controls() {
  return (
    <section style={{ background: DARK }}>
      <div className="mx-auto max-w-6xl px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl md:text-4xl" style={{ ...serif, color: "#fff" }}>
            Built to pass your IT and audit review.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
            Enterprise finance has controls that a small-firm tool never needed. This is what we are building for the
            first group.
          </p>
        </div>
        <ul className="space-y-3">
          {NEEDS.map((n) => (
            <li key={n} className="flex items-start gap-3 text-[16px]" style={{ color: "rgba(255,255,255,0.9)" }}>
              <CheckCircle2 size={20} color="#E0A39A" className="mt-0.5 shrink-0" />
              {n}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EarlyAccess() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [tools, setTools] = useState<string[]>([]);
  const [cases, setCases] = useState<string[]>([]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    setState("sending");
    try {
      const params = new URLSearchParams(window.location.search);
      await notifyWaitlistLead({
        data: {
          full_name: str("name"),
          email: str("email"),
          firm_name: str("company"),
          role: str("role").slice(0, 50) || "Head of Finance",
          client_entities: str("entities"),
          hear_about: "Enterprise page",
          month_end_pain: [
            `Systems: ${tools.join(", ") || "n/a"}`,
            `Automations wanted: ${cases.join("; ") || "n/a"}`,
            `Biggest problem: ${str("pain") || "n/a"}`,
          ]
            .join(" | ")
            .slice(0, 500),
          utm_source: params.get("utm_source") ?? "",
          utm_medium: params.get("utm_medium") ?? "",
          utm_campaign: params.get("utm_campaign") ?? "",
          referrer: document.referrer.slice(0, 500),
          landing_page: window.location.href.slice(0, 500),
        },
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  const input = "w-full rounded-xl px-4 py-3 text-[15px] outline-none";
  const inputStyle = { background: "#fff", border: "1px solid rgba(23,18,8,0.14)", color: DARK };
  const chip = (on: boolean) => ({
    background: on ? RED : "#fff",
    color: on ? "#fff" : DARK,
    border: `1px solid ${on ? RED : "rgba(23,18,8,0.14)"}`,
  });

  return (
    <section id="early-access" style={{ background: SOFT }}>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-3xl md:text-4xl text-center" style={{ ...serif, color: DARK }}>
          Get early access
        </h2>
        <p className="mt-3 text-center text-[16px]" style={{ color: "rgba(23,18,8,0.7)" }}>
          Two minutes. We will use your answers to decide what to build first, and call you when it is ready.
        </p>

        {state === "done" ? (
          <div className="mt-10 rounded-2xl p-8 text-center" style={{ background: "#fff" }}>
            <CheckCircle2 size={32} color="#2F855A" className="mx-auto" />
            <h3 className="mt-3 text-xl font-semibold" style={{ color: DARK }}>
              Thank you. You are on the list.
            </h3>
            <p className="mt-2 text-[15px]" style={{ color: "rgba(23,18,8,0.7)" }}>
              We will reach out personally. Meanwhile, you can see the product working for CA firms.
            </p>
            <a href="/ca-firms" className="mt-5 inline-flex items-center gap-2 font-semibold" style={{ color: RED }}>
              See FynHelp live <ArrowRight size={16} />
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-10 space-y-5 rounded-2xl p-6 md:p-8" style={{ background: "#fff" }}>
            <div className="grid md:grid-cols-2 gap-4">
              <input name="name" required maxLength={100} placeholder="Your name" className={input} style={inputStyle} />
              <input name="email" type="email" required maxLength={255} placeholder="Work email" className={input} style={inputStyle} />
              <input name="company" required maxLength={150} placeholder="Company" className={input} style={inputStyle} />
              <input name="role" maxLength={50} placeholder="Your role (e.g. Head of Finance)" className={input} style={inputStyle} />
            </div>

            <div>
              <label className="block text-[14px] font-semibold mb-2" style={{ color: DARK }}>
                How many entities do you close each month?
              </label>
              <select name="entities" required defaultValue="" className={input} style={inputStyle}>
                <option value="" disabled>
                  Select
                </option>
                {ENTITIES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[14px] font-semibold mb-2" style={{ color: DARK }}>
                Which systems hold your books?
              </div>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    aria-pressed={tools.includes(t)}
                    onClick={() => toggle(tools, setTools, t)}
                    className="rounded-full px-4 py-2 text-[14px]"
                    style={chip(tools.includes(t))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[14px] font-semibold mb-2" style={{ color: DARK }}>
                Which would you automate first? (pick up to 3)
              </div>
              <div className="flex flex-wrap gap-2">
                {CASES.map((c) => {
                  const on = cases.includes(c.title);
                  return (
                    <button
                      type="button"
                      key={c.title}
                      aria-pressed={on}
                      disabled={!on && cases.length >= 3}
                      onClick={() => toggle(cases, setCases, c.title)}
                      className="rounded-full px-4 py-2 text-[14px] disabled:opacity-40"
                      style={chip(on)}
                    >
                      {c.title}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              name="pain"
              maxLength={300}
              rows={3}
              placeholder="What would be worth the most to fix in your next close?"
              className={input}
              style={inputStyle}
            />

            {state === "error" && (
              <p className="text-[14px]" style={{ color: RED }}>
                Something went wrong. Please try again, or write to nidhi@fynhelp.com.
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded-full py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
              style={{ background: RED }}
            >
              {state === "sending" ? "Sending…" : "Request early access"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default function EnterprisePage() {
  return (
    <Layout>
      <Hero />
      <Principles />
      <UseCases />
      <Controls />
      <EarlyAccess />
    </Layout>
  );
}
