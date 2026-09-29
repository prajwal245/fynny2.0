import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { useGeneratedReports, useGenerateReport } from "@/hooks/dashboard/useReports";
import { IntelligenceProvider, DEMO_BIZ, type IntelligenceMode } from "@/components/intelligence/DataSource";
import { IntelPage, IntelCard, ACCENT } from "@/components/intelligence/_primitives";
import DashboardLayout from "@/components/DashboardLayout";

import { toast } from "sonner";
import {
  TrendingUp, Droplets, Flame, FileText, ArrowLeftRight, IndianRupee,
  Users, BarChart3, Download, Loader2, Receipt, Calculator, Building,
  FileBarChart, Shield, User, ShoppingCart, Rocket, PieChart, Target, X, BookOpen,
} from "lucide-react";

type ReportDef = {
  type: string;
  name: string;
  dbName: string;
  Icon: typeof TrendingUp;
  description: string;
  buttonLabel?: string;
  badge?: "govt" | "companies";
  formats?: Array<"excel" | "pdf" | "json" | "csv">;
};

type Category = { title: string; reports: ReportDef[] };

const CATEGORIES: Category[] = [
  {
    title: "Financial Reports",
    reports: [
      { type: "profit_loss",   name: "Profit & Loss",       dbName: "Profit & Loss Statement",     Icon: TrendingUp,    description: "Monthly revenue, expenses and net profit breakdown" },
      { type: "cash_flow",     name: "Cash Flow",           dbName: "Cash Flow Report",            Icon: Droplets,      description: "Cash inflows, outflows and 13-week forecast" },
      { type: "burn_rate",     name: "Burn Rate",           dbName: "Burn Rate Report",            Icon: Flame,         description: "Monthly burn trend, runway projection and scenarios" },
      { type: "gst_summary",   name: "GST Summary",         dbName: "GST Summary Report",          Icon: FileText,      description: "GSTR filing status, ITC reconciliation and net payable" },
      { type: "receivables",   name: "Receivables",         dbName: "Accounts Receivable Report", Icon: ArrowLeftRight, description: "Outstanding invoices, aging analysis and overdue customers" },
      { type: "vendor_spend",  name: "Vendor Spend",        dbName: "Vendor Spend Report",         Icon: IndianRupee,   description: "Top vendor analysis, category breakdown and optimization" },
      { type: "employee_cost", name: "Employee Cost",       dbName: "Employee Cost Report",        Icon: Users,         description: "Payroll summary, department costs and CTC breakdown" },
      { type: "board_pack",    name: "Investor Board Pack", dbName: "Investor Board Pack",         Icon: BarChart3,     description: "Investor-ready KPIs: MRR, ARR, burn, runway, NRR" },
    ],
  },
  {
    title: "Statutory & Tax Reports",
    reports: [
      { type: "gstr1",              name: "GSTR-1 Report",              dbName: "GSTR-1 — Outward Supplies",  Icon: FileText,       description: "Outward supplies statement in GST portal upload format (JSON + Excel)", buttonLabel: "Generate GSTR-1",       badge: "govt",      formats: ["pdf","excel","json","csv"] },
      { type: "gstr3b",             name: "GSTR-3B Report",             dbName: "GSTR-3B — Monthly Return",   Icon: FileText,       description: "Monthly GST return with ITC reconciliation in govt prescribed format",      buttonLabel: "Generate GSTR-3B",      badge: "govt",      formats: ["pdf","excel","json","csv"] },
      { type: "gstr9",              name: "GSTR-9 Annual Return",       dbName: "GSTR-9 — Annual Return",     Icon: FileText,       description: "Annual GST return consolidating all monthly filings for the FY",            buttonLabel: "Generate GSTR-9",       badge: "govt",      formats: ["pdf","excel","json","csv"] },
      { type: "tds_return",         name: "TDS Return (26Q/24Q)",       dbName: "TDS Return (26Q/24Q)",       Icon: Receipt,        description: "Quarterly TDS return for contractor payments (26Q) and salary (24Q)",       buttonLabel: "Generate TDS Return",   badge: "govt",      formats: ["pdf","excel"] },
      { type: "form26as",           name: "Form 26AS Reconciliation",   dbName: "Form 26AS Reconciliation",   Icon: ArrowLeftRight, description: "Tax credit statement matching TDS deducted vs deposited vs 26AS",           buttonLabel: "Generate Report" },
      { type: "advance_tax",        name: "Advance Tax Computation",    dbName: "Advance Tax Computation",    Icon: Calculator,     description: "Quarterly advance tax liability with Section 234B/234C interest calculator",  buttonLabel: "Generate Report" },
      { type: "balance_sheet_sch3", name: "Balance Sheet (Schedule III)",dbName: "Balance Sheet (Schedule III)",Icon: Building,     description: "Balance sheet in Companies Act 2013 Schedule III format for statutory filing", buttonLabel: "Generate Balance Sheet", badge: "companies", formats: ["pdf","excel"] },
      { type: "pnl_sch3",           name: "P&L Statement (Schedule III)",dbName: "P&L Statement (Schedule III)",Icon: TrendingUp,   description: "Profit & Loss in Companies Act 2013 format with revenue from operations, EBITDA", buttonLabel: "Generate P&L",        badge: "companies", formats: ["pdf","excel"] },
      { type: "mis_report",         name: "MIS Report",                 dbName: "MIS Report",                 Icon: FileBarChart,   description: "Monthly Management Information System summary — all key metrics in one page", buttonLabel: "Generate MIS" },
    ],
  },
  {
    title: "Operational Reports",
    reports: [
      { type: "payroll_register",   name: "Payroll Register",           dbName: "Payroll Register",           Icon: Users,          description: "Salary register with gross, deductions (PF/ESI/TDS), net pay per employee", buttonLabel: "Generate Payroll Register", badge: "govt", formats: ["pdf","excel"] },
      { type: "epf_esic",           name: "EPF/ESIC Challan Report",    dbName: "EPF/ESIC Challan Report",    Icon: Shield,         description: "Monthly PF and ESI contribution register for portal filing",                buttonLabel: "Generate Challan",          badge: "govt", formats: ["pdf","excel"] },
      { type: "vendor_payment",     name: "Vendor Payment Report",      dbName: "Vendor Payment Report",      Icon: ArrowLeftRight, description: "All vendor payments due, overdue, and paid this month with ageing",         buttonLabel: "Generate Report" },
      { type: "customer_statement", name: "Customer Statement",         dbName: "Customer Statement",         Icon: User,           description: "Individual customer ledger with all invoices, payments and outstanding balance", buttonLabel: "Generate Statement" },
      { type: "sales_register",     name: "Sales Register",             dbName: "Sales Register",             Icon: FileText,       description: "Invoice-wise outward sales with GST breakup (CGST/SGST/IGST) — CA ready",    buttonLabel: "Generate Sales Register",   badge: "govt", formats: ["pdf","excel"] },
      { type: "purchase_register",  name: "Purchase Register",          dbName: "Purchase Register",          Icon: ShoppingCart,   description: "Bill-wise inward purchases with ITC breakup — matches GSTR-2A format",       buttonLabel: "Generate Purchase Register",badge: "govt", formats: ["pdf","excel"] },
      { type: "budget_vs_actual",   name: "Budget vs Actual",           dbName: "Budget vs Actual",           Icon: BarChart3,      description: "Department-wise budget vs actual variance report for board review",          buttonLabel: "Generate Report" },
    ],
  },
  {
    title: "Investor & Board Reports",
    reports: [
      { type: "investor_update",  name: "Investor Update Pack",        dbName: "Investor Update Pack",        Icon: Rocket,       description: "Monthly investor update — MRR, burn, runway, NRR, wins, risks, asks",       buttonLabel: "Generate Investor Update" },
      { type: "unit_economics",   name: "Unit Economics Report",       dbName: "Unit Economics Report",       Icon: PieChart,     description: "Full unit economics — CAC by channel, LTV, payback period, cohort analysis", buttonLabel: "Generate Report" },
      { type: "dpiit_report",     name: "Startup India / DPIIT Report",dbName: "Startup India / DPIIT Report",Icon: Target,       description: "DPIIT recognition compliance report + startup metrics for grant applications", buttonLabel: "Generate Report" },
      { type: "working_capital",  name: "Working Capital Report",      dbName: "Working Capital Report",      Icon: FileBarChart, description: "CCC analysis — DSO, DIO, DPO trends with working capital optimization plan", buttonLabel: "Generate Report" },
    ],
  },
];

