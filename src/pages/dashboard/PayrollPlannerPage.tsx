import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import GlobalBackBar from "@/components/GlobalBackBar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatINR } from "@/lib/indian-format";

type PayrollSnapshot = {
  id: string;
  business_id: string;
  month: string;
  total_gross: number | null;
  total_net: number | null;
  total_deductions: number | null;
  employee_count: number | null;
  pf_total: number | null;
  esic_total: number | null;
  tds_total: number | null;
  processed_date: string | null;
};

const PayrollPlannerPage = () => {
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState<string | null>(null);

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

  const { data: payrollSnapshots, isLoading } = useQuery({
    queryKey: ["payroll-snapshots", businessId],
    queryFn: async (): Promise<PayrollSnapshot[]> => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("payroll_snapshots" as never)
        .select("*")
        .eq("business_id", businessId)
        .order("month", { ascending: false })
        .limit(12);
      return ((data as unknown) as PayrollSnapshot[]) || [];
    },
    enabled: !!businessId,
  });

  const currentMonth = payrollSnapshots?.[0];
  const totalPayroll = Number(currentMonth?.total_gross || 0);
  const employeeCount = Number(currentMonth?.employee_count || 0);
  const avgPerEmployee = employeeCount > 0 ? totalPayroll / employeeCount : 0;

  const chartData = [...(payrollSnapshots || [])]
    .slice(0, 6)
    .reverse()
    .map((s) => ({
      month: new Date(s.month + "-01").toLocaleDateString("en-IN", { month: "short" }),
      payroll: Number(s.total_gross || 0),
    }));

  const isEmpty = !isLoading && (!payrollSnapshots || payrollSnapshots.length === 0);

  return (
    <DashboardLayout>
      <GlobalBackBar />

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">CURRENT MONTH PAYROLL</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{formatINR(totalPayroll)}</p>
          <p className="text-white/40 text-[11px] mt-1">{currentMonth?.month || "-"}</p>
        </div>
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">EMPLOYEE COUNT</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{employeeCount}</p>
        </div>
        <div className="bg-fyn-ink rounded-lg p-5">
          <p className="text-white/40 text-[13px] fyn-label">AVERAGE PER EMPLOYEE</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">{formatINR(Math.round(avgPerEmployee))}</p>
        </div>
      </div>

      {/* LOADING */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* EMPTY STATE */}
      {isEmpty && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-12 text-center">
          <h3 className="text-fyn-ink text-xl font-serif mb-2">No Payroll Data</h3>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Payroll information will appear once you run your first payroll cycle
          </p>
          <button
            onClick={() => navigate("/dashboard/settings/integrations")}
            className="bg-fyn-ink text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-fyn-ink/90 transition-colors"
          >
            Connect HRMS →
          </button>
        </div>
      )}

      {/* TREND CHART */}
      {!isLoading && chartData.length > 0 && (
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
          <h3 className="text-fyn-ink font-serif text-lg mb-4">Payroll Trend (Last 6 Months)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,18,8,0.1)" />
                <XAxis dataKey="month" stroke="rgba(23,18,8,0.5)" fontSize={12} />
                <YAxis stroke="rgba(23,18,8,0.5)" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  formatter={(v: number) => formatINR(v)}
                  contentStyle={{ background: "#171208", border: "none", borderRadius: 6, color: "#fff" }}
                />
                <Line type="monotone" dataKey="payroll" stroke="#C41E1E" strokeWidth={2} dot={{ r: 4, fill: "#C41E1E" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default PayrollPlannerPage;
