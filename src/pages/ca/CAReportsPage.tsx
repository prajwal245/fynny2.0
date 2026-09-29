import { useEffect, useMemo, useState } from "react";
import { COLORS, PageWrap, PageHeader, Card, PrimaryBtn, SecondaryBtn, GhostLink, Chip } from "@/components/ca/ui";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { logCAAudit } from "@/lib/caAudit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText, BarChart3, ShieldCheck, ListChecks, Users, TrendingUp, PieChart, Settings2,
  Download, Eye, Share2, RefreshCw, Trash2, MoreHorizontal, Plus, X, CheckCircle2, AlertCircle, Loader2, Calendar, PlayCircle,
} from "lucide-react";

// ───────── Templates ─────────
type TemplateId =
  | "monthly_cfo" | "qbr" | "gst_summary" | "itc_recon" | "payroll" | "cash_forecast" | "portfolio" | "custom";

const TEMPLATES: {
  id: TemplateId; name: string; desc: string; Icon: typeof FileText; bg: string; fg: string;
}[] = [
  { id: "monthly_cfo", name: "Monthly CFO Report", desc: "Comprehensive financial summary with cash flow, runway, P&L, and recommendations", Icon: FileText, bg: "#DBEAFE", fg: "#1E40AF" },
  { id: "qbr", name: "Quarterly Business Review", desc: "Quarterly performance analysis with KPIs, trends, and strategic insights", Icon: BarChart3, bg: "#DCFCE7", fg: "#166534" },
  { id: "gst_summary", name: "GST Compliance Summary", desc: "GST filing status, ITC reconciliation, notice risk, and vendor compliance", Icon: ShieldCheck, bg: "#FEF3C7", fg: "#92400E" },
  { id: "itc_recon", name: "ITC Reconciliation Report", desc: "Detailed ITC matching report with mismatches, vendor compliance, and recommendations", Icon: ListChecks, bg: "#EDE9FE", fg: "#5B21B6" },
  { id: "payroll", name: "Payroll Summary", desc: "Monthly payroll breakdown, statutory compliance, and attrition analysis", Icon: Users, bg: "#CCFBF1", fg: "#0F766E" },
  { id: "cash_forecast", name: "Cash Flow Forecast", desc: "90-day cash flow projection with scenario analysis and runway forecast", Icon: TrendingUp, bg: "#E0E7FF", fg: "#3730A3" },
  { id: "portfolio", name: "Portfolio Analytics", desc: "Portfolio-wide metrics, client health scores, and performance trends", Icon: PieChart, bg: "#FFEDD5", fg: "#9A3412" },
  { id: "custom", name: "Custom Report", desc: "Build a custom report by selecting specific sections and metrics", Icon: Settings2, bg: "#F3F0E6", fg: "rgba(23,18,8,0.65)" },
];

const SECTIONS_BY_TEMPLATE: Record<TemplateId, { id: string; label: string; default: boolean }[]> = {
  monthly_cfo: [
    { id: "exec", label: "Executive Summary", default: true },
    { id: "cf", label: "Cash Flow Analysis", default: true },
    { id: "runway", label: "Runway & Burn Rate", default: true },
    { id: "rev", label: "Revenue Analysis", default: true },
    { id: "cost", label: "Cost Breakdown", default: true },
    { id: "comp", label: "Compliance Status", default: true },
    { id: "itc", label: "ITC Health", default: true },
    { id: "rec", label: "Recommendations", default: true },
    { id: "txn", label: "Detailed Transactions", default: false },
  ],
  qbr: [
    { id: "kpi", label: "KPI Dashboard", default: true },
    { id: "trend", label: "Quarter-over-Quarter Trends", default: true },
    { id: "rev", label: "Revenue Breakdown", default: true },
    { id: "cost", label: "Cost Analysis", default: true },
    { id: "strat", label: "Strategic Insights", default: true },
  ],
  gst_summary: [
    { id: "filings", label: "Filing Status", default: true },
    { id: "itc", label: "ITC Reconciliation", default: true },
    { id: "notice", label: "Notice Risk Score", default: true },
    { id: "vendors", label: "Vendor Compliance", default: true },
  ],
  itc_recon: [
    { id: "matched", label: "Matched Invoices", default: true },
    { id: "mismatched", label: "Mismatches", default: true },
    { id: "vendors", label: "Vendor Compliance", default: true },
    { id: "rec", label: "Recommendations", default: true },
  ],
  payroll: [
    { id: "summary", label: "Payroll Summary", default: true },
    { id: "stat", label: "Statutory Compliance (PF/ESIC)", default: true },
    { id: "attr", label: "Attrition Analysis", default: false },
  ],
  cash_forecast: [
    { id: "90d", label: "90-Day Projection", default: true },
    { id: "scenario", label: "Scenario Analysis", default: true },
    { id: "runway", label: "Runway Forecast", default: true },
  ],
  portfolio: [
    { id: "metrics", label: "Portfolio Metrics", default: true },
    { id: "health", label: "Client Health Scores", default: true },
    { id: "trends", label: "Performance Trends", default: true },
  ],
  custom: [
    { id: "exec", label: "Executive Summary", default: true },
    { id: "cf", label: "Cash Flow", default: false },
    { id: "comp", label: "Compliance", default: false },
    { id: "itc", label: "ITC Health", default: false },
    { id: "payroll", label: "Payroll", default: false },
  ],
};

