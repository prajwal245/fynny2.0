import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MarketGrowthPage = () => {
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

  const { data: receivables, isLoading } = useQuery({
    queryKey: ["market-receivables", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const { data } = await supabase
        .from("receivables")
        .select("*")
        .eq("business_id", businessId)
        .order("invoice_date", { ascending: true });
      return data || [];
    },
    enabled: !!businessId,
  });

  if (isLoading || !businessId) {
    return (
      <DashboardLayout>
        <div className="text-fyn-ink/60 text-sm">Loading market growth…</div>
      </DashboardLayout>
    );
  }

  if (!receivables || receivables.length === 0) {
    return (
      <DashboardLayout>
        <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-10 text-center">
          <h2 className="text-fyn-ink text-2xl font-sans font-semibold mb-2">
            No Revenue Data
          </h2>
          <p className="text-fyn-ink/60 text-sm mb-6">
            Upload invoices to track revenue growth
          </p>
          <button
            onClick={() => navigate("/dashboard/data-import")}
            className="bg-fyn-red text-white px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition"
          >
            Upload Data →
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const totalRevenue = receivables.reduce(
    (sum, r: any) => sum + (Number(r.amount) || 0),
    0
  );

  const byMonth = receivables.reduce((acc: Record<string, number>, r: any) => {
    if (!r.invoice_date) return acc;
    const month = String(r.invoice_date).substring(0, 7);
    if (!acc[month]) acc[month] = 0;
    acc[month] += Number(r.amount) || 0;
    return acc;
  }, {} as Record<string, number>);

  const months = Object.keys(byMonth).sort();
  const chartData = months.map((month) => ({
    month: new Date(month + "-01").toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    }),
    revenue: byMonth[month],
  }));

  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  const growthRate =
    prevMonth && byMonth[prevMonth] > 0
      ? (((byMonth[lastMonth] - byMonth[prevMonth]) / byMonth[prevMonth]) * 100).toFixed(1)
      : "0";
  const growthPositive = parseFloat(growthRate) >= 0;

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-fyn-ink p-5 border-0">
          <p className="text-white/40 text-[13px] fyn-label">TOTAL REVENUE</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">
            ₹{totalRevenue.toLocaleString("en-IN")}
          </p>
        </Card>
        <Card className="bg-fyn-ink p-5 border-0">
          <p className="text-white/40 text-[13px] fyn-label">GROWTH RATE (MoM)</p>
          <p
            className="text-[28px] font-bold mt-1 font-sans"
            style={{ color: growthPositive ? "#16A34A" : "#C41E1E" }}
          >
            {growthRate}%
          </p>
        </Card>
        <Card className="bg-fyn-ink p-5 border-0">
          <p className="text-white/40 text-[13px] fyn-label">TOTAL INVOICES</p>
          <p className="text-white text-[28px] font-bold mt-1 font-sans">
            {receivables.length}
          </p>
        </Card>
      </div>

      <div className="bg-fyn-beige-dark border border-fyn-ink-10 rounded-lg p-5">
        <h3 className="text-fyn-ink text-lg mb-4 font-sans">Revenue Trend</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis
              tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`}
              fontSize={12}
            />
            <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#C41E1E"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DashboardLayout>
  );
};

export default MarketGrowthPage;
