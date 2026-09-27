import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowDown,
  Clock,
  AlertTriangle,
  TrendingDown,
  Users,
  Link2,
  Activity,
  FileText,
  FileSearch,
  FileStack,
  Building2,
  LineChart,
  Bell,
  LayoutGrid,
  Shield,
  Lock,
  CheckCircle2,
} from "lucide-react";
import Layout from "@/components/Layout";

/**
 * /ca-firms — landing page for CA firms & accounting practices.
 * Uses the existing site theme (beige #EFE8D8, red #A93838, gold #8B6914,
 * Playfair Display headlines, DM Sans body) rather than introducing a new palette.
 */

const CREAM = "#EFE8D8";
const CARD = "#FFFFFF";
const DARK = "#171208";
const RED = "#A93838";
const RED_TINT = "#A9383814";
const SOFT = "#F5EFE2";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

const serif = { fontFamily: '"Playfair Display", Georgia, serif' };

/* ---------- HERO ---------- */
function Hero() {
  return (
    <section className="relative" style={{ background: CREAM }}>
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-28 lg:pb-32 grid lg:grid-cols-5 gap-12 items-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="lg:col-span-3"
        >
          <span
            className="inline-block text-[12px] font-semibold tracking-wider uppercase px-3 py-1.5 rounded-full"
            style={{ color: RED, background: RED_TINT }}
          >
            For CA Firms & Accounting Practices
          </span>

          <h1
            className="mt-6 font-bold leading-[1.05] tracking-tight"
            style={{ ...serif, color: DARK, fontSize: "clamp(40px, 5.6vw, 72px)" }}
          >
            You built your firm on expertise.
            <span
              className="block mt-2"
              style={{ ...serif, color: RED, fontSize: "clamp(48px, 6.8vw, 88px)" }}
            >
              Not on spreadsheets.
            </span>
          </h1>

          <p
            className="mt-7 max-w-xl text-[17px] leading-relaxed"
            style={{ color: "rgba(23,18,8,0.72)" }}
          >
            Every month, your best people spend weeks pulling client data, assembling reports, and
            chasing reconciliations. FynHelp automates the grunt work — so your firm can take on
            more clients without hiring more staff.
          </p>
          <p
            className="mt-4 max-w-xl text-[17px] leading-relaxed"
            style={{ color: "rgba(23,18,8,0.72)" }}
          >
            The intelligence layer on top of Tally and Zoho — for faster, trusted month-end close.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <a
              href="#early-access"
              className="inline-flex items-center gap-2 px-7 h-12 rounded-md font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: RED }}
            >
              Request Early Access <ArrowRight size={18} />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-1.5 font-semibold"
              style={{ color: DARK }}
            >
              See How It Works <ArrowDown size={16} />
            </a>
          </div>

          <p className="mt-8 text-sm" style={{ color: "rgba(23,18,8,0.55)" }}>
            Built for accounting firms managing 30–150 business clients
          </p>
        </motion.div>

        {/* Right — abstract dashboard mock */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-2"
        >
          <DashboardMock />
        </motion.div>
      </div>
    </section>
  );
}

function DashboardMock() {
  const rows = [
    { name: "Sharma Textiles Pvt Ltd", state: "Ready", tone: "ok" },
    { name: "BlinkIt Logistics", state: "Review", tone: "warn" },
    { name: "Anand Steel Works", state: "Ready", tone: "ok" },
    { name: "Coastal Foods LLP", state: "Syncing", tone: "muted" },
    { name: "NovaTech Solutions", state: "Ready", tone: "ok" },
  ];
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: CARD, borderColor: "rgba(23,18,8,0.08)", boxShadow: "0 30px 60px -30px rgba(23,18,8,0.25)" }}
    >
      <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: "rgba(23,18,8,0.08)" }}>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "rgba(23,18,8,0.5)" }}>
            Portfolio
          </div>
          <div className="text-lg font-semibold" style={{ ...serif, color: DARK }}>
            48 client firms
          </div>
        </div>
        <div
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ color: RED, background: RED_TINT }}
        >
          ● PREVIEW
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { l: "MIS ready", v: "42" },
          { l: "In review", v: "4" },
          { l: "Pending", v: "2" },
        ].map((s) => (
          <div key={s.l} className="rounded-md p-3" style={{ background: SOFT }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(23,18,8,0.5)" }}>
              {s.l}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums" style={{ ...serif, color: DARK }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between text-sm py-2.5 px-3 rounded-md"
            style={{ background: SOFT }}
          >
            <span className="font-medium truncate" style={{ color: DARK }}>
              {r.name}
            </span>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                color:
                  r.tone === "ok" ? "#0f6b3f" : r.tone === "warn" ? RED : "rgba(23,18,8,0.55)",
                background:
                  r.tone === "ok" ? "#0f6b3f14" : r.tone === "warn" ? RED_TINT : "rgba(23,18,8,0.06)",
              }}
            >
              {r.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- SOCIAL PROOF STRIP (dark) ---------- */
function ProofStrip() {
  return (
    <section style={{ background: DARK }}>
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-2xl md:text-3xl leading-snug" style={{ ...serif, color: "#fff" }}>
          Be among the first CA firms to experience FynHelp.
        </p>
        <p className="mt-4 text-base" style={{ color: "rgba(255,255,255,0.6)" }}>
          Share your feedback and shape the product.
        </p>
        <a
          href="#early-access"
          className="inline-flex items-center gap-2 mt-8 rounded-md px-6 py-3 font-semibold text-white"
          style={{ background: RED }}
        >
          Reserve Early Access →
        </a>
      </div>
    </section>
  );
}


/* ---------- PROBLEM (dark) ---------- */
function Problem() {
  const cards = [
    {
      icon: Clock,
      title: "Month-end eats your team alive",
      body: "Junior staff spend 3–5 days per client compiling reports from scratch. Same data. Same format. Same process. Every single month.",
    },
    {
      icon: AlertTriangle,
      title: "Errors that find you at the worst time",
      body: "A mismatched entry spotted after the report goes out. Manual work produces manual mistakes — and your reputation absorbs every one of them.",
    },
    {
      icon: TrendingDown,
      title: "You can't scale what you can't automate",
      body: "Every new client is a net cost to your team's capacity. Hiring junior staff to handle volume eats the margin that made growth worthwhile.",
    },
    {
      icon: Users,
      title: "Your senior people are doing junior work",
      body: "Your partners have the expertise to advise clients and build relationships. Instead, they're reviewing Excel sheets that should have been ready days ago.",
    },
  ];
  return (
    <section style={{ background: DARK }} className="border-t" >
      <div className="mx-auto max-w-6xl px-6 py-24">
        <span
          className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full"
          style={{ color: RED, background: "rgba(169,56,56,0.14)" }}
        >
          The Problem
        </span>
        <h2
          className="mt-5 max-w-3xl font-bold leading-tight"
          style={{ ...serif, color: "#fff", fontSize: "clamp(32px, 4vw, 48px)" }}
        >
          Your firm's growth ceiling isn't clients. It's your team's time.
        </h2>
        <p className="mt-5 max-w-2xl text-lg" style={{ color: "rgba(255,255,255,0.65)" }}>
          Every new client you take on adds the same 40 hours of manual work per month.
        </p>

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <motion.div
              key={c.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="p-7 rounded-lg border"
              style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
            >
              <c.icon size={22} style={{ color: RED }} />
              <h3 className="mt-4 text-xl font-bold" style={{ ...serif, color: RED }}>
                {c.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                {c.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- HOW IT WORKS ---------- */
function HowItWorks() {
  const steps = [
    { n: "01", icon: FileSearch, title: "Upload", desc: "Bank statements, invoices, expense bills — any format." },
    { n: "02", icon: FileSearch, title: "Extract", desc: "AI reads and classifies every line item with 98% accuracy." },
    { n: "03", icon: FileText, title: "Reconcile", desc: "Lines matched against ledger in three passes." },
    { n: "04", icon: FileStack, title: "Review", desc: "Exceptions resolved, reports generated automatically." },
  ];
  return (
    <section id="how-it-works" style={{ background: CREAM }}>
      <div className="mx-auto max-w-6xl px-6 py-24">
        <span
          className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full"
          style={{ color: RED, background: RED_TINT }}
        >
          How FynHelp Works
        </span>
        <h2
          className="mt-5 max-w-3xl font-bold leading-tight"
          style={{ ...serif, color: DARK, fontSize: "clamp(32px, 4vw, 48px)" }}
        >
          Connect once. Deliver for every client.
        </h2>

        <div className="mt-16 relative">
          <div
            className="hidden md:block absolute left-0 right-0 top-7 h-px"
            style={{ background: `linear-gradient(to right, ${RED}33, ${RED}, ${RED}33)` }}
          />
          <div className="grid md:grid-cols-4 gap-8 md:gap-6 relative">
            {steps.map((s) => (
              <div key={s.n} className="text-center md:text-left">
                <div
                  className="mx-auto md:mx-0 w-14 h-14 rounded-full flex items-center justify-center relative z-10"
                  style={{ background: CARD, border: `1.5px solid ${RED}`, color: RED }}
                >
                  <s.icon size={22} />
                </div>
                <div className="mt-4 text-xs font-bold tracking-widest" style={{ color: RED }}>
                  STEP {s.n}
                </div>
                <h3 className="mt-1.5 text-xl font-bold" style={{ ...serif, color: DARK }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px]" style={{ color: "rgba(23,18,8,0.65)" }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FEATURES ---------- */
function Features() {
  const items = [
    { icon: FileText, t: "Automated Client MIS", d: "Monthly reports generated directly from live client data." },
    { icon: LineChart, t: "Live Financial Dashboards", d: "Every client's cash, receivables, payables in real time." },
    { icon: Bell, t: "Early Warning Alerts", d: "Flags anomalies and cash risk before they become client calls." },
    { icon: LayoutGrid, t: "Multi-Client Portfolio View", d: "Every client's financial health in one place." },
  ];
  return (
    <section style={{ background: SOFT }}>
      <div className="mx-auto max-w-6xl px-6 py-24">
        <span
          className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full"
          style={{ color: RED, background: RED_TINT }}
        >
          What You Get
        </span>
        <h2
          className="mt-5 max-w-3xl font-bold leading-tight"
          style={{ ...serif, color: DARK, fontSize: "clamp(32px, 4vw, 48px)" }}
        >
          Everything your team was building by hand. Now built automatically.
        </h2>

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          {items.map((it) => (
            <motion.div
              key={it.t}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="p-8 rounded-lg border"
              style={{ background: CARD, borderColor: "rgba(23,18,8,0.08)" }}
            >
              <div
                className="w-12 h-12 rounded-md flex items-center justify-center"
                style={{ background: RED_TINT, color: RED }}
              >
                <it.icon size={22} />
              </div>
              <h3 className="mt-5 text-2xl font-bold" style={{ ...serif, color: DARK }}>
                {it.t}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "rgba(23,18,8,0.7)" }}>
                {it.d}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- QUOTES ---------- */
function Quotes() {
  const quotes = [
    {
      q: "The first month we used FynHelp, we recovered 11 days of team time. We used it to onboard three new clients.",
      who: "Managing Partner, 8-Partner CA Firm",
    },
    {
      q: "Our clients comment that our reports look better now. They have no idea we're spending a fraction of the time.",
      who: "Senior Manager, Accounting Practice",
    },
  ];
  return (
    <section style={{ background: CREAM }}>
      <div className="mx-auto max-w-6xl px-6 py-24">
        <span
          className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full"
          style={{ color: RED, background: RED_TINT }}
        >
          What Firms Say
        </span>
        <h2
          className="mt-5 font-bold leading-tight"
          style={{ ...serif, color: DARK, fontSize: "clamp(32px, 4vw, 48px)" }}
        >
          Built with firms like yours.
        </h2>

        <div className="mt-12 grid md:grid-cols-2 gap-6">
          {quotes.map((q) => (
            <div
              key={q.who}
              className="rounded-lg p-8"
              style={{ background: CARD, borderLeft: `4px solid ${RED}` }}
            >
              <p
                className="text-xl leading-snug italic"
                style={{ ...serif, color: DARK }}
              >
                “{q.q}”
              </p>
              <p
                className="mt-6 text-[11px] font-bold tracking-[0.18em] uppercase"
                style={{ color: "rgba(23,18,8,0.6)" }}
              >
                {q.who}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- LEAD FORM ---------- */
function LeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    firm: "",
    role: "Partner",
    city: "",
    clients: "30–75",
    pain: "",
    email: "",
  });


  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) { toast.error("Please enter a valid email"); return; }
    setSubmitting(true);
    const { error } = await (supabase.from("early_access_requests") as any).insert({
      email: form.email,
      module: "ca_firms",
      user_id: null,
      details: { name: form.name, firm: form.firm, role: form.role, city: form.city, client_count: form.clients, pain_point: form.pain },
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { setSubmitted(true); toast.success("Spot reserved — we'll be in touch"); }
  };


  const label = "block text-[12px] font-semibold mb-1.5";
  const field =
    "w-full h-11 px-3 rounded-md border bg-white text-[14px] outline-hidden focus:ring-2";
  const fieldStyle = { borderColor: "rgba(23,18,8,0.12)", color: DARK } as const;

  return (
    <section id="early-access" style={{ background: RED }}>
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span
          className="inline-block text-[11px] font-semibold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full"
          style={{ color: "#fff", background: "rgba(255,255,255,0.18)" }}
        >
          Early Access
        </span>
        <h2
          className="mt-5 font-bold leading-tight"
          style={{ ...serif, color: "#fff", fontSize: "clamp(32px, 4vw, 52px)" }}
        >
          Your firm's next growth stage starts here.
        </h2>
        <p className="mt-4 max-w-xl mx-auto text-lg" style={{ color: "rgba(255,255,255,0.85)" }}>
          We're onboarding a limited number of CA and accounting firms. Early members get priority
          pricing forever.
        </p>

        <div
          className="mt-12 mx-auto text-left rounded-xl p-6"
          style={{
            background: CARD,
            maxWidth: 520,
            boxShadow: "0 30px 60px -20px rgba(0,0,0,0.25)",
          }}
        >
          {submitted ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={40} style={{ color: RED }} className="mx-auto" />
              <h3 className="mt-4 text-2xl font-bold" style={{ ...serif, color: DARK }}>
                Spot reserved.
              </h3>
              <p className="mt-2 text-[15px]" style={{ color: "rgba(23,18,8,0.7)" }}>
                We'll reach out within 48 hours to set up your firm.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className={label} style={{ color: DARK }}>Your Name</label>
                <input required value={form.name} onChange={onChange("name")} className={field} style={fieldStyle} />
              </div>
              <div>
                <label className={label} style={{ color: DARK }}>Firm Name</label>
                <input required value={form.firm} onChange={onChange("firm")} className={field} style={fieldStyle} />
              </div>
              <div>
                <label className={label} style={{ color: DARK }}>Email</label>
                <input required type="email" value={form.email} onChange={onChange("email")} className={field} style={fieldStyle} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={label} style={{ color: DARK }}>Your Role</label>
                  <select value={form.role} onChange={onChange("role")} className={field} style={fieldStyle}>
                    <option>Partner</option>
                    <option>Senior Manager</option>
                    <option>Manager</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className={label} style={{ color: DARK }}>City</label>
                  <input required value={form.city} onChange={onChange("city")} className={field} style={fieldStyle} />
                </div>
              </div>
              <div>
                <label className={label} style={{ color: DARK }}>Clients managed</label>
                <select value={form.clients} onChange={onChange("clients")} className={field} style={fieldStyle}>
                  <option>Under 30</option>
                  <option>30–75</option>
                  <option>75–150</option>
                  <option>150+</option>
                </select>
              </div>
              <div>
                <label className={label} style={{ color: DARK }}>What takes the most time right now?</label>
                <textarea
                  rows={2}
                  value={form.pain}
                  onChange={onChange("pain")}
                  className="w-full px-3 py-2 rounded-md border bg-white text-[14px] outline-hidden focus:ring-2"
                  style={fieldStyle}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 font-semibold text-white rounded-md disabled:opacity-60"
                style={{ background: RED, height: 48 }}
              >
                {submitting ? "Reserving…" : <>Reserve My Spot <ArrowRight size={18} /></>}
              </button>
              <p className="text-center text-xs" style={{ color: "rgba(23,18,8,0.55)" }}>
                No commitment. No credit card. We'll reach out within 48 hours.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- FOOTER STRIP (dark) ---------- */
function FooterStrip() {
  const trust = [
    { icon: LayoutGrid, label: "Multi-Client Ready" },
    { icon: Lock, label: "Secure Data Handling" },
    { icon: Building2, label: "Built for Accounting Firms" },
    { icon: Shield, label: "SOC 2 In Progress (Q4 2026)" },
  ];
  return (
    <section style={{ background: DARK }}>
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col md:flex-row items-center md:justify-between gap-6">
        <div className="font-bold text-xl" style={{ ...serif, color: "#fff" }}>
          FynHelp
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {trust.map((t) => (
            <div key={t.label} className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              <t.icon size={14} />
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- PAGE ---------- */
export default function CAFirmsPage() {
  return (
    <Layout>
      <Helmet>
        <title>FynHelp for CA Firms — Automate Client MIS & Reporting</title>
        <meta
          name="description"
          content="FynHelp automates monthly client MIS, dashboards, and alerts for CA firms and accounting practices managing 30–150 business clients."
        />
        <link rel="canonical" href="https://fynhelp.com/ca-firms" />
      </Helmet>
      <div style={{ background: CREAM }}>
        <Hero />
        <ProofStrip />
        <Problem />
        <HowItWorks />
        <Features />
        <Quotes />
        <LeadForm />
        <FooterStrip />
      </div>
    </Layout>
  );
}