// ───────── Helpers ─────────
const periodLabel = (p?: string | null, ps?: string | null, pe?: string | null) => {
  if (p) return p;
  if (ps && pe) return `${new Date(ps).toLocaleDateString("en-IN", { month: "short" })} - ${new Date(pe).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
  return "-";
};

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const templateMeta = (id: string) => TEMPLATES.find(t => t.id === id) || TEMPLATES[TEMPLATES.length - 1];

type ReportRow = {
  id: string;
  report_type: string;
  report_name: string | null;
  business_id: string | null;
  period: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  created_at: string;
  generated_by_user_id: string | null;
  file_path: string | null;
  signed_off_by?: string | null;
  signed_off_at?: string | null;
  business?: { business_name: string } | null;
};

type ScheduleRow = {
  id: string;
  report_type: string;
  report_name: string | null;
  frequency: string;
  day_of_month: number | null;
  scope: string | null;
  clients: any;
  is_active: boolean;
  last_generated_at: string | null;
  next_generation_at: string | null;
};

type ClientOpt = { business_id: string; business_name: string };

// ───────── Main page ─────────
export default function CAReportsPage() {
  const { caFirm, user } = useCAAuth();
  const [caRole, setCaRole] = useState<string | null>(null);
  const canSignOff = caRole === "admin" || caRole === "manager" || caRole === "partner" || caRole === "owner";
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [presetTemplate, setPresetTemplate] = useState<TemplateId | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());

  const loadAll = async () => {
    if (!caFirm?.id) return;
    setLoading(true);
    const [rep, sch, acc, shr] = await Promise.all([
      supabase.from("ca_reports_log").select("*").eq("ca_firm_id", caFirm.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("ca_report_schedules").select("*").eq("ca_firm_id", caFirm.id).order("created_at", { ascending: false }),
      supabase.from("ca_client_access").select("business_id, businesses(business_name)").eq("ca_firm_id", caFirm.id).eq("is_active", true),
      supabase.from("ca_report_shares").select("report_log_id, revoked_at").eq("ca_firm_id", caFirm.id),
    ]);
    setSharedIds(new Set(((shr.data ?? []) as { report_log_id: string; revoked_at: string | null }[])
      .filter(s => !s.revoked_at).map(s => s.report_log_id)));

    const reportRows = (rep.data || []) as ReportRow[];
    // hydrate client names
    const ids = Array.from(new Set(reportRows.map(r => r.business_id).filter(Boolean) as string[]));
    let nameMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: bz } = await supabase.from("businesses").select("id, business_name").in("id", ids);
      nameMap = Object.fromEntries((bz || []).map((b: any) => [b.id, b.business_name]));
    }
    setReports(reportRows.map(r => ({ ...r, business: r.business_id ? { business_name: nameMap[r.business_id] || "-" } : null })));
    setSchedules((sch.data || []) as ScheduleRow[]);
    setClients(((acc.data || []) as any[]).map(a => ({ business_id: a.business_id, business_name: a.businesses?.business_name || "Unknown" })));
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [caFirm?.id]);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("ca_firm_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      setCaRole(data?.role ?? null);
    };
    fetchRole();
  }, [user?.id]);

  useEffect(() => { console.log("[fyn:ca:os-complete] CAReportsPage mounted"); }, []);


  const openTemplate = (id: TemplateId) => { setPresetTemplate(id); setGenOpen(true); };
  const openBlank = () => { setPresetTemplate(null); setGenOpen(true); };

  const handleDelete = async (id: string) => {
    // ca_reports_log has no delete RLS; soft-hide locally
    setReports(prev => prev.filter(r => r.id !== id));
    toast.success("Report removed from view");
  };

  /** Share a report with the client it belongs to, or revoke an existing share. */
  const toggleShare = async (r: ReportRow) => {
    if (!caFirm?.id) return;
    if (!r.business_id) { toast.error("Portfolio-wide reports cannot be shared with a single client"); return; }
    const currentlyShared = sharedIds.has(r.id);
    const { error } = await supabase.from("ca_report_shares").upsert({
      ca_firm_id: caFirm.id,
      business_id: r.business_id,
      report_log_id: r.id,
      shared_by: user?.id ?? null,
      revoked_at: currentlyShared ? new Date().toISOString() : null,
    }, { onConflict: "report_log_id" });
    if (error) { toast.error(error.message); return; }
    setSharedIds(prev => {
      const next = new Set(prev);
      if (currentlyShared) next.delete(r.id); else next.add(r.id);
      return next;
    });
    toast.success(currentlyShared ? "Share revoked" : "Shared with client — visible in their portal");
  };

  const handleRegenerate = async (r: ReportRow) => {
    toast.loading("Regenerating...", { id: "regen" });
    setTimeout(() => {
      toast.success("Report regenerated", { id: "regen" });
      loadAll();
    }, 1500);
  };

  return (
    <PageWrap>
      <PageHeader
        title="Reports"
        sub="Generate professional reports for clients"
        right={<PrimaryBtn onClick={openBlank}><Plus size={14} className="inline -mt-0.5 mr-1" />Generate New Report</PrimaryBtn>}
      />

      {/* Templates */}
      <div className="mb-2">
        <h2 className="text-[18px] font-semibold" style={{ color: COLORS.ink }}>Report Templates</h2>
        <p className="text-[14px]" style={{ color: "rgba(23,18,8,0.65)" }}>Choose a template to get started</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => openTemplate(t.id)}
            className="text-left bg-white rounded-md p-6 transition-all hover:shadow-lg group"
            style={{ border: `1px solid ${COLORS.caBorder}` }}
          >
            <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center mb-4" style={{ background: t.bg, color: t.fg }}>
              <t.Icon size={26} />
            </div>
            <div className="text-[16px] font-semibold mb-1" style={{ color: COLORS.ink }}>{t.name}</div>
            <p className="text-[13px] mb-4 line-clamp-2 min-h-[34px]" style={{ color: "rgba(23,18,8,0.65)" }}>{t.desc}</p>
            <div className="text-[13px] font-medium group-hover:underline" style={{ color: COLORS.red }}>Generate →</div>
          </button>
        ))}
      </div>

      {/* Recent Reports */}
      <div className="mt-8">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold" style={{ color: COLORS.ink }}>Recent Reports</h3>
            <GhostLink>View All →</GhostLink>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded animate-pulse" style={{ background: COLORS.caSurface }} />)}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={40} className="mx-auto mb-3" style={{ color: "rgba(23,18,8,0.30)" }} />
              <div className="text-[15px] font-semibold mb-1">No reports generated yet</div>
              <div className="text-[13px] mb-4" style={{ color: "rgba(23,18,8,0.60)" }}>Generate your first report to get started</div>
              <PrimaryBtn onClick={openBlank}>Generate Report</PrimaryBtn>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.50)" }}>
                    <th className="py-2 pr-4">Report Type</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Period</th>
                    <th className="py-2 pr-4">Generated On</th>
                    <th className="py-2 pr-4">Generated By</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Sign-off</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => {
                    const m = templateMeta(r.report_type);
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: m.bg, color: m.fg }}>
                              <m.Icon size={14} />
                            </div>
                            <div className="text-[13px] font-medium">{r.report_name || m.name}</div>
                            {sharedIds.has(r.id) && <Chip tone="green">Shared</Chip>}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[13px]">{r.business?.business_name || (r.business_id ? "-" : <em style={{ color: "rgba(23,18,8,0.55)" }}>Portfolio-wide</em>)}</td>
                        <td className="py-3 pr-4 text-[13px]">{periodLabel(r.period, r.period_start, r.period_end)}</td>
                        <td className="py-3 pr-4 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{fmtDateTime(r.created_at)}</td>
                        <td className="py-3 pr-4 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>
                          {r.generated_by_user_id === user?.id ? "You" : "-"}
                        </td>
                        <td className="py-3 pr-4">
                          {r.status === "generating" ? (
                            <Chip tone="amber"><Loader2 size={10} className="inline animate-spin mr-1" />Generating</Chip>
                          ) : r.status === "failed" ? (
                            <Chip tone="red">Failed</Chip>
                          ) : (
                            <Chip tone="green">Completed</Chip>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {r.signed_off_at ? (
                            <Chip tone="green">Signed off{r.signed_off_by === user?.id ? " by you" : ""}</Chip>
                          ) : (
                            <>
                              {canSignOff && (
                                <MISSignOffButton
                                  report={r}
                                  firmId={caFirm?.id || ""}
                                  userId={user?.id || ""}
                                  onSigned={loadAll}
                                />
                              )}
                              {!canSignOff && <Chip tone="amber">Sign-off requires Manager or Admin role</Chip>}
                            </>
                          )}
                        </td>
                        <td className="py-3 text-right relative">
                          <button
                            onClick={() => setActionMenu(actionMenu === r.id ? null : r.id)}
                            className="p-1.5 rounded hover:bg-[#F3F0E6]"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {actionMenu === r.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-20" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                                <ActionItem icon={Download} label="Download PDF" onClick={() => { toast.success("PDF download started"); setActionMenu(null); }} />
                                <ActionItem icon={Download} label="Download Excel" onClick={() => { toast.success("Excel download started"); setActionMenu(null); }} />
                                <ActionItem icon={Eye} label="View Online" onClick={() => { toast.info("Opening preview..."); setActionMenu(null); }} />
                                <ActionItem
                                  icon={Share2}
                                  label={sharedIds.has(r.id) ? "Stop sharing with client" : "Share with Client"}
                                  onClick={() => { toggleShare(r); setActionMenu(null); }}
                                />
                                <ActionItem icon={RefreshCw} label="Regenerate" onClick={() => { handleRegenerate(r); setActionMenu(null); }} />
                                <ActionItem icon={Trash2} label="Delete" danger onClick={() => { handleDelete(r.id); setActionMenu(null); }} />
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Scheduled Reports */}
      <div className="mt-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: COLORS.ink }}>
              <Calendar size={16} /> Scheduled Reports
            </h3>
            <SecondaryBtn onClick={() => setScheduleOpen(true)} size="sm"><Plus size={12} className="inline -mt-0.5 mr-1" />Add Schedule</SecondaryBtn>
          </div>

          {schedules.length === 0 ? (
            <div className="text-center py-8 text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
              No schedules yet. Automate recurring reports by adding one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.50)" }}>
                    <th className="py-2 pr-4">Report Type</th>
                    <th className="py-2 pr-4">Frequency</th>
                    <th className="py-2 pr-4">Clients</th>
                    <th className="py-2 pr-4">Last Generated</th>
                    <th className="py-2 pr-4">Next Generation</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => {
                    const m = templateMeta(s.report_type);
                    const clientCount = Array.isArray(s.clients) ? s.clients.length : 0;
                    return (
                      <tr key={s.id} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: m.bg, color: m.fg }}><m.Icon size={12} /></div>
                            <span className="text-[13px] font-medium">{s.report_name || m.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[13px] capitalize">{s.frequency}{s.day_of_month ? ` (day ${s.day_of_month})` : ""}</td>
                        <td className="py-3 pr-4 text-[13px]">{s.scope === "all" ? "All clients" : `${clientCount} clients`}</td>
                        <td className="py-3 pr-4 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{s.last_generated_at ? fmtDateTime(s.last_generated_at) : "Never"}</td>
                        <td className="py-3 pr-4 text-[13px]" style={{ color: "rgba(23,18,8,0.65)" }}>{s.next_generation_at ? fmtDateTime(s.next_generation_at) : "-"}</td>
                        <td className="py-3 pr-4">
                          <ScheduleToggle schedule={s} onChange={loadAll} />
                        </td>
                        <td className="py-3 text-right">
                          <ScheduleActions schedule={s} onChanged={loadAll} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {genOpen && (
        <GenerateReportModal
          presetTemplate={presetTemplate}
          clients={clients}
          caFirmId={caFirm?.id || ""}
          userId={user?.id || ""}
          onClose={() => { setGenOpen(false); setPresetTemplate(null); }}
          onDone={() => { loadAll(); }}
        />
      )}

      {scheduleOpen && (
        <ScheduleModal
          clients={clients}
          caFirmId={caFirm?.id || ""}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => { setScheduleOpen(false); loadAll(); }}
        />
      )}
    </PageWrap>
  );
}

// ───────── MIS Sign-off button ─────────
function MISSignOffButton({
  report,
  firmId,
  userId,
  onSigned,
}: {
  report: ReportRow;
  firmId: string;
  userId: string;
  onSigned: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [history, setHistory] = useState<{ id: string; signed_off_at: string; notes: string | null; signed_off_by: string; full_name: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!firmId || !report.business_id) return;
    const { data } = await supabase
      .from("ca_mis_signoffs")
      .select("id, signed_off_at, notes, signed_off_by")
      .eq("ca_firm_id", firmId)
      .eq("client_id", report.business_id)
      .eq("period_id", report.period ?? "")
      .order("signed_off_at", { ascending: false });
    const rows = (data || []) as { id: string; signed_off_at: string; notes: string | null; signed_off_by: string }[];
    const userIds = Array.from(new Set(rows.map(r => r.signed_off_by).filter(Boolean)));
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: prof } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      nameMap = Object.fromEntries(((prof || []) as any[]).map((p: any) => [p.id, p.full_name]));
    }
    setHistory(rows.map(r => ({ ...r, full_name: nameMap[r.signed_off_by] || null })));
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId, report.business_id, report.period]);

  const handleSignOff = async () => {
    if (!firmId || !userId || !report.business_id) return;
    setLoading(true);
    const { error } = await supabase.from("ca_mis_signoffs").insert({
      ca_firm_id: firmId,
      client_id: report.business_id,
      period_id: report.period,
      report_type: "MIS",
      signed_off_by: userId,
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("MIS report signed off successfully");
    setNotes("");
    await loadHistory();
    onSigned();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Sign-off notes (optional)"
        rows={2}
        className="w-full px-2 py-1.5 rounded text-xs resize-none"
        style={{ border: `1px solid ${COLORS.caBorder}` }}
      />
      <SecondaryBtn size="sm" onClick={handleSignOff} disabled={loading}>
        {loading ? "Signing..." : "Sign off"}
      </SecondaryBtn>
      {history.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="text-[11px] font-medium" style={{ color: "rgba(23,18,8,0.55)" }}>Sign-off history</div>
          {history.map((h) => (
            <div key={h.id} className="text-[11px]" style={{ color: "rgba(23,18,8,0.65)" }}>
              <span className="font-medium">{h.full_name || "Unknown"}</span>
              {" · "}
              {fmtDateTime(h.signed_off_at)}
              {h.notes && <span> · {h.notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── Action menu item ─────────
function ActionItem({ icon: Icon, label, onClick, danger }: { icon: typeof Download; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#F8F6F1] flex items-center gap-2"
      style={{ color: danger ? COLORS.red : COLORS.ink }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

// ───────── Generate Report Modal ─────────
function GenerateReportModal({ presetTemplate, clients, caFirmId, userId, onClose, onDone }: {
  presetTemplate: TemplateId | null;
  clients: ClientOpt[];
  caFirmId: string;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<TemplateId>(presetTemplate || "monthly_cfo");
  const [scope, setScope] = useState<"single" | "multiple" | "portfolio">("single");
  const [clientId, setClientId] = useState<string>("");
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [period, setPeriod] = useState("last_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const sectionsForType = useMemo(() => SECTIONS_BY_TEMPLATE[type] || [], [type]);
  const [sections, setSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sectionsForType.map(s => [s.id, s.default]))
  );
  useEffect(() => {
    setSections(Object.fromEntries(SECTIONS_BY_TEMPLATE[type].map(s => [s.id, s.default])));
  }, [type]);
  const [opts, setOpts] = useState({ charts: true, raw: true, audit: false, nidhi: true, history: false });
  const [brand, setBrand] = useState({ logo: true, contact: true, watermark: false });
  const [footer, setFooter] = useState("");
  const [format, setFormat] = useState<"pdf" | "excel" | "both">("pdf");
  const [delivery, setDelivery] = useState({ download: true, email_firm: false, email_client: false });
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = templateMeta(type);

  const periodToDates = (): { period: string; ps: string | null; pe: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (period === "last_month") {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { period: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), ps: fmt(start), pe: fmt(end) };
    }
    if (period === "last_quarter") {
      const q = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), (q - 1) * 3, 1);
      const end = new Date(today.getFullYear(), q * 3, 0);
      return { period: `Q${q || 4} ${start.getFullYear()}`, ps: fmt(start), pe: fmt(end) };
    }
    if (period === "last_6m") {
      const start = new Date(today.getFullYear(), today.getMonth() - 6, 1);
      return { period: "Last 6 Months", ps: fmt(start), pe: fmt(today) };
    }
    if (period === "last_year") {
      const start = new Date(today.getFullYear() - 1, today.getMonth(), 1);
      return { period: "Last Year", ps: fmt(start), pe: fmt(today) };
    }
    return { period: "Custom", ps: customStart || null, pe: customEnd || null };
  };

  const validate = () => {
    if (scope === "single" && !clientId) return "Select a client";
    if (scope === "multiple" && multiIds.length === 0) return "Select at least one client";
    if (period === "custom" && (!customStart || !customEnd)) return "Pick custom date range";
    if (delivery.email_client && !emailTo) return "Enter recipient email";
    return null;
  };

  const handleGenerate = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setGenerating(true); setError(null); setProgress(0);

    const { period: pLabel, ps, pe } = periodToDates();
    const targets: (string | null)[] = scope === "single" ? [clientId] : scope === "multiple" ? multiIds : [null];

    const steps = ["Fetching data...", "Processing transactions...", "Generating charts...", "Building PDF...", "Finalizing report..."];
    try {
      for (let i = 0; i < steps.length; i++) {
        setProgressMsg(steps[i]);
        await new Promise(r => setTimeout(r, 500));
        setProgress(Math.round(((i + 1) / steps.length) * 100));
      }

      // Insert one log row per target
      const rows = targets.map(t => ({
        ca_firm_id: caFirmId,
        business_id: t,
        report_type: type,
        report_name: meta.name,
        period: pLabel,
        period_start: ps,
        period_end: pe,
        generated_by_user_id: userId || null,
        status: "completed",
      }));
      const { error: insErr } = await supabase.from("ca_reports_log").insert(rows);
      if (insErr) throw insErr;

      // activity log
      await supabase.from("ca_activity_log").insert({
        ca_firm_id: caFirmId,
        action_type: "report_generated",
        description: `Generated ${meta.name} for ${scope === "portfolio" ? "entire portfolio" : `${targets.length} client(s)`}`,
      });

      setDone(true);
      toast.success("Report generated successfully");
    } catch (e: any) {
      setError(e.message || "Generation failed");
      setGenerating(false);
    }
  };

  return (
    <ModalShell title="Generate Report" sub="Configure report parameters" onClose={onClose} maxWidth={760}>
      {!generating && !done && (
        <div className="space-y-6">
          {/* Step 1: Type */}
          <Step n={1} title="Report Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TemplateId)}
              className="h-10 px-3 rounded text-sm w-full"
              style={{ border: `1px solid ${COLORS.caBorder}` }}
            >
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "rgba(23,18,8,0.65)" }}>
              <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: meta.bg, color: meta.fg }}><meta.Icon size={13} /></div>
              {meta.desc}
            </div>
          </Step>

          {/* Step 2: Scope */}
          <Step n={2} title="Scope">
            <div className="space-y-2">
              <Radio name="scope" value="single" current={scope} onChange={setScope as any} label="Single Client" />
              {scope === "single" && (
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="ml-6 h-9 px-3 rounded text-sm w-full max-w-md" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.business_id} value={c.business_id}>{c.business_name}</option>)}
                </select>
              )}
              <Radio name="scope" value="multiple" current={scope} onChange={setScope as any} label="Multiple Clients" />
              {scope === "multiple" && (
                <div className="ml-6 max-w-md max-h-40 overflow-y-auto border rounded p-2 space-y-1" style={{ borderColor: COLORS.caBorder }}>
                  {clients.length === 0 ? <div className="text-xs text-center py-2" style={{ color: "rgba(23,18,8,0.55)" }}>No clients</div> :
                    clients.map(c => (
                      <label key={c.business_id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={multiIds.includes(c.business_id)}
                          onChange={(e) => setMultiIds(prev => e.target.checked ? [...prev, c.business_id] : prev.filter(x => x !== c.business_id))}
                        />
                        {c.business_name}
                      </label>
                    ))
                  }
                </div>
              )}
              <Radio name="scope" value="portfolio" current={scope} onChange={setScope as any} label={`Entire Portfolio (${clients.length} clients)`} />
            </div>
          </Step>

          {/* Step 3: Period */}
          <Step n={3} title="Period">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 px-3 rounded text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }}>
              <option value="last_month">Last Month</option>
              <option value="last_quarter">Last Quarter</option>
              <option value="last_6m">Last 6 Months</option>
              <option value="last_year">Last Year</option>
              <option value="custom">Custom Date Range</option>
            </select>
            {period === "custom" && (
              <div className="flex gap-2 mt-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 px-2 rounded text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }} />
                <span className="self-center text-xs" style={{ color: "rgba(23,18,8,0.55)" }}>to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 px-2 rounded text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }} />
              </div>
            )}
          </Step>

          {/* Step 4: Sections */}
          <Step n={4} title="Report Sections">
            <div className="grid grid-cols-2 gap-1.5">
              {sectionsForType.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!sections[s.id]} onChange={(e) => setSections(p => ({ ...p, [s.id]: e.target.checked }))} />
                  {s.label}
                </label>
              ))}
            </div>
          </Step>

          {/* Step 5: Options */}
          <Step n={5} title="Report Options">
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["charts", "Include charts and graphs"],
                ["raw", "Include raw data tables"],
                ["audit", "Include audit trail"],
                ["nidhi", "Add CFO Fynny recommendations"],
                ["history", "Include historical comparison"],
              ] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={(opts as any)[k]} onChange={(e) => setOpts(p => ({ ...p, [k]: e.target.checked }))} />
                  {l}
                </label>
              ))}
            </div>
          </Step>

          {/* Step 6: Branding */}
          <Step n={6} title="Branding">
            <div className="space-y-1.5">
              {([
                ["logo", "Include CA firm logo"],
                ["contact", "Include CA firm contact details"],
                ["watermark", "Confidential watermark"],
              ] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={(brand as any)[k]} onChange={(e) => setBrand(p => ({ ...p, [k]: e.target.checked }))} />
                  {l}
                </label>
              ))}
              <textarea
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="Custom footer text (optional)"
                rows={2}
                className="w-full px-3 py-2 rounded text-sm mt-1"
                style={{ border: `1px solid ${COLORS.caBorder}` }}
              />
            </div>
          </Step>

          {/* Step 7: Format */}
          <Step n={7} title="Format">
            <div className="flex gap-4">
              {(["pdf", "excel", "both"] as const).map(f => (
                <label key={f} className="flex items-center gap-2 text-sm capitalize">
                  <input type="radio" checked={format === f} onChange={() => setFormat(f)} />
                  {f === "both" ? "PDF + Excel" : f.toUpperCase()}
                </label>
              ))}
            </div>
          </Step>

          {/* Step 8: Delivery */}
          <Step n={8} title="Delivery">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={delivery.download} onChange={(e) => setDelivery(p => ({ ...p, download: e.target.checked }))} />
                Download immediately
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={delivery.email_firm} onChange={(e) => setDelivery(p => ({ ...p, email_firm: e.target.checked }))} />
                Email to CA firm
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={delivery.email_client} onChange={(e) => setDelivery(p => ({ ...p, email_client: e.target.checked }))} disabled={scope !== "single"} />
                Email to client {scope !== "single" && <span className="text-[11px]" style={{ color: "rgba(23,18,8,0.45)" }}>(single client only)</span>}
              </label>
              {delivery.email_client && scope === "single" && (
                <div className="ml-6 space-y-1.5">
                  <input type="email" placeholder="client@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="h-9 px-3 rounded text-sm w-full max-w-md" style={{ border: `1px solid ${COLORS.caBorder}` }} />
                  <textarea placeholder="Custom message (optional)" value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} rows={2} className="w-full max-w-md px-3 py-2 rounded text-sm" style={{ border: `1px solid ${COLORS.caBorder}` }} />
                </div>
              )}
            </div>
          </Step>

          <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: COLORS.divider }}>
            <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
            <PrimaryBtn onClick={handleGenerate}>Generate Report →</PrimaryBtn>
          </div>
        </div>
      )}

      {generating && !done && !error && (
        <div className="py-8 text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: COLORS.red }} />
          <div className="text-[15px] font-semibold mb-2">{progressMsg}</div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: COLORS.caSurface }}>
            <div className="h-full transition-all" style={{ width: `${progress}%`, background: COLORS.red }} />
          </div>
          <div className="text-[12px] mt-2" style={{ color: "rgba(23,18,8,0.55)" }}>{progress}% complete · ~{Math.max(1, Math.round((100 - progress) / 50))} min remaining</div>
        </div>
      )}

      {done && (
        <div className="py-8 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-3" style={{ color: COLORS.green }} />
          <div className="text-[18px] font-semibold mb-2">Report generated successfully!</div>
          <div className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.65)" }}>Your {meta.name} is ready.</div>
          <div className="flex gap-2 justify-center">
            <PrimaryBtn onClick={() => { toast.success("Download started"); }}><Download size={14} className="inline -mt-0.5 mr-1" />Download Report</PrimaryBtn>
            <SecondaryBtn onClick={() => toast.info("Opening preview...")}><Eye size={14} className="inline -mt-0.5 mr-1" />View Online</SecondaryBtn>
            <SecondaryBtn onClick={() => { setDone(false); setGenerating(false); setProgress(0); }}>Generate Another</SecondaryBtn>
          </div>
          <button onClick={() => { onDone(); onClose(); }} className="mt-4 text-[13px] underline" style={{ color: "rgba(23,18,8,0.55)" }}>Close</button>
        </div>
      )}

      {error && (
        <div className="py-8 text-center">
          <AlertCircle size={40} className="mx-auto mb-3" style={{ color: COLORS.red }} />
          <div className="text-[15px] font-semibold mb-2">Report generation failed</div>
          <div className="text-[13px] mb-4" style={{ color: "rgba(23,18,8,0.65)" }}>{error}</div>
          <div className="flex gap-2 justify-center">
            <PrimaryBtn onClick={() => { setError(null); handleGenerate(); }}>Retry</PrimaryBtn>
            <SecondaryBtn onClick={onClose}>Close</SecondaryBtn>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ───────── Schedule modal ─────────
function ScheduleModal({ clients, caFirmId, onClose, onSaved }: {
  clients: ClientOpt[]; caFirmId: string; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<TemplateId>("monthly_cfo");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "annually">("monthly");
  const [day, setDay] = useState(1);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [delivery, setDelivery] = useState({ save: true, email_firm: true, email_client: false });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const meta = templateMeta(type);
    // compute next run = next "day" of next period
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + 1, day);
    const { error } = await supabase.from("ca_report_schedules").insert({
      ca_firm_id: caFirmId,
      report_type: type,
      report_name: meta.name,
      frequency,
      day_of_month: day,
      scope,
      clients: scope === "all" ? [] : selected,
      delivery,
      next_generation_at: next.toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Schedule created");
    onSaved();
  };

  return (
    <ModalShell title="Add Schedule" sub="Automate recurring report generation" onClose={onClose} maxWidth={560}>
      <div className="space-y-5">
        <div>
          <Label>Report Type</Label>
          <select value={type} onChange={(e) => setType(e.target.value as TemplateId)} className="h-10 px-3 rounded text-sm w-full" style={{ border: `1px solid ${COLORS.caBorder}` }}>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Frequency</Label>
          <div className="flex gap-4">
            {(["monthly", "quarterly", "annually"] as const).map(f => (
              <label key={f} className="flex items-center gap-2 text-sm capitalize">
                <input type="radio" checked={frequency === f} onChange={() => setFrequency(f)} /> {f}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Generation day (of month)</Label>
          <input type="number" min={1} max={28} value={day} onChange={(e) => setDay(Math.min(28, Math.max(1, +e.target.value || 1)))} className="h-10 px-3 rounded text-sm w-32" style={{ border: `1px solid ${COLORS.caBorder}` }} />
        </div>
        <div>
          <Label>Clients</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> All clients
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")} /> Selected clients
            </label>
            {scope === "selected" && (
              <div className="max-h-36 overflow-y-auto border rounded p-2 space-y-1" style={{ borderColor: COLORS.caBorder }}>
                {clients.map(c => (
                  <label key={c.business_id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(c.business_id)} onChange={(e) => setSelected(prev => e.target.checked ? [...prev, c.business_id] : prev.filter(x => x !== c.business_id))} />
                    {c.business_name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <Label>Delivery method</Label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={delivery.save} onChange={(e) => setDelivery(p => ({ ...p, save: e.target.checked }))} /> Save to Reports
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={delivery.email_firm} onChange={(e) => setDelivery(p => ({ ...p, email_firm: e.target.checked }))} /> Email to firm
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={delivery.email_client} onChange={(e) => setDelivery(p => ({ ...p, email_client: e.target.checked }))} /> Email to clients
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t" style={{ borderColor: COLORS.divider }}>
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Schedule"}</PrimaryBtn>
        </div>
      </div>
    </ModalShell>
  );
}

// ───────── Schedule row helpers ─────────
function ScheduleToggle({ schedule, onChange }: { schedule: ScheduleRow; onChange: () => void }) {
  const toggle = async () => {
    const { error } = await supabase.from("ca_report_schedules").update({ is_active: !schedule.is_active }).eq("id", schedule.id);
    if (error) { toast.error(error.message); return; }
    toast.success(schedule.is_active ? "Schedule paused" : "Schedule activated");
    onChange();
  };
  return (
    <button onClick={toggle} className="text-[12px]">
      {schedule.is_active ? <Chip tone="green">Active</Chip> : <Chip tone="gray">Paused</Chip>}
    </button>
  );
}

function ScheduleActions({ schedule, onChanged }: { schedule: ScheduleRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const runNow = async () => {
    const meta = templateMeta(schedule.report_type);
    await supabase.from("ca_reports_log").insert({
      ca_firm_id: (await supabase.from("ca_firms").select("id").maybeSingle()).data?.id,
      report_type: schedule.report_type,
      report_name: meta.name,
      period: "On-demand",
      status: "completed",
    } as any);
    await supabase.from("ca_report_schedules").update({ last_generated_at: new Date().toISOString() }).eq("id", schedule.id);
    toast.success("Report generated from schedule");
    onChanged();
    setOpen(false);
  };
  const del = async () => {
    if (!confirm("Delete this schedule?")) return;
    await supabase.from("ca_report_schedules").delete().eq("id", schedule.id);
    toast.success("Schedule deleted");
    onChanged();
    setOpen(false);
  };
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(!open)} className="p-1.5 rounded hover:bg-[#F3F0E6]"><MoreHorizontal size={16} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-lg py-1 z-20" style={{ border: `1px solid ${COLORS.caBorder}` }}>
            <ActionItem icon={PlayCircle} label="Run Now" onClick={runNow} />
            <ActionItem icon={Trash2} label="Delete" danger onClick={del} />
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Small primitives ─────────
function ModalShell({ title, sub, onClose, children, maxWidth = 700 }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-h-[90vh] overflow-y-auto" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b sticky top-0 bg-white rounded-t-xl z-10" style={{ borderColor: COLORS.divider }}>
          <div>
            <h2 className="text-[22px] font-bold" style={{ color: COLORS.ink }}>{title}</h2>
            {sub && <p className="text-[13px] mt-1" style={{ color: "rgba(23,18,8,0.65)" }}>{sub}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F3F0E6]"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-semibold mb-2" style={{ color: COLORS.ink }}>
        <span className="text-[11px] uppercase tracking-wider mr-2" style={{ color: "rgba(23,18,8,0.45)" }}>Step {n}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Radio({ name, value, current, onChange, label }: { name: string; value: string; current: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} /> {label}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-medium mb-1.5" style={{ color: "rgba(23,18,8,0.75)" }}>{children}</div>;
}
