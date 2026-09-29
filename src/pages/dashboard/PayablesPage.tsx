import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatINR } from "@/lib/indian-format";

type Payable = {
  id: string;
  vendor_name: string;
  invoice_number: string | null;
  due_date: string | null;
  amount: number;
  paid: number | null;
  outstanding: number | null;
  status: string | null;
  created_at: string;
};

const PayablesPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "due_soon" | "paid">("all");

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

  const { data: payables, isLoading } = useQuery<Payable[]>({
    queryKey: ["payables", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("payables")
        .select("*")
        .eq("business_id", businessId)
        .order("due_date", { ascending: true });
      return (data as Payable[]) || [];
    },
    enabled: !!businessId,
  });

  const now = new Date();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const isOverdue = (p: Payable) =>
    !!p.due_date && new Date(p.due_date) < now && p.status !== "paid";
  const isDueSoon = (p: Payable) =>
    !!p.due_date &&
    new Date(p.due_date) >= now &&
    new Date(p.due_date) < sevenDaysFromNow &&
    p.status !== "paid";

  const totalPayables =
    payables?.reduce((sum, p) => sum + Number(p.outstanding || 0), 0) || 0;
  const overduePayables = payables?.filter(isOverdue) || [];
  const overdueAmount = overduePayables.reduce(
    (sum, p) => sum + Number(p.outstanding || 0),
    0,
  );
  const dueSoon = payables?.filter(isDueSoon) || [];

  const filtered = (payables || []).filter((p) => {
    if (statusFilter === "overdue" && !isOverdue(p)) return false;
    if (statusFilter === "due_soon" && !isDueSoon(p)) return false;
    if (statusFilter === "paid" && p.status !== "paid") return false;
    if (
      search &&
      !p.vendor_name.toLowerCase().includes(search.toLowerCase()) &&
      !(p.invoice_number || "").toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg animate-pulse" style={{ background: "rgba(23,18,8,0.06)", height: 110 }} />
          ))}
        </div>
        <div className="rounded-lg animate-pulse" style={{ background: "rgba(23,18,8,0.06)", height: 380 }} />
      </DashboardLayout>
    );
  }

  if (!payables || payables.length === 0) {
    return (
      <DashboardLayout>
        <div className="rounded-lg p-12 text-center" style={{ background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)" }}>
          <div className="mx-auto mb-6 flex items-center justify-center" style={{ width: 64, height: 64, background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", boxShadow: "inset 0 -2px 0 0 #C41E1E", color: "#C41E1E" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges">
              <path d="M4 4h16v16H4zM4 9h16M9 4v16" />
            </svg>
          </div>
          <h2 className="font-serif text-fyn-ink" style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>No Vendor Bills</h2>
          <p style={{ fontSize: 14, color: "rgba(23,18,8,0.60)", marginBottom: 20 }}>
            Upload expense CSV to track payables
          </p>
          <button
            onClick={() => navigate("/dashboard/data-import")}
            className="inline-flex items-center gap-2 transition-colors hover:opacity-90"
            style={{ background: "#C41E1E", color: "#FFFFFF", padding: "10px 20px", borderRadius: 6, fontSize: 14, fontWeight: 500 }}
          >
            Upload Expenses →
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const statusBadge = (p: Payable) => {
    if (p.status === "paid") return { bg: "#DCFCE7", color: "#16A34A", label: "Paid" };
    if (isOverdue(p)) return { bg: "#FDEAEA", color: "#C41E1E", label: "Overdue" };
    if (isDueSoon(p)) return { bg: "#FEF3E2", color: "#8B5A00", label: "Due Soon" };
    return { bg: "#F1F5F9", color: "#475569", label: p.status || "Pending" };
  };

  return (
    <DashboardLayout>
      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Payables</p>
          <p className="fyn-metric" style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            ₹{totalPayables.toLocaleString("en-IN")}
          </p>
          <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, marginTop: 4 }}>{payables.length} bills outstanding</p>
        </div>
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Overdue</p>
          <p className="fyn-metric" style={{ color: overdueAmount > 0 ? "#F87171" : "#FFFFFF", fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            ₹{overdueAmount.toLocaleString("en-IN")}
          </p>
          <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, marginTop: 4 }}>{overduePayables.length} bills</p>
        </div>
        <div className="rounded-lg" style={{ background: "#171208", padding: "20px 24px" }}>
          <p style={{ color: "rgba(255,255,255,0.50)", fontSize: 12, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>Due This Week</p>
          <p className="fyn-metric" style={{ color: "#FFFFFF", fontSize: 28, fontWeight: 700, marginTop: 4 }}>
            {dueSoon.length}
          </p>
          <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 12, marginTop: 4 }}>bills due in next 7 days</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="rounded-lg p-5" style={{ background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-fyn-ink font-serif" style={{ fontSize: 15 }}>Vendor Bills</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-lg" style={{ background: "#FAF7F0" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor or invoice…"
            className="outline-hidden flex-1 min-w-[160px]"
            style={{ height: 36, padding: "0 12px", background: "#FFFFFF", border: "1px solid rgba(23,18,8,0.10)", borderRadius: 4, fontSize: 13 }}
          />
          <div className="flex gap-1 flex-wrap">
            {([
              ["all", "All"],
              ["overdue", "Overdue"],
              ["due_soon", "Due Soon"],
              ["paid", "Paid"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                style={{
                  fontSize: 13, padding: "6px 12px", borderRadius: 4,
                  background: statusFilter === key ? "#171208" : "#FFFFFF",
                  color: statusFilter === key ? "#FFFFFF" : "rgba(23,18,8,0.60)",
                  border: statusFilter === key ? "none" : "1px solid rgba(23,18,8,0.10)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center" style={{ fontSize: 14, color: "rgba(23,18,8,0.50)" }}>
            No bills match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(23,18,8,0.10)" }}>
                  {["Vendor", "Invoice #", "Due Date", "Amount", "Outstanding", "Status"].map((h, i) => (
                    <th key={h} className={`py-2 ${i >= 3 && i <= 4 ? "text-right" : "text-left"}`} style={{ fontSize: 12, color: "rgba(23,18,8,0.45)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const overdue = isOverdue(p);
                  const badge = statusBadge(p);
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid rgba(23,18,8,0.06)",
                        background: overdue ? "#FDEAEA" : i % 2 === 0 ? "#FFFFFF" : "#FAF7F0",
                      }}
                    >
                      <td className="py-3" style={{ fontSize: 14, fontWeight: 500, color: "#171208" }}>{p.vendor_name}</td>
                      <td className="py-3" style={{ fontSize: 13, color: "rgba(23,18,8,0.60)" }}>{p.invoice_number || "-"}</td>
                      <td className="py-3" style={{ fontSize: 13, color: overdue ? "#C41E1E" : "rgba(23,18,8,0.60)", fontWeight: overdue ? 600 : 400 }}>
                        {p.due_date ? new Date(p.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
                      </td>
                      <td className="py-3 text-right fyn-metric" style={{ fontSize: 14, color: "rgba(23,18,8,0.80)" }}>
                        {formatINR(Number(p.amount || 0))}
                      </td>
                      <td className="py-3 text-right fyn-metric" style={{ fontSize: 14, fontWeight: 600, color: overdue ? "#C41E1E" : "#171208" }}>
                        {formatINR(Number(p.outstanding || 0))}
                      </td>
                      <td className="py-3">
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 100, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
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

export default PayablesPage;
