import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, Printer, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics";

const BEIGE = "#F4EDDA";
const CARD_BORDER = "1px solid rgba(23,18,8,0.08)";
const INK = "#171208";
const GOLD = "#8B6914";
const RED = "#C41E1E";
const GREEN = "#1F5A46";
const AMBER = "#D97706";
const MUTED = "rgba(23,18,8,0.55)";

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums" };
const HEAD: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif" };
const BODY: React.CSSProperties = { fontFamily: "Inter, system-ui, sans-serif" };

const fmtINR = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...BODY, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>{children}</div>
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={className} style={{ background: "#FFFFFF", border: CARD_BORDER, borderRadius: 12, padding: 20 }}>{children}</div>
);

const Pill = ({ tone, label }: { tone: "green" | "amber" | "red" | "muted"; label: string }) => {
  const map = {
    green: { bg: "rgba(16,185,129,0.12)", fg: GREEN, border: "rgba(16,185,129,0.3)" },
    amber: { bg: "rgba(217,119,6,0.12)", fg: AMBER, border: "rgba(217,119,6,0.3)" },
    red: { bg: "rgba(196,30,30,0.10)", fg: RED, border: "rgba(196,30,30,0.3)" },
    muted: { bg: "rgba(23,18,8,0.05)", fg: MUTED, border: "rgba(23,18,8,0.12)" },
  }[tone];
  return (
    <span style={{ ...BODY, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: map.bg, color: map.fg, border: `1px solid ${map.border}` }}>
      {label}
    </span>
  );
};

type LiquidityRow = { cash_position: number; burn_rate_current: number; health_score: number; health_status: string } | null;
type TxRow = { date: string; amount: number; direction: string };
type GstRow = { return_type: string; filing_period: string; status: string; due_date: string };
type TdsRow = { quarter: string; form_type: string; status: string; due_date: string };
type BizRow = { business_name: string; industry: string | null; gstin: string | null; created_at: string } | null;