const MONTHLY_TYPES = new Set(["gstr1","gstr3b","payroll_register","sales_register","purchase_register"]);
const FORMAT_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  pdf:   { bg: "rgba(169,56,56,0.08)", fg: "#A93838" },
  excel: { bg: "rgba(16,185,129,0.10)", fg: "#0B7A52" },
  json:  { bg: "rgba(139,105,20,0.10)", fg: "#8B6914" },
  csv:   { bg: "rgba(23,18,8,0.06)",    fg: "#171208" },
};


const GOLD_BG = "#FAEEDA";
const GOLD_FG = "#633806";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function GovtBadge({ kind }: { kind: "govt" | "companies" }) {
  return (
    <span
      style={{
        fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
        background: GOLD_BG, color: GOLD_FG,
        padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {kind === "govt" ? "Govt Format" : "Companies Act"}
    </span>
  );
}

function ReportCard({
  r, pending, onClick,
}: {
  r: ReportDef;
  pending: boolean;
  onClick: () => void;
}) {
  const Icon = r.Icon;
  return (
    <div
      className="fyn-report-card"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(23,18,8,0.06)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(23,18,8,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(169,56,56,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: ACCENT.red,
        }}
      >
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: ACCENT.ink }}>{r.name}</div>
        {r.badge && <GovtBadge kind={r.badge} />}
      </div>
      <div style={{ fontSize: 11, color: "rgba(23,18,8,0.62)", lineHeight: 1.4, flex: 1 }}>{r.description}</div>
      <button
        onClick={onClick}
        disabled={pending}
        style={{
          background: ACCENT.red, color: "#FFFFFF",
          borderRadius: 6, padding: "6px 10px",
          fontSize: 11, fontWeight: 500,
          width: "100%", border: "none",
          cursor: pending ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          opacity: pending ? 0.7 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {pending ? "Generating..." : (r.buttonLabel ?? "Generate PDF")}
      </button>
    </div>
  );
}

function CategoryHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: ACCENT.ink, fontFamily: "'Space Grotesk', sans-serif", margin: 0, whiteSpace: "nowrap" }}>
        {title}
      </h2>
      <div style={{ flex: 1, height: 1, background: ACCENT.red, opacity: 0.5 }} />
    </div>
  );
}

