import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/indian-format";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

type MonthlyFlow = { month: string; inflow: number; outflow: number; net: number };
type Txn = {
  id: string;
  date: string;
  amount: number;
  direction: string;
  description: string | null;
  category: string | null;
  counterparty: string | null;
};

const periods = ["30D", "90D", "6M", "1Y"] as const;

const CashFlowPage = () => {
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<typeof periods[number]>("90D");
  const [dirFilter, setDirFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchBusiness = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("business_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.business_id) setBusinessId(data.business_id);
    };
    fetchBusiness();
  }, []);

  const periodDays: Record<typeof periods[number], number> = { "30D": 30, "90D": 90, "6M": 180, "1Y": 365 };
  const days = periodDays[activePeriod];

  // Monthly cash flow, scoped to selected period
  const { data: monthlyFlow, isLoading } = useQuery<MonthlyFlow[]>({
    queryKey: ["cash-flow-monthly", businessId, activePeriod],
    queryFn: async () => {
      if (!businessId) return [];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data } = await supabase
        .from("transactions")
        .select("amount, date, direction")
        .eq("business_id", businessId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (!data) return [];

      const monthly: Record<string, { inflow: number; outflow: number }> = {};
      data.forEach((t) => {
        const month = t.date.substring(0, 7);
        if (!monthly[month]) monthly[month] = { inflow: 0, outflow: 0 };
        if (t.direction === "credit") monthly[month].inflow += Number(t.amount);
        else monthly[month].outflow += Number(t.amount);
      });

      return Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, d]) => ({
          month: new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
          inflow: d.inflow,
          outflow: d.outflow,
          net: d.inflow - d.outflow,
        }));
    },
    enabled: !!businessId,
  });

  // Recent transactions, scoped to selected period
  const { data: transactions } = useQuery<Txn[]>({
    queryKey: ["cash-flow-transactions", businessId, activePeriod],
    queryFn: async () => {
      if (!businessId) return [];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data } = await supabase
        .from("transactions")
        .select("id, date, amount, direction, description, category, counterparty")
        .eq("business_id", businessId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false })
        .limit(50);
      return (data as Txn[]) || [];
    },
    enabled: !!businessId,
  });


  const currentMonthData = monthlyFlow?.[monthlyFlow.length - 1];
  const totalInflow = currentMonthData?.inflow || 0;
  const totalOutflow = currentMonthData?.outflow || 0;
  const netCashFlow = currentMonthData?.net || 0;

  const filteredTxns = (transactions || []).filter((t) => {
    if (dirFilter === "in" && t.direction !== "credit") return false;
    if (dirFilter === "out" && t.direction === "credit") return false;
    if (search && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isEmpty = !isLoading && (!monthlyFlow || monthlyFlow.length === 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const inflow = payload.find((p: any) => p.dataKey === "inflow")?.value || 0;
    const outflow = payload.find((p: any) => p.dataKey === "outflow")?.value || 0;
    const net = inflow - outflow;
    return (
      <div style={{ background: "#171208", borderRadius: 8, padding: "12px 16px", border: "none" }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 6 }}>{label}</p>
        <p style={{ color: "#4ADE80", fontSize: 14, fontWeight: 600 }}>In: ₹{inflow.toLocaleString("en-IN")}</p>
        <p style={{ color: "#F87171", fontSize: 14, fontWeight: 600 }}>Out: ₹{outflow.toLocaleString("en-IN")}</p>
        <p style={{ color: net >= 0 ? "#FFFFFF" : "#F87171", fontSize: 14, fontWeight: 600 }}>Net: ₹{net.toLocaleString("en-IN")}</p>
      </div>
    );
  };

  // LOADING
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg animate-pulse" style={{ background: "rgba(23,18,8,0.06)", height: 120 }} />
          ))}
        </div>
        <div className="rounded-lg animate-pulse" style={{ background: "rgba(23,18,8,0.06)", height: 380 }} />
      </DashboardLayout>
    );
  }

  // EMPTY STATE
  if (isEmpty) {
    return (
      <DashboardLayout>
        <div className="rounded-lg p-12 text-center" style={{ background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)" }}>
          <div className="mx-auto mb-6 flex items-center justify-center" style={{ width: 64, height: 64, background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", boxShadow: "inset 0 -2px 0 0 #C41E1E", color: "#C41E1E" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges">
              <path d="M3 3v18h18M7 14l4-4 4 4 6-6" />
            </svg>
          </div>
          <h2 className="font-serif text-fyn-ink" style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No Cash Flow Data</h2>
          <p style={{ fontSize: 14, color: "rgba(23,18,8,0.60)", marginBottom: 20 }}>
            Upload your bank statements to see cash flow analysis
          </p>
          <Link
            to="/dashboard/data-import"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-90"
            style={{ background: "#C41E1E", color: "#FFFFFF", padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 500 }}
          >
            Upload Bank Statement →
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* TOP METRICS, current month real data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Inflow (This Month)</p>
          <p style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700, marginTop: 4 }}>₹{totalInflow.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Outflow (This Month)</p>
          <p style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700, marginTop: 4 }}>₹{totalOutflow.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Net Cash Flow</p>
          <p style={{ color: netCashFlow >= 0 ? "#16A34A" : "#F87171", fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {netCashFlow >= 0 ? "+" : ""}₹{netCashFlow.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* CHART */}
      <div className="rounded-lg p-5 mb-6" style={{ background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-fyn-ink font-sans" style={{ fontSize: 15, fontWeight: 600 }}>Monthly Cash Flow, Last 12 Months</h3>
          <div className="flex gap-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setActivePeriod(p)}
                className="transition-colors"
                style={{
                  fontSize: 13, padding: "4px 12px", borderRadius: 4,
                  background: activePeriod === p ? "#C41E1E" : "transparent",
                  color: activePeriod === p ? "#FFFFFF" : "rgba(23,18,8,0.40)",
                }}
              >{p}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={monthlyFlow}>
            <defs>
              <linearGradient id="cfGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#16A34A" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="cfRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(23,18,8,0.45)" }} />
            <YAxis tick={{ fontSize: 11, fill: "rgba(23,18,8,0.45)" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="inflow" stroke="#16A34A" strokeWidth={2} fill="url(#cfGreen)" />
            <Area type="monotone" dataKey="outflow" stroke="#DC2626" strokeWidth={2} fill="url(#cfRed)" />
            <Area type="monotone" dataKey="net" stroke="#171208" strokeWidth={2} fill="none" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-6 mt-3">
          <span className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 500 }}>
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "#16A34A" }} /> Inflow
          </span>
          <span className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 500 }}>
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "#DC2626" }} /> Outflow
          </span>
          <span className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 500 }}>
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "#171208" }} /> Net
          </span>
        </div>
      </div>

      {/* TRANSACTIONS */}
      <div className="rounded-lg p-5" style={{ background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-fyn-ink font-serif" style={{ fontSize: 15 }}>Transactions</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-lg" style={{ background: "#FAF7F0" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description..."
            className="outline-hidden flex-1 min-w-[160px]"
            style={{ height: 36, padding: "0 12px", background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)", borderRadius: 4, fontSize: 13 }}
          />
          <div className="flex gap-1">
            {(["all", "in", "out"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                style={{
                  fontSize: 13, padding: "6px 12px", borderRadius: 4,
                  background: dirFilter === d ? "#171208" : "#FFFFFF",
                  color: dirFilter === d ? "#FFFFFF" : "rgba(23,18,8,0.60)",
                  border: dirFilter === d ? "none" : "1px solid rgba(23,18,8,0.10)",
                }}
              >
                {d === "all" ? "All" : d === "in" ? "Money In" : "Money Out"}
              </button>
            ))}
          </div>
        </div>

        {filteredTxns.length === 0 ? (
          <div className="py-12 text-center" style={{ fontSize: 14, color: "rgba(23,18,8,0.50)" }}>
            No transactions match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.10)" }}>
                  {["Date", "Description", "Category", "Counterparty", "Amount"].map((h) => (
                    <th key={h} className={`py-2 ${h === "Amount" ? "text-right" : "text-left"}`} style={{ fontSize: 12, color: "rgba(23,18,8,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((t, i) => {
                  const isIn = t.direction === "credit";
                  const dateLabel = new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                  return (
                    <tr
                      key={t.id}
                      style={{ borderBottom: "1px solid rgba(23,18,8,0.06)", background: i % 2 === 0 ? "#FFFFFF" : "#FAF7F0" }}
                    >
                      <td className="py-3" style={{ fontSize: 13, color: "rgba(23,18,8,0.60)" }}>{dateLabel}</td>
                      <td className="py-3" style={{ fontSize: 14, fontWeight: 500, color: "#171208" }}>{t.description || "-"}</td>
                      <td className="py-3">
                        {t.category ? (
                          <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 100, background: "#F1F5F9", color: "#475569" }}>{t.category}</span>
                        ) : <span style={{ fontSize: 12, color: "rgba(23,18,8,0.30)" }}>-</span>}
                      </td>
                      <td className="py-3" style={{ fontSize: 13, color: "rgba(23,18,8,0.50)" }}>{t.counterparty || "-"}</td>
                      <td className="py-3 text-right fyn-metric" style={{ fontSize: 14, fontWeight: 600, color: isIn ? "#16A34A" : "#DC2626" }}>
                        {isIn ? "+" : "-"}{formatINR(Number(t.amount))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CashFlowPage;