export default function InvestorPage() {
  const { profile, businessId, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [liquidity, setLiquidity] = useState<LiquidityRow>(null);
  const [txns, setTxns] = useState<TxRow[]>([]);
  const [gst, setGst] = useState<GstRow[]>([]);
  const [tds, setTds] = useState<TdsRow[]>([]);
  const [business, setBusiness] = useState<BizRow>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [activeSubs, setActiveSubs] = useState<number | null>(null);
  const [outstandingAR, setOutstandingAR] = useState<number | null>(null);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [cacInput, setCacInput] = useState("");
  const [lastUpdated] = useState(new Date());
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!businessId) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const [liqRes, txRes, gstRes, tdsRes, bizRes, custRes, subsRes, invRes, manualRes] = await Promise.all([
        supabase.from("liquidity_metrics").select("cash_position,burn_rate_current,health_score,health_status,recorded_at").eq("business_id", businessId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("transactions").select("date,amount,direction").eq("business_id", businessId).gte("date", oneYearAgo).order("date", { ascending: true }),
        supabase.from("gst_filings").select("return_type,filing_period,status,due_date").eq("business_id", businessId).order("due_date", { ascending: false }).limit(20),
        supabase.from("tds_filings").select("quarter,form_type,status,due_date").eq("business_id", businessId).order("due_date", { ascending: false }).limit(20),
        supabase.from("businesses").select("business_name,industry,gstin,created_at").eq("id", businessId).maybeSingle(),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", businessId),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active"),
        supabase.from("invoices").select("outstanding_amount,status").eq("business_id", businessId).neq("status", "paid"),
        supabase.from("investor_manual_metrics").select("metric_name,value").eq("business_id", businessId),
      ]);
      if (cancelled) return;

      setLiquidity((liqRes.data as any) ?? null);
      setTxns((txRes.data as TxRow[]) ?? []);
      setGst((gstRes.data as GstRow[]) ?? []);
      setTds((tdsRes.data as TdsRow[]) ?? []);
      setBusiness((bizRes.data as BizRow) ?? null);
      setCustomerCount(custRes.count ?? 0);
      setActiveSubs(subsRes.count ?? 0);
      const arSum = (invRes.data ?? []).reduce((s: number, r: any) => s + Number(r.outstanding_amount ?? 0), 0);
      setOutstandingAR(arSum);

      const map: Record<string, string> = {};
      (manualRes.data ?? []).forEach((r: any) => { map[r.metric_name] = r.value ?? ""; });
      setManual(map);
      setNotes(map.investor_notes ?? "");
      setCacInput(map.cac ?? "");
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [authLoading, businessId]);

  const saveManual = async (metric_name: string, value: string) => {
    if (!businessId) return;
    const { error } = await supabase.from("investor_manual_metrics").upsert(
      { business_id: businessId, metric_name, value, updated_at: new Date().toISOString() },
      { onConflict: "business_id,metric_name" },
    );
    if (error) { toast.error("Could not save"); return; }
    setManual((m) => ({ ...m, [metric_name]: value }));
    setSavedFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2000);
  };

  // Monthly revenue series (inflows)
  const monthly = useMemo(() => {
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(monthKey(d), 0);
    }
    for (const t of txns) {
      if (t.direction !== "in") continue;
      if (!t.date) continue;
      const d = new Date(t.date);
      const k = monthKey(d);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + Number(t.amount || 0));
    }
    return Array.from(buckets.entries()).map(([k, v]) => ({ key: k, label: monthLabel(k), revenue: v }));
  }, [txns]);

  const nonZeroMonths = monthly.filter((m) => m.revenue > 0).length;
  const thisMonth = monthly[monthly.length - 1]?.revenue ?? 0;
  const lastMonth = monthly[monthly.length - 2]?.revenue ?? 0;
  const monthPrior = monthly[monthly.length - 3]?.revenue ?? 0;
  const momMRR = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;
  const growth3m = lastMonth > 0 && monthPrior > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  const cash = liquidity?.cash_position ?? null;
  const burn = liquidity?.burn_rate_current ?? null;
  const runway = cash != null && burn != null && burn > 0 ? cash / burn : null;
  const runwayColor = runway == null ? INK : runway > 6 ? GREEN : runway >= 3 ? AMBER : RED;

  // Burn trend — compare burn to outflows of prior month
  const outflowThis = useMemo(() => {
    const now = new Date();
    const k = monthKey(new Date(now.getFullYear(), now.getMonth(), 1));
    return txns.filter((t) => t.direction === "out" && monthKey(new Date(t.date)) === k).reduce((s, t) => s + Number(t.amount || 0), 0);
  }, [txns]);
  const outflowLast = useMemo(() => {
    const now = new Date();
    const k = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    return txns.filter((t) => t.direction === "out" && monthKey(new Date(t.date)) === k).reduce((s, t) => s + Number(t.amount || 0), 0);
  }, [txns]);
  const burnTrend: "Stable" | "Increasing" | "Decreasing" | null = outflowLast > 0
    ? (Math.abs(outflowThis - outflowLast) / outflowLast < 0.05 ? "Stable" : outflowThis > outflowLast ? "Increasing" : "Decreasing")
    : null;

  const cac = manual.cac ? Number(manual.cac) : null;
  const ltv = manual.ltv ? Number(manual.ltv) : null;
  const ratio = ltv != null && cac != null && cac > 0 ? ltv / cac : null;
  const ratioTone: "green" | "amber" | "red" | "muted" = ratio == null ? "muted" : ratio > 3 ? "green" : ratio >= 1 ? "amber" : "red";
  const ratioLabel = ratio == null ? "Incomplete data" : ratio > 3 ? "Healthy" : ratio >= 1 ? "Watch" : "Critical";

  // Compliance
  const complianceItems = useMemo(() => {
    const g1 = gst.find((f) => (f.return_type || "").toUpperCase().includes("GSTR1") || (f.return_type || "").toUpperCase() === "GSTR-1");
    const g3 = gst.find((f) => (f.return_type || "").toUpperCase().includes("GSTR3") || (f.return_type || "").toUpperCase() === "GSTR-3B");
    const tq1 = tds.find((f) => (f.quarter || "").toUpperCase().includes("Q1"));
    const tq2 = tds.find((f) => (f.quarter || "").toUpperCase().includes("Q2"));
    const toneOf = (row: { status?: string; due_date?: string } | undefined): "green" | "amber" | "red" | "muted" => {
      if (!row) return "muted";
      const s = (row.status || "").toLowerCase();
      if (s === "filed" || s === "completed") return "green";
      if (s === "overdue") return "red";
      if (row.due_date && new Date(row.due_date) < new Date() && s !== "filed") return "red";
      return "amber";
    };
    return [
      { label: "GSTR-1", tone: toneOf(g1) },
      { label: "GSTR-3B", tone: toneOf(g3) },
      { label: "TDS Q1", tone: toneOf(tq1) },
      { label: "TDS Q2", tone: toneOf(tq2) },
    ];
  }, [gst, tds]);

  const complianceScore = useMemo(() => {
    const total = complianceItems.length;
    const filed = complianceItems.filter((c) => c.tone === "green").length;
    return total > 0 ? Math.round((filed / total) * 100) : 0;
  }, [complianceItems]);

  const registeredSince = business?.created_at ? new Date(business.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (authLoading || loading) {
    return (
      <div style={{ background: BEIGE, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: RED }} />
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="investor-page-root" style={{ background: BEIGE, minHeight: "100vh", padding: 32 }}>
        <Card>
          <div style={{ ...HEAD, fontSize: 22, color: INK, marginBottom: 8 }}>Complete your business profile</div>
          <p style={{ ...BODY, color: MUTED, marginBottom: 16 }}>The investor view needs a business profile to pull metrics. Finish setup to unlock this page.</p>
          <Link to="/dashboard/settings/business-profile" style={{ ...BODY, color: RED, fontWeight: 600 }}>Set up business profile →</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="investor-page-root" style={{ background: BEIGE, minHeight: "100vh" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .investor-page-root, .investor-page-root * { visibility: visible; }
          .investor-page-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 64px" }}>
        {/* TOP BAR */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
          <div>
            <Eyebrow>Investor View · One-page summary</Eyebrow>
            <h1 style={{ ...HEAD, fontSize: 32, color: INK, margin: "6px 0 4px", lineHeight: 1.15 }}>{business?.business_name || profile?.full_name || "Your business"}</h1>
            <div style={{ ...BODY, fontSize: 13, color: MUTED }}>
              Last updated {lastUpdated.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })} · {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onShare}
              style={{ ...BODY, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: "transparent", color: RED, border: `1px solid ${RED}`, fontWeight: 600, cursor: "pointer" }}
            >
              <Share2 size={16} /> Share view
            </button>
            <button
              onClick={() => { track("report_generated", { report_type: "investor_view" }); window.print(); }}
              style={{ ...BODY, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, background: RED, color: "#fff", border: `1px solid ${RED}`, fontWeight: 600, cursor: "pointer" }}
            >
              <Printer size={16} /> Export as PDF
            </button>
          </div>
        </div>

        {(txns.length === 0 && cash == null && thisMonth === 0) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            padding: "16px 20px", borderRadius: 10,
            background: "rgba(139,105,20,0.08)", border: `1px solid ${AMBER}`,
            margin: "0 0 20px",
          }}>
            <div>
              <div style={{ ...BODY, fontWeight: 600, color: INK, marginBottom: 4 }}>
                Your Investor View is ready — it's just waiting for data.
              </div>
              <div style={{ ...BODY, fontSize: 13, color: "rgba(23,18,8,0.65)" }}>
                Connect your bank and payment accounts to populate MRR, ARR, cash, burn and runway automatically.
              </div>
            </div>
            <Link
              to="/dashboard/settings/integrations"
              style={{ ...BODY, whiteSpace: "nowrap", padding: "10px 16px", borderRadius: 8, background: RED, color: "#fff", fontWeight: 600, textDecoration: "none" }}
            >
              Connect accounts →
            </Link>
          </div>
        )}

        {/* SECTION 1 */}
        <Eyebrow>Financial health summary</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, margin: "10px 0 28px" }}>
          <Card>
            <Eyebrow>MRR</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>{thisMonth > 0 ? fmtINR(thisMonth) : (
              <Link to="/dashboard/settings/integrations" style={{ ...BODY, fontSize: 14, color: RED, fontWeight: 600 }}>Connect Razorpay →</Link>
            )}</div>
            {thisMonth > 0 && momMRR != null && (
              <div style={{ marginTop: 8 }}>
                <Pill tone={momMRR >= 0 ? "green" : "red"} label={`${momMRR >= 0 ? "▲" : "▼"} ${Math.abs(momMRR).toFixed(1)}% MoM`} />
              </div>
            )}
          </Card>

          <Card>
            <Eyebrow>Cash runway</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: runwayColor, marginTop: 8 }}>
              {runway != null ? `${runway.toFixed(1)} mo` : (
                <Link to="/dashboard/settings/integrations" style={{ ...BODY, fontSize: 14, color: RED, fontWeight: 600 }}>Connect bank →</Link>
              )}
            </div>
            {cash != null && <div style={{ ...BODY, fontSize: 12, color: MUTED, marginTop: 6 }}>Cash on hand: {fmtINR(cash)}</div>}
          </Card>

          <Card>
            <Eyebrow>Burn rate</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>{burn != null && burn > 0 ? `${fmtINR(burn)}/mo` : "—"}</div>
            {burnTrend && (
              <div style={{ marginTop: 8 }}>
                <Pill tone={burnTrend === "Decreasing" ? "green" : burnTrend === "Increasing" ? "red" : "muted"} label={burnTrend} />
              </div>
            )}
          </Card>

          <Card>
            <Eyebrow>Revenue growth</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>
              {growth3m != null ? `${growth3m >= 0 ? "+" : ""}${growth3m.toFixed(1)}%` : (
                <span style={{ ...BODY, fontSize: 14, color: MUTED }}>Insufficient data</span>
              )}
            </div>
            {growth3m != null && (
              <div style={{ marginTop: 8 }}>
                <Pill tone={growth3m >= 0 ? "green" : "red"} label={growth3m >= 0 ? "MoM up" : "MoM down"} />
              </div>
            )}
          </Card>
        </div>

        {/* SECTION 2 — Unit economics */}
        <Eyebrow>Unit economics</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, margin: "10px 0 28px" }}>
          <Card>
            <Eyebrow>Customer LTV</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>{ltv != null ? fmtINR(ltv) : "—"}</div>
            <input
              defaultValue={manual.ltv ?? ""}
              onBlur={(e) => e.target.value !== (manual.ltv ?? "") && saveManual("ltv", e.target.value)}
              placeholder="Enter LTV (₹)"
              inputMode="numeric"
              style={{ ...BODY, marginTop: 10, width: "100%", padding: "8px 10px", background: BEIGE, border: "1px solid rgba(23,18,8,0.12)", borderRadius: 6, fontSize: 13, color: INK }}
            />
          </Card>

          <Card>
            <Eyebrow>Customer acquisition cost</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>{cac != null ? fmtINR(cac) : "—"}</div>
            <input
              value={cacInput}
              onChange={(e) => setCacInput(e.target.value)}
              onBlur={(e) => e.target.value !== (manual.cac ?? "") && saveManual("cac", e.target.value)}
              placeholder="Enter CAC (₹)"
              inputMode="numeric"
              style={{ ...BODY, marginTop: 10, width: "100%", padding: "8px 10px", background: BEIGE, border: "1px solid rgba(23,18,8,0.12)", borderRadius: 6, fontSize: 13, color: INK }}
            />
          </Card>

          <Card>
            <Eyebrow>LTV : CAC</Eyebrow>
            <div style={{ ...MONO, fontSize: 32, color: INK, marginTop: 8 }}>{ratio != null ? `${ratio.toFixed(2)}×` : "—"}</div>
            <div style={{ marginTop: 10 }}><Pill tone={ratioTone} label={ratioLabel} /></div>
          </Card>
        </div>

        {/* SECTION 3 — Compliance */}
        <Eyebrow>GST & compliance status</Eyebrow>
        <Card className="" >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {complianceItems.map((c) => (
              <Pill key={c.label} tone={c.tone} label={c.label} />
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 10 }}>
            <Eyebrow>Compliance score</Eyebrow>
            <span style={{ ...MONO, fontSize: 22, color: INK }}>{complianceScore}%</span>
          </div>
        </Card>

        {/* SECTION 4 — Revenue trend */}
        <div style={{ height: 24 }} />
        <Eyebrow>Revenue trend · Last 12 months</Eyebrow>
        <Card>
          {nonZeroMonths >= 3 ? (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={monthly} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(23,18,8,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => `₹${(v / 1e5).toFixed(1)}L`}
                    tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(196,30,30,0.06)" }}
                    contentStyle={{ background: "#fff", border: CARD_BORDER, borderRadius: 8, fontFamily: "Inter, sans-serif", fontSize: 12 }}
                    formatter={(v: number) => [fmtINR(v), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill={RED} fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ ...BODY, padding: 24, textAlign: "center", color: MUTED }}>
              Revenue chart will appear after 3 months of data.
            </div>
          )}
        </Card>

        {/* SECTION 5 — Key metrics */}
        <div style={{ height: 24 }} />
        <Eyebrow>Key metrics for investors</Eyebrow>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px 32px" }}>
            <MetricRow label="Business type" value={business?.industry || "Not set"} />
            <MetricRow label="Registered since" value={registeredSince} />
            <MetricRow label="GST registered" value={business?.gstin ? "Yes" : "Not registered"} />
            <MetricRow label="Total customers" value={customerCount != null ? String(customerCount) : "—"} mono />
            <MetricRow label="Active subscriptions" value={activeSubs != null ? String(activeSubs) : "—"} mono />
            <MetricRow label="Outstanding receivables" value={outstandingAR != null ? fmtINR(outstandingAR) : "—"} mono />
          </div>
        </Card>

        {/* SECTION 6 — Notes */}
        <div style={{ height: 24 }} />
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ ...HEAD, fontSize: 18, color: INK, margin: 0 }}>Notes for investors</h2>
            {savedFlash && <span style={{ ...BODY, fontSize: 12, color: GREEN, fontWeight: 600 }}>Saved</span>}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={(e) => e.target.value !== (manual.investor_notes ?? "") && saveManual("investor_notes", e.target.value)}
            placeholder="Add context for investors — fundraising round, use of funds, key milestones."
            rows={5}
            style={{
              ...BODY,
              marginTop: 12,
              width: "100%",
              background: BEIGE,
              border: "1px solid rgba(23,18,8,0.12)",
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
              color: INK,
              resize: "vertical",
              outline: "none",
            }}
          />
        </Card>
      </div>
    </div>
  );
}

function MetricRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, borderBottom: "1px dashed rgba(23,18,8,0.08)", paddingBottom: 8 }}>
      <span style={{ ...BODY, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>{label}</span>
      <span style={{ ...(mono ? MONO : BODY), fontSize: 14, color: INK, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