const FORMAT_LABELS: Record<string, string> = {
  excel: "Excel (.xlsx) — For internal review and editing",
  pdf:   "PDF — For sharing and printing",
  json:  "JSON — For direct GST portal upload",
  csv:   "CSV — For accounting software import",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function GenerateModal({
  report, onClose, onGenerate,
}: {
  report: ReportDef;
  onClose: () => void;
  onGenerate: (params: { format: string; fy: string; month?: string }) => Promise<void>;
}) {
  const formats = report.formats ?? ["pdf","excel"];
  const [format, setFormat] = useState<string>(formats.includes("pdf" as any) ? "pdf" : formats[0]);
  const [fy, setFy] = useState("FY 2026-27");
  const CAL = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const prevMonth = CAL[(now.getMonth() + 11) % 12];

  const [month, setMonth] = useState(prevMonth);
  const [busy, setBusy] = useState(false);

  const needsMonth = MONTHLY_TYPES.has(report.type);

  const submit = async () => {
    setBusy(true);
    await onGenerate({ format, fy, month: needsMonth ? month : undefined });
    setBusy(false);
    onClose();
  };


  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(23,18,8,0.5)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 460,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: ACCENT.ink, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
            Generate {report.name}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(23,18,8,0.62)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        {report.badge && <div style={{ marginBottom: 16 }}><GovtBadge kind={report.badge} /></div>}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: ACCENT.red, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Format
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {formats.map((f) => (
              <label key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: ACCENT.ink, cursor: "pointer" }}>
                <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} />
                {FORMAT_LABELS[f]}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: needsMonth ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: ACCENT.red, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              Financial Year
            </div>
            <select value={fy} onChange={(e) => setFy(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(23,18,8,0.15)", background: "#FFF", color: ACCENT.ink }}>
              <option>FY 2026-27</option>
              <option>FY 2025-26</option>
              <option>FY 2024-25</option>

            </select>
          </div>
          {needsMonth && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: ACCENT.red, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                Month
              </div>
              <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(23,18,8,0.15)", background: "#FFF", color: ACCENT.ink }}>
                {MONTHS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={busy}
          style={{
            background: ACCENT.red, color: "#FFFFFF",
            border: "none", borderRadius: 8,
            padding: "10px 14px", fontSize: 13, fontWeight: 500,
            width: "100%", cursor: busy ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy ? "Generating..." : "Generate & Download"}
        </button>
      </div>
    </div>
  );
}


function ReportsContent({ mode }: { mode: IntelligenceMode }) {
  const navigate = useNavigate();
  const { businessId: liveBiz, profile, user } = useAuth() as any;
  const businessId = mode === "demo" ? DEMO_BIZ : liveBiz;
  const userName =
    mode === "demo"
      ? "Tarun"
      : profile?.full_name || user?.email || "User";
  const { data: reports = [], isLoading } = useGeneratedReports(businessId);
  const generate = useGenerateReport(businessId);
  const [pending, setPending] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [modalReport, setModalReport] = useState<ReportDef | null>(null);

  const runGenerate = async (
    r: ReportDef,
    params?: { format?: string; fy?: string; month?: string },
  ) => {
    if (!businessId) {
      toast.error("Please sign in to generate reports");
      return;
    }
    const format = params?.format ?? "pdf";
    const fy = params?.fy ?? "FY 2025-26";
    const month = params?.month;
    // Build full report name with period for govt-format reports
    const reportName = r.badge
      ? `${r.dbName}${month ? ` — ${month} ${fy}` : ` — ${fy}`}`
      : r.dbName;
    const parameters: Record<string, unknown> = { format, period: fy };
    if (month) parameters.month = month;

    setPending(r.type);
    const tId = toast.loading(`Generating ${reportName} as ${format.toUpperCase()}...`);
    try {
      await generate.mutateAsync({
        report_type: r.type,
        report_name: reportName,
        generated_by: userName,
        parameters,
      });
      toast.success("Ready — downloading", { id: tId });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate report", { id: tId });
    } finally {
      setPending(null);
    }
  };


  const handleClick = (r: ReportDef) => {
    if (r.badge) {
      setModalReport(r);
    } else {
      runGenerate(r);
    }
  };

  const handleDownload = (r: { id: string; report_name: string; file_url?: string | null }) => {
    if (r.file_url) {
      window.open(r.file_url, "_blank");
      toast.success(`Opening ${r.report_name}`);
    } else {
      toast.info("This report has not been generated yet. Click Generate to create it.");
    }
  };


  return (
    <IntelPage>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: ACCENT.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
            CFO Reports
          </h1>
          <p style={{ fontSize: 13, color: "rgba(23,18,8,0.62)", marginTop: 4 }}>
            Generate and download financial reports for your business
          </p>
        </div>
        <button
          onClick={() => navigate("/dashboard/reports/books")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 16px", fontSize: 13, fontWeight: 500,
            background: ACCENT.red, color: "#FFFFFF",
            border: "none", borderRadius: 6, cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap",
          }}
        >
          <BookOpen size={14} />
          Books of Accounts
        </button>
      </header>

      {CATEGORIES.map((cat) => (
        <section key={cat.title}>
          <CategoryHeader title={cat.title} />
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {cat.reports.map((r) => (
              <ReportCard
                key={r.type}
                r={r}
                pending={pending === r.type}
                onClick={() => handleClick(r)}
              />
            ))}
          </div>
        </section>
      ))}

      <IntelCard title="Recent reports">
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 36, borderRadius: 6,
                  background: "linear-gradient(90deg, rgba(23,18,8,0.04), rgba(23,18,8,0.08), rgba(23,18,8,0.04))",
                  backgroundSize: "200% 100%",
                  animation: "fyn-shimmer 1.4s ease-in-out infinite",
                }}
              />
            ))}
            <style>{`@keyframes fyn-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: "rgba(23,18,8,0.62)", textAlign: "center" }}>
            No reports generated yet. Generate your first report above.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Report name", "Generated on", "Generated by", "Format", "Download"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        fontSize: 10,
                        textTransform: "uppercase",
                        color: ACCENT.red,
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                        padding: "10px 12px",
                        borderBottom: "1px solid rgba(23,18,8,0.06)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const fmt = String((r.parameters as any)?.format ?? "pdf").toLowerCase();
                  const c = FORMAT_BADGE_COLORS[fmt] ?? FORMAT_BADGE_COLORS.pdf;
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "10px 12px", borderBottom: "0.5px solid rgba(23,18,8,0.06)", color: ACCENT.ink, fontWeight: 500 }}>
                        {r.report_name}
                        {r.status === "generating" && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: ACCENT.gold, fontStyle: "italic" }}>
                            generating…
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "0.5px solid rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.62)" }}>
                        {formatDate(r.generated_at)}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "0.5px solid rgba(23,18,8,0.06)", color: "rgba(23,18,8,0.62)" }}>
                        {r.generated_by || "—"}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "0.5px solid rgba(23,18,8,0.06)" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                          background: c.bg, color: c.fg,
                          padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                        }}>{fmt}</span>
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "0.5px solid rgba(23,18,8,0.06)" }}>
                        <button
                          onClick={() => handleDownload(r)}
                          disabled={r.status !== "completed" || downloading === r.id}
                          aria-label={`Download ${r.report_name}`}
                          style={{
                            background: "transparent",
                            border: `1px solid ${ACCENT.red}`,
                            borderRadius: 6,
                            padding: "4px 8px",
                            color: ACCENT.red,
                            cursor: r.status === "completed" ? "pointer" : "not-allowed",
                            opacity: r.status === "completed" ? 1 : 0.4,
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 11,
                          }}
                        >
                          {downloading === r.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </IntelCard>

      {modalReport && (
        <GenerateModal
          report={modalReport}
          onClose={() => setModalReport(null)}
          onGenerate={(params) => runGenerate(modalReport, params)}
        />
      )}
    </IntelPage>
  );
}

export default function ReportsPage({ mode = "live" }: { mode?: IntelligenceMode }) {
  const content = (
    <IntelligenceProvider mode={mode}>
      <ReportsContent mode={mode} />
    </IntelligenceProvider>
  );
  return <DashboardLayout>{content}</DashboardLayout>;
}
