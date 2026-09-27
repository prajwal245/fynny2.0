import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Payable {
  id: string;
  vendor_name: string;
  amount: number | string | null;
  paid: number | string | null;
  outstanding: number | string | null;
  status: string | null;
  due_date: string | null;
  created_at: string;
  invoice_number: string | null;
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && isFinite(x) ? x : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const businessId: string | undefined = body.business_id || body.org_id;
    const periodDays: number = Math.max(7, Math.min(365, Number(body.period_days) || 90));

    if (!businessId) {
      return new Response(JSON.stringify({ error: "business_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("business_id").eq("user_id", userData.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    const isAdmin = (roles || []).some((r: any) =>
      ["admin", "super_admin", "ops_admin", "support_agent", "analyst"].includes(r.role)
    );
    if (!isAdmin && profile?.business_id !== businessId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const periodStart = new Date(Date.now() - periodDays * 86400_000).toISOString();
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400_000).toISOString();

    const { data: rows, error } = await supabase
      .from("payables")
      .select("*")
      .eq("business_id", businessId)
      .gte("created_at", sixMonthsAgo)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const all = (rows || []) as Payable[];
    const period = all.filter((p) => p.created_at >= periodStart);

    const totalSpend = period.reduce((s, p) => s + n(p.amount), 0);
    const totalOutstanding = period.reduce((s, p) => s + n(p.outstanding), 0);
    const invoiceCount = period.length;
    const vendorCount = new Set(period.map((p) => p.vendor_name)).size;
    const avgMonthly = totalSpend / Math.max(1, periodDays / 30);

    // Vendor breakdown
    const vendorMap = new Map<string, { vendor: string; total_spend: number; outstanding: number; invoice_count: number; id: string }>();
    for (const p of period) {
      const k = p.vendor_name || "Unknown";
      const v = vendorMap.get(k) || { vendor: k, total_spend: 0, outstanding: 0, invoice_count: 0, id: k };
      v.total_spend += n(p.amount);
      v.outstanding += n(p.outstanding);
      v.invoice_count += 1;
      vendorMap.set(k, v);
    }
    const vendorsSorted = Array.from(vendorMap.values()).sort((a, b) => b.total_spend - a.total_spend);
    const topVendors = vendorsSorted.slice(0, 20).map((v) => ({
      ...v,
      percentage: totalSpend > 0 ? (v.total_spend / totalSpend) * 100 : 0,
    }));

    // Concentration: top 3
    const top3Spend = vendorsSorted.slice(0, 3).reduce((s, v) => s + v.total_spend, 0);
    const concentrationRisk = totalSpend > 0 ? (top3Spend / totalSpend) * 100 : 0;

    // Category breakdown — group by simple heuristic on vendor name keyword,
    // fallback to vendor name. (No category field on payables.)
    const catKeywords: Array<[string, RegExp]> = [
      ["Software / SaaS", /(saas|software|cloud|aws|google|microsoft|adobe|slack|zoom|github)/i],
      ["Marketing", /(marketing|ads|google ads|facebook|meta|linkedin|seo|influencer)/i],
      ["Office & Utilities", /(rent|electricity|utility|office|wifi|internet|water)/i],
      ["Travel", /(uber|ola|flight|hotel|travel|airlines|indigo|makemytrip)/i],
      ["Professional Services", /(consult|legal|advoc|chartered|ca|audit|accountant)/i],
      ["Salaries & Contractors", /(salary|payroll|contractor|freelance)/i],
      ["Logistics", /(courier|delivery|shipping|fedex|dhl|bluedart|delhivery)/i],
    ];
    const categoryMap = new Map<string, number>();
    for (const p of period) {
      let cat = "Other";
      for (const [name, re] of catKeywords) {
        if (re.test(p.vendor_name || "")) { cat = name; break; }
      }
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + n(p.amount));
    }
    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalSpend > 0 ? (amount / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Trend: last 6 months
    const trendMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      trendMap.set(key, 0);
    }
    for (const p of all) {
      const d = new Date(p.created_at);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) || 0) + n(p.amount));
    }
    const trend = Array.from(trendMap.entries()).map(([month, spend]) => ({ month, spend }));
    const trendAvg = trend.reduce((s, t) => s + t.spend, 0) / Math.max(1, trend.length);

    // MoM change
    const monthsSorted = trend.map((t) => t.spend);
    const lastMonth = monthsSorted[monthsSorted.length - 1] || 0;
    const prevMonth = monthsSorted[monthsSorted.length - 2] || 0;
    const momChangePercent = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;

    // Anomalies: vendors > 2x average vendor spend, or single bills > 3x median
    const vendorAvg = totalSpend / Math.max(1, vendorCount);
    const anomalies: any[] = [];
    for (const v of vendorsSorted.slice(0, 10)) {
      if (vendorAvg > 0 && v.total_spend > 2 * vendorAvg) {
        anomalies.push({
          severity: v.total_spend > 4 * vendorAvg ? "warning" : "info",
          type: "Vendor Spike",
          message: `${v.vendor} spend is ${(v.total_spend / vendorAvg).toFixed(1)}x the vendor average`,
          value: v.total_spend,
          threshold: vendorAvg * 2,
        });
      }
    }
    if (lastMonth > 1.5 * trendAvg && trendAvg > 0) {
      anomalies.push({
        severity: "warning",
        type: "Monthly Spike",
        message: `Last month spend is ${((lastMonth / trendAvg - 1) * 100).toFixed(0)}% above 6-month average`,
        value: lastMonth,
        threshold: trendAvg,
      });
    }

    // Alerts
    const alerts: any[] = [];
    if (concentrationRisk > 50) {
      alerts.push({ severity: "critical", title: "High vendor concentration", message: `Top 3 vendors account for ${concentrationRisk.toFixed(1)}% of spend. Diversify suppliers.` });
    } else if (concentrationRisk > 30) {
      alerts.push({ severity: "warning", title: "Moderate concentration", message: `Top 3 vendors account for ${concentrationRisk.toFixed(1)}% of spend.` });
    }
    if (totalOutstanding > totalSpend * 0.5 && totalSpend > 0) {
      alerts.push({ severity: "warning", title: "High outstanding payables", message: `Outstanding is ${((totalOutstanding / totalSpend) * 100).toFixed(0)}% of period spend.` });
    }
    if (momChangePercent > 25) {
      alerts.push({ severity: "warning", title: "Costs trending up", message: `Spend up ${momChangePercent.toFixed(1)}% month-over-month.` });
    }

    // Suggestions
    const suggestions: any[] = [];
    if (concentrationRisk > 40) {
      suggestions.push({
        priority: "high",
        type: "diversification",
        message: "Reduce dependency on top vendors by sourcing from 2-3 alternates.",
        potential_savings: totalSpend * 0.05,
      });
    }
    const top1 = vendorsSorted[0];
    if (top1 && top1.total_spend > totalSpend * 0.25) {
      suggestions.push({
        priority: "medium",
        type: "cost_review",
        message: `Negotiate ${top1.vendor} contract — represents ${((top1.total_spend / totalSpend) * 100).toFixed(0)}% of spend.`,
        potential_savings: top1.total_spend * 0.1,
      });
    }
    if (vendorCount > 30) {
      suggestions.push({
        priority: "low",
        type: "consolidation",
        message: `${vendorCount} active vendors — consider consolidating low-value relationships.`,
        potential_savings: totalSpend * 0.03,
      });
    }

    return new Response(
      JSON.stringify({
        cost_metrics: {
          total_spend: totalSpend,
          total_outstanding: totalOutstanding,
          mom_change_percent: momChangePercent,
          concentration_risk: concentrationRisk,
          avg_monthly_spend: avgMonthly,
          vendor_count: vendorCount,
          invoice_count: invoiceCount,
          period_days: periodDays,
        },
        top_vendors: topVendors,
        category_breakdown: categoryBreakdown,
        trend,
        trend_average: trendAvg,
        anomalies,
        alerts,
        suggestions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
