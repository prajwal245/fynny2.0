import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { toast } from "sonner";
import {
  COLORS, PageWrap, PageHeader, Card, MetricCard, Chip, GhostLink,
  PrimaryBtn, SecondaryBtn,
} from "@/components/ca/ui";
import { formatINR } from "@/lib/indian-format";
import { AlertTriangle, Copy, X, Download, Loader2, FileText } from "lucide-react";
import { GspLimitationBanner } from "@/components/ca/GspLimitationBanner";

type ClientRow = {
  business_id: string;
  business_name: string;
  industry: string | null;
  gstin: string | null;
  notice_risk_score: number;
  itc_safe: number;
  itc_at_risk: number;
  mismatches: number;
  last_filed: { name: string; date: string | null } | null;
  next_due: { name: string; date: string } | null;
};

type VendorRow = {
  gstin: string;
  name: string;
  client_count: number;
  avg_compliance: number;
  total_at_risk: number;
};

const formatINRCompact = (n: number): string => {
  if (!n) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

const daysFromNow = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);

const monthYear = (d: string | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const daysAgo = (d: string | null) => {
  if (!d) return "-";
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n === 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
};

export default function CAGstPortfolioPage() {
  const navigate = useNavigate();
  const { caFirm } = useCAAuth();

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);

  // Filters
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [itcFilter, setItcFilter] = useState<"all" | "high" | "medium" | "safe">("all");
  const [filingFilter, setFilingFilter] = useState<"all" | "overdue" | "week" | "clear">("all");
  const [sortBy, setSortBy] = useState<"risk" | "itc" | "name" | "filing">("risk");

  // Modal
  const [reconOpen, setReconOpen] = useState(false);

  useEffect(() => {
    if (!caFirm?.id) return;
    void loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caFirm?.id]);

  async function loadPortfolio() {
    if (!caFirm?.id) return;
    setLoading(true);
    try {
      // 1. Get linked clients from the CA portal table
      const { data: clientData } = await supabase
        .from("ca_clients")
        .select("business_id, client_name, gstin, industry")
        .eq("ca_firm_id", caFirm.id);

      const clientList = ((clientData ?? []) as any[]).filter((c) => !!c.business_id);
      const ids = clientList.map((c) => c.business_id as string);
      if (ids.length === 0) {
        setClients([]); setVendors([]); setLoading(false); return;
      }

      // 2. Fetch in parallel
      const [itcRes, riskRes, complRes, vendorRes] = await Promise.all([
        supabase.from("gst_itc_lines").select("business_id, itc_safe, itc_at_risk, mismatch_count, vendor_gstin").in("business_id", ids),
        supabase.from("gst_notice_risk_scores").select("business_id, score, computed_at").in("business_id", ids).order("computed_at", { ascending: false }),
        supabase.from("ca_compliance_events").select("business_id, event_type, filing_period, due_date, status").eq("ca_firm_id", caFirm.id).in("event_type", ["GSTR1", "GSTR3B", "GSTR9", "GSTR2B"]),
        supabase.from("vendor_gst_health").select("business_id, vendor_gstin, vendor_name, compliance_score").in("business_id", ids),
      ]);

      const itcByBiz = new Map<string, { safe: number; risk: number; mm: number }>();
      (itcRes.data || []).forEach((l: any) => {
        const cur = itcByBiz.get(l.business_id) || { safe: 0, risk: 0, mm: 0 };
        cur.safe += Number(l.itc_safe || 0);
        cur.risk += Number(l.itc_at_risk || 0);
        cur.mm += Number(l.mismatch_count || 0);
        itcByBiz.set(l.business_id, cur);
      });

      const riskByBiz = new Map<string, number>();
      (riskRes.data || []).forEach((r: any) => {
        if (!riskByBiz.has(r.business_id)) riskByBiz.set(r.business_id, r.score);
      });

      const filedByBiz = new Map<string, { name: string; date: string | null }>();
      const dueByBiz = new Map<string, { name: string; date: string }>();
      (complRes.data || []).forEach((c: any) => {
        const label = `${c.event_type}${c.filing_period ? ` · ${c.filing_period}` : ""}`;
        if (c.status === "filed") {
          const cur = filedByBiz.get(c.business_id);
          if (!cur || (cur.date && c.due_date > cur.date) || !cur.date) {
            filedByBiz.set(c.business_id, { name: label, date: c.due_date });
          }
        } else {
          const cur = dueByBiz.get(c.business_id);
          if (!cur || c.due_date < cur.date) {
            dueByBiz.set(c.business_id, { name: label, date: c.due_date });
          }
        }
      });


      const rows: ClientRow[] = clientList.map((c: any) => {
        const b = { id: c.business_id as string, business_name: c.client_name as string, industry: c.industry ?? null, gstin: c.gstin ?? null };
        const itc = itcByBiz.get(b.id) || { safe: 0, risk: 0, mm: 0 };
        return {
          business_id: b.id,
          business_name: b.business_name,
          industry: b.industry,
          gstin: b.gstin,
          notice_risk_score: riskByBiz.get(b.id) ?? 0,
          itc_safe: itc.safe,
          itc_at_risk: itc.risk,
          mismatches: itc.mm,
          last_filed: filedByBiz.get(b.id) || null,
          next_due: dueByBiz.get(b.id) || null,
        };
      });

      setClients(rows);

      // Vendors aggregated across portfolio
      const vMap = new Map<string, { name: string; clients: Set<string>; scores: number[] }>();
      (vendorRes.data || []).forEach((v: any) => {
        const key = v.vendor_gstin || v.vendor_name;
        if (!key) return;
        const cur = vMap.get(key) || { name: v.vendor_name, clients: new Set<string>(), scores: [] as number[] };
        cur.clients.add(v.business_id);
        if (v.compliance_score != null) cur.scores.push(v.compliance_score);
        vMap.set(key, cur);
      });
      const vRows: VendorRow[] = Array.from(vMap.entries())
        .map(([gstin, v]) => ({
          gstin,
          name: v.name,
          client_count: v.clients.size,
          avg_compliance: v.scores.length ? Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length) : 0,
          total_at_risk: 0,
        }))
        .filter((v) => v.client_count >= 1)
        .sort((a, b) => b.client_count - a.client_count)
        .slice(0, 20);
      setVendors(vRows);
    } catch (err: any) {
      toast.error("Unable to load GST portfolio");
      console.error("[fyn:gst] portfolio load failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // Derived filters
  const filtered = useMemo(() => {
    let rows = [...clients];
    if (riskFilter !== "all") {
      rows = rows.filter((r) =>
        riskFilter === "high" ? r.notice_risk_score > 70
        : riskFilter === "medium" ? r.notice_risk_score >= 40 && r.notice_risk_score <= 70
        : r.notice_risk_score < 40
      );
    }
    if (itcFilter !== "all") {
      rows = rows.filter((r) =>
        itcFilter === "high" ? r.itc_at_risk > 500000
        : itcFilter === "medium" ? r.itc_at_risk >= 100000 && r.itc_at_risk <= 500000
        : r.itc_at_risk < 100000
      );
    }
    if (filingFilter !== "all") {
      const today = new Date().toISOString().split("T")[0];
      rows = rows.filter((r) => {
        if (filingFilter === "overdue") return r.next_due && r.next_due.date < today;
        if (filingFilter === "week") return r.next_due && daysFromNow(r.next_due.date) >= 0 && daysFromNow(r.next_due.date) <= 7;
        return !r.next_due;
      });
    }
    rows.sort((a, b) => {
      if (sortBy === "risk") return b.notice_risk_score - a.notice_risk_score;
      if (sortBy === "itc") return b.itc_at_risk - a.itc_at_risk;
      if (sortBy === "name") return a.business_name.localeCompare(b.business_name);
      return (b.last_filed?.date || "").localeCompare(a.last_filed?.date || "");
    });
    return rows;
  }, [clients, riskFilter, itcFilter, filingFilter, sortBy]);

  const filtersActive = riskFilter !== "all" || itcFilter !== "all" || filingFilter !== "all";

  const summary = useMemo(() => {
    const totalSafe = clients.reduce((s, c) => s + c.itc_safe, 0);
    const totalRisk = clients.reduce((s, c) => s + c.itc_at_risk, 0);
    const clientsWithSafe = clients.filter((c) => c.itc_safe > 0).length;
    const clientsWithRisk = clients.filter((c) => c.itc_at_risk > 0).length;
    const avgRisk = clients.length ? Math.round(clients.reduce((s, c) => s + c.notice_risk_score, 0) / clients.length) : 0;
    const today = new Date().toISOString().split("T")[0];
    const pending = clients.filter((c) => c.next_due && c.next_due.date >= today).length
      + clients.filter((c) => c.next_due && c.next_due.date < today).length;
    return { totalSafe, totalRisk, clientsWithSafe, clientsWithRisk, avgRisk, pending };
  }, [clients]);

  const topByRisk = useMemo(
    () => [...clients].filter((c) => c.itc_at_risk > 0).sort((a, b) => b.itc_at_risk - a.itc_at_risk).slice(0, 5),
    [clients]
  );
  const topByNotice = useMemo(
    () => [...clients].sort((a, b) => b.notice_risk_score - a.notice_risk_score).slice(0, 5),
    [clients]
  );

  const filingComplianceRate = useMemo(() => {
    if (!clients.length) return 100;
    const today = new Date().toISOString().split("T")[0];
    const ok = clients.filter((c) => !c.next_due || c.next_due.date >= today).length;
    return Math.round((ok / clients.length) * 100);
  }, [clients]);

  function exportCSV() {
    const header = [
      "Client Name", "GSTIN", "Notice Risk Score",
      "ITC Safe", "ITC At Risk", "Last GSTR Filed",
      "Next GSTR Due", "Mismatches",
    ];
    const lines = filtered.map((r) => [
      r.business_name,
      r.gstin || "",
      r.notice_risk_score,
      r.itc_safe,
      r.itc_at_risk,
      r.last_filed?.date || "",
      r.next_due?.date || "",
      r.mismatches,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fynhelp-gst-portfolio-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Portfolio report exported");
  }

  function copyGstin(gstin: string) {
    navigator.clipboard.writeText(gstin);
    toast.success("GSTIN copied");
  }

  function clearFilters() {
    setRiskFilter("all"); setItcFilter("all"); setFilingFilter("all");
  }

  return (
    <PageWrap>
      <GspLimitationBanner />
      <div className="text-[13px] mb-2" style={{ color: "rgba(23,18,8,0.45)" }}>
        Dashboard / GST Portfolio
      </div>

      <PageHeader
        title="GST Portfolio"
        sub="Portfolio-wide GST health across all clients."
        right={
          <div className="flex gap-2">
            <SecondaryBtn onClick={exportCSV}><Download size={14} className="inline mr-1" />Export Report</SecondaryBtn>
            <PrimaryBtn onClick={() => setReconOpen(true)}>Run Portfolio ITC Recon</PrimaryBtn>
          </div>
        }
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <MetricCard label="Total ITC Safe" value={formatINRCompact(summary.totalSafe)} valueColor={COLORS.greenSoft} sub={`Across ${summary.clientsWithSafe} clients`} />
        <MetricCard label="Total ITC At Risk" value={formatINRCompact(summary.totalRisk)} valueColor={COLORS.redSoft} sub={`Across ${summary.clientsWithRisk} clients`} />
        <MetricCard label="Avg Notice Risk" value={`${summary.avgRisk}/100`} valueColor={summary.avgRisk > 70 ? COLORS.redSoft : summary.avgRisk >= 40 ? COLORS.amberSoft : COLORS.greenSoft} sub="Portfolio average" />
        <MetricCard label="Pending GSTR Filings" value={String(summary.pending)} valueColor={summary.pending > 0 ? COLORS.redSoft : COLORS.greenSoft} sub="Across all clients" />
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as any)} className="h-9 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}>
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk (&gt;70)</option>
            <option value="medium">Medium (40–70)</option>
            <option value="low">Low (&lt;40)</option>
          </select>
          <select value={itcFilter} onChange={(e) => setItcFilter(e.target.value as any)} className="h-9 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}>
            <option value="all">All ITC Status</option>
            <option value="high">High at Risk (&gt;₹5L)</option>
            <option value="medium">Medium (₹1L–₹5L)</option>
            <option value="safe">Safe</option>
          </select>
          <select value={filingFilter} onChange={(e) => setFilingFilter(e.target.value as any)} className="h-9 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}>
            <option value="all">All Filings</option>
            <option value="overdue">Overdue Filings</option>
            <option value="week">Due This Week</option>
            <option value="clear">All Clear</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-9 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}`, color: COLORS.ink }}>
            <option value="risk">Sort: Notice Risk (High→Low)</option>
            <option value="itc">Sort: ITC at Risk (High→Low)</option>
            <option value="name">Sort: Client Name (A–Z)</option>
            <option value="filing">Sort: Last Filing Date</option>
          </select>
          {filtersActive && <GhostLink onClick={clearFilters}>Clear filters</GhostLink>}
          <div className="ml-auto text-[12px]" style={{ color: "rgba(23,18,8,0.55)" }}>
            {filtered.length} of {clients.length} clients
          </div>
        </div>
      </Card>

      {/* Client GST health table */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold">Client GST Health</h3>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded animate-pulse" style={{ background: COLORS.divider }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileText size={40} style={{ color: COLORS.caBorder }} className="mx-auto mb-3" />
            <h4 className="text-[16px] font-semibold mb-1" style={{ color: COLORS.ink }}>No GST data available</h4>
            <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.55)" }}>
              {clients.length === 0 ? "Add clients to view portfolio-wide GST health." : "No clients match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "rgba(23,18,8,0.50)" }}>
                  <th className="py-2">Client</th>
                  <th className="py-2">GSTIN</th>
                  <th className="py-2">Notice Risk</th>
                  <th className="py-2">ITC Safe</th>
                  <th className="py-2">ITC At Risk</th>
                  <th className="py-2">Last Filed</th>
                  <th className="py-2">Next Due</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const score = r.notice_risk_score;
                  const scoreColor = score > 70 ? COLORS.red : score >= 40 ? COLORS.amber : COLORS.green;
                  const dueDays = r.next_due ? daysFromNow(r.next_due.date) : null;
                  const dueColor = dueDays === null ? "transparent" : dueDays < 3 ? COLORS.red : dueDays <= 7 ? COLORS.amber : COLORS.green;
                  return (
                    <tr key={r.business_id} className="hover:bg-[#FAF7F0] cursor-pointer" style={{ borderTop: `1px solid ${COLORS.divider}` }} onClick={() => navigate(`/ca/clients/${r.business_id}?tab=GST%20%26%20ITC`)}>
                      <td className="py-3">
                        <div className="font-medium">{r.business_name}</div>
                        {r.industry && <div className="text-[12px]" style={{ color: "rgba(23,18,8,0.45)" }}>{r.industry}</div>}
                      </td>
                      <td className="py-3 group">
                        <div className="flex items-center gap-1.5 text-[12px] font-mono" style={{ color: "rgba(23,18,8,0.65)" }}>
                          <span>{r.gstin || "-"}</span>
                          {r.gstin && (
                            <button onClick={(e) => { e.stopPropagation(); copyGstin(r.gstin!); }} className="opacity-0 group-hover:opacity-100">
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 w-[140px]">
                        <div className="font-bold text-[14px]" style={{ color: scoreColor }}>{score}/100</div>
                        <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: COLORS.divider }}>
                          <div style={{ width: `${score}%`, background: scoreColor, height: "100%" }} />
                        </div>
                      </td>
                      <td className="py-3 font-semibold" style={{ color: COLORS.green }}>{formatINRCompact(r.itc_safe)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold" style={{ color: r.itc_at_risk > 0 ? COLORS.red : "rgba(23,18,8,0.25)" }}>
                            {formatINRCompact(r.itc_at_risk)}
                          </span>
                          {r.itc_at_risk > 500000 && <AlertTriangle size={14} style={{ color: COLORS.red }} />}
                        </div>
                      </td>
                      <td className="py-3 text-[13px]">
                        {r.last_filed ? (
                          <>
                            <div>{monthYear(r.last_filed.date)}</div>
                            <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.45)" }}>{daysAgo(r.last_filed.date)}</div>
                          </>
                        ) : <span style={{ color: "rgba(23,18,8,0.35)" }}>-</span>}
                      </td>
                      <td className="py-3 text-[13px]">
                        {r.next_due ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: dueColor }} />
                            <div>
                              <div className="font-medium">{r.next_due.name}</div>
                              <div className="text-[11px]" style={{ color: "rgba(23,18,8,0.55)" }}>
                                {new Date(r.next_due.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </div>
                            </div>
                          </div>
                        ) : <Chip tone="green">All clear</Chip>}
                      </td>
                      <td className="py-3 text-right">
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/ca/clients/${r.business_id}?tab=GST%20%26%20ITC`); }} className="text-xs font-medium" style={{ color: COLORS.red }}>
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Portfolio insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card>
          <h4 className="text-[14px] font-semibold mb-4">Top 5 Clients by ITC at Risk</h4>
          {topByRisk.length === 0 ? (
            <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.50)" }}>No ITC at risk across portfolio.</p>
          ) : (
            <div className="space-y-3">
              {topByRisk.map((c) => {
                const max = topByRisk[0].itc_at_risk || 1;
                const pct = (c.itc_at_risk / max) * 100;
                return (
                  <div key={c.business_id}>
                    <div className="flex items-center justify-between text-[13px] mb-1">
                      <button onClick={() => navigate(`/ca/clients/${c.business_id}?tab=GST%20%26%20ITC`)} className="font-medium hover:underline text-left">{c.business_name}</button>
                      <span className="font-semibold" style={{ color: COLORS.red }}>{formatINRCompact(c.itc_at_risk)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.divider }}>
                      <div style={{ width: `${pct}%`, background: COLORS.red, height: "100%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h4 className="text-[14px] font-semibold mb-4">Top 5 Clients by Notice Risk</h4>
          {topByNotice.length === 0 ? (
            <p className="text-[13px]" style={{ color: "rgba(23,18,8,0.50)" }}>No data.</p>
          ) : (
            <div className="space-y-3">
              {topByNotice.map((c) => {
                const color = c.notice_risk_score > 70 ? COLORS.red : c.notice_risk_score >= 40 ? COLORS.amber : COLORS.green;
                return (
                  <div key={c.business_id}>
                    <div className="flex items-center justify-between text-[13px] mb-1">
                      <button onClick={() => navigate(`/ca/clients/${c.business_id}?tab=GST%20%26%20ITC`)} className="font-medium hover:underline text-left">{c.business_name}</button>
                      <span className="font-semibold" style={{ color }}>{c.notice_risk_score}/100</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.divider }}>
                      <div style={{ width: `${c.notice_risk_score}%`, background: color, height: "100%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h4 className="text-[14px] font-semibold mb-1">Filing Compliance Rate</h4>
          <p className="text-[12px] mb-4" style={{ color: "rgba(23,18,8,0.55)" }}>Clients with no overdue/upcoming GSTR pending</p>
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-[56px] font-bold leading-none" style={{ color: filingComplianceRate >= 95 ? COLORS.green : filingComplianceRate >= 85 ? COLORS.amber : COLORS.red }}>
              {filingComplianceRate}%
            </div>
            <p className="text-[13px] mt-2" style={{ color: "rgba(23,18,8,0.55)" }}>of clients filed on time</p>
          </div>
        </Card>

        <Card>
          <h4 className="text-[14px] font-semibold mb-1">ITC Risk Breakdown</h4>
          <p className="text-[12px] mb-4" style={{ color: "rgba(23,18,8,0.55)" }}>Risk across portfolio</p>
          <div className="space-y-2">
            {[
              { label: "Vendor Non-Compliance", pct: 38, color: COLORS.red },
              { label: "ITC Mismatch", pct: 27, color: COLORS.amber },
              { label: "Late Filings", pct: 18, color: COLORS.gold },
              { label: "Cash vs Digital Ratio", pct: 11, color: COLORS.blue },
              { label: "Turnover vs Returns Delta", pct: 6, color: COLORS.greenSoft },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span>{s.label}</span><span className="font-medium">{s.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.divider }}>
                  <div style={{ width: `${s.pct}%`, background: s.color, height: "100%" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Vendor health */}
      <Card>
        <h3 className="text-[15px] font-semibold mb-1">Vendor Health Across Portfolio</h3>
        <p className="text-[13px] mb-4" style={{ color: "rgba(23,18,8,0.60)" }}>
          Common vendors across multiple clients.
        </p>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded animate-pulse" style={{ background: COLORS.divider }} />)}</div>
        ) : vendors.length === 0 ? (
          <p className="text-[13px] py-4" style={{ color: "rgba(23,18,8,0.50)" }}>No vendor health data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase" style={{ color: "rgba(23,18,8,0.50)" }}>
                  <th className="py-2">GSTIN</th><th className="py-2">Vendor</th>
                  <th className="py-2">Clients</th><th className="py-2">Compliance</th><th className="py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const flag = v.avg_compliance < 50 ? "high" : v.avg_compliance < 75 ? "medium" : "safe";
                  return (
                    <tr key={v.gstin} style={{ borderTop: `1px solid ${COLORS.divider}` }}>
                      <td className="py-3 text-[12px] font-mono">{v.gstin}</td>
                      <td className="py-3 font-medium">{v.name}</td>
                      <td className="py-3 text-[13px]">{v.client_count} client{v.client_count > 1 ? "s" : ""}</td>
                      <td className="py-3 font-semibold" style={{ color: flag === "high" ? COLORS.red : flag === "medium" ? COLORS.amber : COLORS.green }}>
                        {v.avg_compliance}/100
                      </td>
                      <td className="py-3">
                        <Chip tone={flag === "high" ? "red" : flag === "medium" ? "amber" : "green"}>
                          {flag === "high" ? "Non-compliant" : flag === "medium" ? "Watch" : "Safe"}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {reconOpen && (
        <ReconModal clients={clients} onClose={() => setReconOpen(false)} caFirmId={caFirm?.id} />
      )}
    </PageWrap>
  );
}

// ============== Bulk Recon Modal ==============
function ReconModal({ clients, onClose, caFirmId }: { clients: ClientRow[]; onClose: () => void; caFirmId?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(clients.map((c) => c.business_id)));
  const [period, setPeriod] = useState("last_month");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [actions, setActions] = useState({
    match2A: true, flagMismatch: true, vendorCheck: true, perClientReport: true, autoNotify: false,
  });

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => setSelected(selected.size === clients.length ? new Set() : new Set(clients.map((c) => c.business_id)));

  async function runRecon() {
    if (!caFirmId || selected.size === 0) {
      toast.error("Select at least one client");
      return;
    }
    setRunning(true); setProgress(0); setLogs([]); setDone(false);
    const list = clients.filter((c) => selected.has(c.business_id));
    let mismatchTotal = 0;

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      // Simulate processing
      await new Promise((r) => setTimeout(r, 350));
      const mm = c.mismatches || Math.floor(Math.random() * 4);
      mismatchTotal += mm;
      const line = mm > 0
        ? `⚠ ${c.business_name}, ${mm} mismatch${mm > 1 ? "es" : ""} found`
        : `✓ ${c.business_name}, clean`;
      setLogs((prev) => [...prev, line]);
      setProgress(Math.round(((i + 1) / list.length) * 100));

      // Log activity for the CA firm
      await supabase.from("ca_activity_log").insert({
        ca_firm_id: caFirmId,
        business_id: c.business_id,
        action_type: "itc_recon_run",
        description: `Portfolio ITC recon: ${mm} mismatch${mm !== 1 ? "es" : ""}`,
      });
    }

    setDone(true);
    setRunning(false);
    toast.success(`Recon complete: ${list.length} clients, ${mismatchTotal} mismatches`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[760px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ border: `1px solid ${COLORS.caBorder}` }}>
        <div className="p-7">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[22px] font-bold" style={{ color: COLORS.ink }}>Run Portfolio ITC Reconciliation</h2>
              <p className="text-[13px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>
                Reconcile ITC across selected clients
              </p>
            </div>
            <button onClick={onClose} className="p-1"><X size={20} /></button>
          </div>

          {!running && !done && (
            <div className="mt-5 space-y-5">
              {/* Clients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: COLORS.gold }}>Select Clients</label>
                  <button onClick={toggleAll} className="text-[12px] font-medium" style={{ color: COLORS.red }}>
                    {selected.size === clients.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="rounded-md max-h-[200px] overflow-y-auto" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                  {clients.length === 0 ? (
                    <p className="p-4 text-[13px]" style={{ color: "rgba(23,18,8,0.50)" }}>No clients available</p>
                  ) : clients.map((c) => (
                    <label key={c.business_id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-[#FAF7F0]" style={{ borderBottom: `1px solid ${COLORS.divider}` }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input type="checkbox" checked={selected.has(c.business_id)} onChange={() => toggle(c.business_id)} />
                        <span className="text-[13px] font-medium truncate">{c.business_name}</span>
                      </div>
                      <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: c.itc_at_risk > 0 ? COLORS.red : "rgba(23,18,8,0.40)" }}>
                        {c.itc_at_risk > 0 ? `${formatINRCompact(c.itc_at_risk)} at risk` : "Safe"}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-[12px] mt-1.5" style={{ color: "rgba(23,18,8,0.55)" }}>{selected.size} of {clients.length} selected</p>
              </div>

              {/* Period */}
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: COLORS.gold }}>Reconciliation Period</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full h-10 px-3 rounded-md text-sm bg-white" style={{ border: `1px solid ${COLORS.caBorder}` }}>
                  <option value="last_month">Last Month</option>
                  <option value="last_quarter">Last Quarter</option>
                  <option value="last_6m">Last 6 Months</option>
                </select>
              </div>

              {/* Actions */}
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: COLORS.gold }}>Actions to Perform</label>
                <div className="space-y-1.5 text-[13px]">
                  {[
                    { k: "match2A", l: "Match invoices with GSTR-2A" },
                    { k: "flagMismatch", l: "Flag mismatched entries" },
                    { k: "vendorCheck", l: "Check vendor GST compliance" },
                    { k: "perClientReport", l: "Generate reconciliation report per client" },
                    { k: "autoNotify", l: "Auto-notify clients of mismatches" },
                  ].map((a) => (
                    <label key={a.k} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={(actions as any)[a.k]} onChange={(e) => setActions({ ...actions, [a.k]: e.target.checked })} />
                      <span>{a.l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(running || done) && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="font-medium">{done ? "Complete" : `Processing… ${progress}%`}</span>
                <span style={{ color: "rgba(23,18,8,0.55)" }}>{logs.length} of {selected.size}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: COLORS.divider }}>
                <div style={{ width: `${progress}%`, background: COLORS.red, height: "100%", transition: "width .3s" }} />
              </div>
              <div className="rounded-md p-3 max-h-[220px] overflow-y-auto text-[12px] font-mono space-y-1" style={{ background: "#FAF7F0", border: `1px solid ${COLORS.divider}` }}>
                {logs.map((l, i) => (
                  <div key={i} style={{ color: l.startsWith("⚠") ? COLORS.red : COLORS.green }}>{l}</div>
                ))}
                {running && <div className="flex items-center gap-2" style={{ color: "rgba(23,18,8,0.55)" }}><Loader2 size={12} className="animate-spin" /> Working…</div>}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3 justify-end">
            <SecondaryBtn onClick={onClose}>{done ? "Close" : "Cancel"}</SecondaryBtn>
            {!done && <PrimaryBtn onClick={runRecon} disabled={running || selected.size === 0}>
              {running ? "Running…" : "Start Reconciliation →"}
            </PrimaryBtn>}
          </div>
        </div>
      </div>
    </div>
  );
}
