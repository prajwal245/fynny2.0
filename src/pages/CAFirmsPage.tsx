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
import { Link } from "@/lib/router-compat";
import { CTA_DEMO, CTA_NOTE, CTA_START, SIGNUP_URL, trackCta } from "@/components/site/cta";
import { DemoLink } from "@/components/site/BookDemo";
import ProductShot from "@/components/site/ProductShot";

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
            Practice software for CA firms, built on expertise.{" "}
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
            Every month your team collects statements, matches bank lines to the books by hand and
            rebuilds the same MIS. FynHelp reads the documents, matches what ties out and leaves your
            team only the lines that need a decision.
          </p>
          <p
            className="mt-4 max-w-xl text-[17px] leading-relaxed"
            style={{ color: "rgba(23,18,8,0.72)" }}
          >
            Works alongside Tally and Zoho: upload exports or connect Zoho Books, and keep your ledger where it is.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link
              to={SIGNUP_URL}
              onClick={() => trackCta("start", "ca-firms-hero")}
              className="inline-flex items-center gap-2 px-7 h-12 rounded-md font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: RED }}
            >
              {CTA_START} <ArrowRight size={18} />
            </Link>
            <DemoLink location="ca-firms-hero" className="inline-flex items-center gap-1.5 font-semibold" style={{ color: DARK }}>
              {CTA_DEMO} <ArrowRight size={16} />
            </DemoLink>
          </div>

          <p className="mt-8 text-sm" style={{ color: "rgba(23,18,8,0.55)" }}>
            Built for Indian CA firms that close books for business clients every month
          </p>
        </motion.div>

        {/* Right — a real screenshot taken on the sample files */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-2"
        >
          <ProductShot eager src="/guide/19-portfolio.jpg" alt="Portfolio: every client and its status for the month" />
        </motion.div>
      </div>
    </section>
  );
}


/* ---------- SOCIAL PROOF STRIP (dark) ---------- */
function ProofStrip() {
  return (
    <section style={{ background: DARK }}>
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-2xl md:text-3xl leading-snug" style={{ ...serif, color: "#fff" }}>
          Set up your firm and read your first statement in five minutes.
        </p>
        <p className="mt-4 text-base" style={{ color: "rgba(255,255,255,0.6)" }}>
          {CTA_NOTE}
        </p>
        <Link
          to={SIGNUP_URL}
          onClick={() => trackCta("start", "ca-firms-strip")}
          className="inline-flex items-center gap-2 mt-8 rounded-md px-6 py-3 font-semibold text-white"
          style={{ background: RED }}
        >
          {CTA_START} →
        </Link>
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
      body: "Juniors rebuild the same reports for each client from scratch. Same data, same format, same process, every month.",
    },
    {
      icon: AlertTriangle,
      title: "Errors that find you at the worst time",
      body: "A mismatched entry spotted after the report goes out. Manual work produces manual mistakes — and your reputation absorbs every one of them.",
    },
    {
      icon: TrendingDown,
      title: "You can’t scale what you can’t automate",
      body: "Every new client is a net cost to your team’s capacity. Hiring junior staff to handle volume eats the margin that made growth worthwhile.",
    },
    {
      icon: Users,
      title: "Your senior people are doing junior work",
      body: "Your partners have the expertise to advise clients and build relationships. Instead, they’re reviewing Excel sheets that should have been ready days ago.",
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
          Every new client adds the same manual matching and report building, every month.
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
    { n: "01", icon: FileSearch, title: "Upload", desc: "Bank statements, Tally exports, invoices, GST and TDS registers. CSV, Excel, Tally XML, PDF or photos." },
    { n: "02", icon: FileSearch, title: "Extract", desc: "Each line is read into date, amount and counterparty. Low-confidence lines go to a review queue." },
    { n: "03", icon: FileText, title: "Reconcile", desc: "Bank matched to books: exact, same-day, fuzzy, your rules, then split payments." },
    { n: "04", icon: FileStack, title: "Review", desc: "Your team decides the exceptions, a partner signs off the MIS." },
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
    { icon: FileText, t: "Monthly client MIS", d: "Built from matched lines only, with every figure linked to its source. PDF and Excel." },
    { icon: LineChart, t: "Exception queue", d: "Every unmatched line with a reason code. Match, ignore or book it, with a note on the audit trail." },
    { icon: Bell, t: "Document chaser", d: "Follow up clients for missing statements by email or a WhatsApp link." },
    { icon: LayoutGrid, t: "Portfolio view", d: "Every client’s close status for the month in one place, with partner sign-off." },
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

/* ---------- FOOTER STRIP (dark) ---------- */
function FooterStrip() {
  const trust = [
    { icon: LayoutGrid, label: "Multi-Client Ready" },
    { icon: Lock, label: "Secure Data Handling" },
    { icon: Building2, label: "Built for Accounting Firms" },
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
      <div style={{ background: CREAM }}>
        <Hero />
        <ProofStrip />
        <Problem />
        <HowItWorks />
        <Features />
        <FooterStrip />
      </div>
    </Layout>
  );
}
