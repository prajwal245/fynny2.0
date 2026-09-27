import { ReactNode, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import NotifyMeModal from "@/components/NotifyMeModal";
import {
  Brain,
  BarChart3,
  Shield,
  Rocket,
  Landmark,
  Building2,
  LayoutDashboard,
  FileBarChart,
  IndianRupee,
  ShieldCheck,
  ArrowDown,
  ArrowUp,
  CalendarClock,
} from "lucide-react";

/* ---------- shared bits ---------- */

const BEIGE = "#EFE8D8";
const INK = "#171208";
const RED = "#A93838";
const GOLD = "#8B6914";

function Stagger({ children }: { children: ReactNode[] }) {
  return (
    <>
      {children.map((c, i) => (
        <div
          key={i}
          className="animate-fade-in"
          style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
        >
          {c}
        </div>
      ))}
    </>
  );
}

function PreviewBadge() {
  return (
    <span
      title="This is a preview of what you'll see when the module launches"
      className="absolute top-2 right-2 uppercase px-1.5 py-0.5 rounded-full"
      style={{
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(23,18,8,0.08)",
        color: "rgba(23,18,8,0.65)",
        letterSpacing: "0.08em",
      }}
    >
      Preview
    </span>
  );
}

function NotifyButton({
  moduleId,
  label = "Notify me when live",
  variant = "dark",
  fullWidth = false,
}: {
  moduleId: string;
  label?: string;
  variant?: "dark" | "red";
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center rounded-lg transition-opacity hover:opacity-90 ${
          fullWidth ? "w-full" : ""
        }`}
        style={{
          background: variant === "red" ? RED : INK,
          color: "#fff",
          padding: "11px 26px",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </button>
      <NotifyMeModal open={open} initialModuleId={moduleId} onClose={() => setOpen(false)} />
    </>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-64px)] py-10 px-6 md:px-10" style={{ background: BEIGE }}>
        {children}
      </div>
    </DashboardLayout>
  );
}

/* =================================================================
   PAGE 1 — Decision Simulator (Geometric Beige)
================================================================= */

export function DecisionSimulatorComingSoon() {
  return (
    <PageShell>
      <div className="relative max-w-5xl mx-auto">
        {/* decorative geometry */}
        <div
          className="pointer-events-none absolute top-0 right-0 flex gap-2"
          style={{ opacity: 0.15 }}
          aria-hidden
        >
          <span className="block w-2 h-2" style={{ background: RED }} />
          <span className="block w-2 h-2" style={{ background: RED }} />
        </div>
        <div
          className="pointer-events-none absolute bottom-0 left-0 rounded-full border"
          style={{ width: 24, height: 24, borderColor: RED, opacity: 0.15 }}
          aria-hidden
        />

        <Stagger>
          {[
            <div key="hero" className="flex flex-col items-center text-center mx-auto" style={{ maxWidth: 480 }}>
              <div
                className="flex items-center justify-center mb-4"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: "#fff",
                  border: `0.5px solid ${RED}33`,
                }}
              >
                <Brain size={24} color={RED} />
              </div>
              <span
                className="inline-block mb-4 uppercase"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: RED,
                  color: "#fff",
                  padding: "4px 11px",
                  borderRadius: 20,
                  letterSpacing: "0.08em",
                }}
              >
                Coming soon
              </span>
              <h1
                className="mb-3"
                style={{ fontSize: 24, fontWeight: 700, color: INK, fontFamily: "Playfair Display, Georgia, serif", letterSpacing: "-0.02em" }}
              >
                Decision Simulator
              </h1>
              <p className="mx-auto" style={{ color: "#4A4540", fontSize: 13, lineHeight: 1.7, maxWidth: 360 }}>
                Model the financial impact of any decision before you commit. Hiring, pricing, credit
                terms — see the numbers before you move.
              </p>
            </div>,

            <div key="chips" className="flex flex-wrap gap-2 justify-center mt-6">
              {["Hiring impact", "Pricing scenarios", "Credit term simulator", "Loan impact"].map((c) => (
                <span
                  key={c}
                  className="px-3 py-1.5 rounded-full bg-white"
                  style={{ fontSize: 11, fontWeight: 500, color: "#3D3530", border: `0.5px solid ${RED}33` }}
                >
                  {c}
                </span>
              ))}
            </div>,

            <div key="cta" className="flex flex-col items-center mt-8 gap-2">
              <NotifyButton moduleId="simulator" />
              <p style={{ fontSize: 11, color: "rgba(23,18,8,0.62)" }}>
                We'll email you as soon as this module launches.
              </p>
            </div>,

            <div key="previews" className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
              {[
                {
                  title: "Hire 2 Engineers",
                  label: "Runway impact",
                  before: "4.6 mo",
                  after: "3.1 mo",
                  arrow: <ArrowDown size={14} color={RED} />,
                  color: RED,
                },
                {
                  title: "Raise Prices +15%",
                  label: "Burn impact",
                  before: "₹0.83L",
                  after: "₹0.21L",
                  arrow: <ArrowUp size={14} color="#1F5A46" />,
                  color: "#1F5A46",
                },
                {
                  title: "Take ₹50L Loan",
                  label: "Timeline extension",
                  before: "Oct 2026",
                  after: "Feb 2027",
                  arrow: <CalendarClock size={14} color={GOLD} />,
                  color: GOLD,
                },
              ].map((p) => (
                <div
                  key={p.title}
                  className="relative rounded-xl bg-white p-4"
                  style={{ opacity: 0.85, border: "0.5px solid rgba(23,18,8,0.08)" }}
                >
                  <PreviewBadge />
                  <div className="uppercase mb-2" style={{ fontSize: 10, fontWeight: 600, color: "#5C5550", letterSpacing: "0.08em" }}>
                    {p.label}
                  </div>
                  <div className="mb-3" style={{ fontSize: 14, fontWeight: 600, color: INK }}>
                    {p.title}
                  </div>
                  <div className="flex items-center gap-2" style={{ fontSize: 13, color: "#4A4540" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, fontWeight: 700, color: INK }}>{p.before}</span>
                    {p.arrow}
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 20, fontWeight: 700, color: p.color }}>
                      {p.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>,
          ]}
        </Stagger>
      </div>
    </PageShell>
  );
}

/* =================================================================
   PAGE 2 — Market & Growth (Split Dark/Beige)
================================================================= */

export function MarketGrowthComingSoon() {
  return (
    <PageShell>
      <div className="max-w-5xl mx-auto">
        <Stagger>
          {[
            <div
              key="top"
              className="rounded-t-xl px-8 py-12 text-center"
              style={{ background: INK }}
            >
              <span
                className="inline-block mb-4 uppercase px-2.5 py-1 rounded-full"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: "rgba(169,56,56,0.18)",
                  color: "#F5A8A8",
                  border: "1px solid rgba(169,56,56,0.45)",
                  letterSpacing: "0.08em",
                }}
              >
                In development
              </span>
              <h1
                className="mb-3"
                style={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "Playfair Display, Georgia, serif", letterSpacing: "-0.02em" }}
              >
                Market & Growth Intelligence
              </h1>
              <p
                className="mx-auto mb-5"
                style={{ color: "rgba(255,255,255,0.78)", maxWidth: 520, fontSize: 13, lineHeight: 1.7 }}
              >
                See how your numbers compare to your industry. Get a fundraise-ready score before
                you talk to investors.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["Industry benchmarks", "Credit rating predictor", "Fundraise readiness score"].map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-full"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      background: "rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.82)",
                      border: "1px solid rgba(255,255,255,0.16)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>,

            <div
              key="bottom"
              className="rounded-b-xl px-8 py-8"
              style={{ background: BEIGE, borderTop: `1px solid ${RED}22` }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Card 1 */}
                <div
                  className="relative rounded-xl bg-white p-5"
                  style={{ opacity: 0.9, border: "0.5px solid rgba(23,18,8,0.08)" }}
                >
                  <PreviewBadge />
                  <div className="flex items-center gap-2 mb-3" style={{ fontSize: 12, fontWeight: 500, color: "#4A4540" }}>
                    <BarChart3 size={14} color={RED} /> Revenue Growth
                  </div>
                  <div className="mb-1" style={{ fontSize: 28, fontWeight: 700, color: RED, fontFamily: "ui-monospace, monospace", letterSpacing: "-0.02em" }}>
                    42%
                  </div>
                  <div className="mb-2" style={{ fontSize: 11, color: "rgba(23,18,8,0.62)" }}>
                    Industry median: 28%
                  </div>
                  <span
                    className="inline-block uppercase px-2 py-0.5 rounded-full"
                    style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", background: "#1F5A4620", color: "#0E8F66" }}
                  >
                    Above median
                  </span>
                </div>

                {/* Card 2 */}
                <div
                  className="relative rounded-xl bg-white p-5"
                  style={{ opacity: 0.9, border: "0.5px solid rgba(23,18,8,0.08)" }}
                >
                  <PreviewBadge />
                  <div className="flex items-center gap-2 mb-3" style={{ fontSize: 12, fontWeight: 500, color: "#4A4540" }}>
                    <Shield size={14} color={RED} /> Business Credit Score
                  </div>
                  <div className="mb-2" style={{ fontSize: 28, fontWeight: 700, color: INK, fontFamily: "ui-monospace, monospace", letterSpacing: "-0.02em" }}>
                    720<span style={{ fontSize: 14, fontWeight: 500, color: "rgba(23,18,8,0.62)" }}> / 900</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "#EFE8D8" }}>
                    <div className="h-full" style={{ width: "80%", background: GOLD }} />
                  </div>
                  <span
                    className="inline-block uppercase px-2 py-0.5 rounded-full"
                    style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", background: `${GOLD}20`, color: GOLD }}
                  >
                    Good
                  </span>
                </div>

                {/* Card 3 */}
                <div
                  className="relative rounded-xl bg-white p-5"
                  style={{ opacity: 0.9, border: "0.5px solid rgba(23,18,8,0.08)" }}
                >
                  <PreviewBadge />
                  <div className="flex items-center gap-2 mb-3" style={{ fontSize: 12, fontWeight: 500, color: "#4A4540" }}>
                    <Rocket size={14} color={RED} /> Series A Readiness
                  </div>
                  <div className="mb-2" style={{ fontSize: 28, fontWeight: 700, color: RED, fontFamily: "ui-monospace, monospace", letterSpacing: "-0.02em" }}>
                    67%
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: "#EFE8D8" }}>
                    <div className="h-full" style={{ width: "67%", background: RED }} />
                  </div>
                  <span
                    className="inline-block uppercase px-2 py-0.5 rounded-full"
                    style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", background: `${GOLD}20`, color: GOLD }}
                  >
                    Getting there
                  </span>
                </div>
              </div>
              <NotifyButton moduleId="market" label="Get Early Access" variant="red" fullWidth />
            </div>,
          ]}
        </Stagger>
      </div>
    </PageShell>
  );
}

/* =================================================================
   PAGE 3 — Banking (Progress/Roadmap)
================================================================= */

export function BankingComingSoon() {
  const milestones = [
    { text: "Core infrastructure built", status: "done", date: "Done" },
    { text: "Setu Account Aggregator integration", status: "done", date: "Done" },
    { text: "Multi-bank dashboard", status: "in_progress", date: "Jul 2026" },
    { text: "UPI auto-reconciliation", status: "upcoming", date: "Aug 2026" },
  ];

  const dotColor = (s: string) => (s === "done" ? RED : s === "in_progress" ? GOLD : "#C9C2B0");

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[55%_45%] gap-8">
        <Stagger>
          {[
            <div key="left">
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="flex items-center justify-center"
                  style={{ width: 40, height: 40, background: INK, borderRadius: 8 }}
                >
                  <Landmark size={20} color="#fff" />
                </div>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>Banking Intelligence</h1>
                  <p style={{ fontSize: 13, color: "#4A4540", lineHeight: 1.7 }}>
                    Multi-bank aggregation via RBI Account Aggregator
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span style={{ fontSize: 28, fontWeight: 700, color: RED, fontFamily: "ui-monospace, monospace", letterSpacing: "-0.02em" }}>
                    60%
                  </span>
                  <span className="uppercase" style={{ fontSize: 11, fontWeight: 500, color: "#5C5550", letterSpacing: "0.04em" }}>
                    build complete
                  </span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(23,18,8,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: "60%", background: RED }} />
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {milestones.map((m) => (
                  <li key={m.text} className="flex items-center gap-3">
                    <span
                      className="block rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        background: dotColor(m.status),
                        border: m.status === "upcoming" ? "1px solid #C9C2B0" : "none",
                      }}
                    />
                    <span className="flex-1" style={{ fontSize: 12, fontWeight: 500, color: INK }}>{m.text}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: m.status === "upcoming" ? "#9E9E9E" : GOLD }}>{m.date}</span>
                  </li>
                ))}
              </ul>

              <NotifyButton moduleId="banking" label="Notify me" />
            </div>,

            <div key="right">
              <div
                className="relative rounded-xl bg-white p-5"
                style={{ border: "0.5px solid rgba(23,18,8,0.08)" }}
              >
                <div className="mb-4" style={{ fontSize: 14, fontWeight: 600, color: INK }}>Bank Accounts</div>
                <div className="space-y-3">
                  {[
                    { name: "HDFC Bank", balance: "₹12.4L balance", action: "Connected", connected: true },
                    { name: "ICICI Bank", balance: "", action: "Connect →", connected: false },
                    { name: "SBI", balance: "", action: "Connect →", connected: false },
                  ].map((b) => (
                    <div
                      key={b.name}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                      style={{ borderColor: "rgba(23,18,8,0.06)" }}
                    >
                      <div className="flex items-center gap-2">
                        {b.connected && <span className="block w-2 h-2 rounded-full" style={{ background: "#1F5A46" }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{b.name}</span>
                        {b.balance && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>
                            {" · "}{b.balance}
                          </span>
                        )}
                      </div>
                      <span
                        style={{ fontSize: 12, fontWeight: 600, color: b.connected ? "#0E8F66" : RED }}
                      >
                        {b.action}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 mt-3 border-t" style={{ fontSize: 12, fontWeight: 500, borderColor: "rgba(23,18,8,0.06)", color: "#4A4540" }}>
                  Total cash position: <span style={{ fontSize: 20, fontWeight: 700, color: INK }}>₹12.4L</span>
                </div>

                {/* overlay */}
                <div
                  className="absolute inset-0 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(239,232,216,0.55)", backdropFilter: "blur(1px)" }}
                >
                  <span
                    className="uppercase px-3 py-1.5 rounded-full"
                    style={{ fontSize: 10, fontWeight: 600, background: INK, color: "#fff", letterSpacing: "0.08em" }}
                  >
                    Coming Q3 2026
                  </span>
                </div>
              </div>
            </div>,
          ]}
        </Stagger>
      </div>
    </PageShell>
  );
}

/* =================================================================
   PAGE 4 — CA Partner (Feature Preview Grid)
================================================================= */

export function CAPartnerComingSoon() {
  const features = [
    { Icon: LayoutDashboard, title: "CA dashboard", desc: "See all clients in one view, prioritised by risk" },
    { Icon: FileBarChart, title: "Auto reports", desc: "Monthly client reports auto-generated and delivered" },
    { Icon: IndianRupee, title: "Referral income", desc: "Earn commission for every client you bring to FynHelp" },
    { Icon: ShieldCheck, title: "White-label", desc: "Your firm's branding on every report and dashboard" },
  ];

  return (
    <PageShell>
      <div className="max-w-[600px] mx-auto">
        <Stagger>
          {[
            <div
              key="card"
              className="relative rounded-2xl bg-white p-7"
              style={{ border: "0.5px solid rgba(23,18,8,0.08)", boxShadow: "0 6px 24px rgba(23,18,8,0.04)" }}
            >
              <span
                className="absolute top-5 right-5 uppercase px-2.5 py-1 rounded-full"
                style={{ fontSize: 10, fontWeight: 600, background: `${GOLD}22`, color: GOLD, letterSpacing: "0.08em" }}
              >
                Launching Q3 2026
              </span>

              <div
                className="flex items-center justify-center mb-4"
                style={{ width: 40, height: 40, background: BEIGE, borderRadius: 10 }}
              >
                <Building2 size={20} color={RED} />
              </div>

              <h1 className="mb-2" style={{ fontSize: 22, fontWeight: 700, color: INK, letterSpacing: "-0.02em" }}>
                CA Partner Ecosystem
              </h1>
              <p className="mb-6" style={{ fontSize: 13, lineHeight: 1.7, color: "#4A4540" }}>
                A white-label CFO dashboard for chartered accountants managing 30+ clients — with
                built-in referral commissions.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-lg p-3"
                    style={{ background: BEIGE }}
                  >
                    <f.Icon size={16} color={RED} className="mb-2" />
                    <div className="mb-1" style={{ fontSize: 13, fontWeight: 600, color: INK }}>{f.title}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: "#5C5550" }}>{f.desc}</div>
                  </div>
                ))}
              </div>

              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5"
                style={{ borderTop: "1px solid rgba(23,18,8,0.08)" }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "#3D3530" }}>
                  Are you a CA? Join the early access program.
                </span>
                <NotifyButton moduleId="ca-partner" label="Join early access" variant="red" />
              </div>
            </div>,

            <p key="proof" className="text-center mt-4" style={{ fontSize: 12, fontWeight: 500, color: "#5C5550" }}>
              Join 40+ CAs already on the early access list
            </p>,
          ]}
        </Stagger>
      </div>
    </PageShell>
  );
}
