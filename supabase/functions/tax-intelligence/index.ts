import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && isFinite(x) ? x : 0;
};

const monthKey = (d: Date) =>
  d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const businessId: string | undefined = body.business_id || body.org_id;
    if (!businessId) {
      return new Response(JSON.stringify({ error: "business_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AuthN: require valid JWT
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

    // AuthZ: caller must own this business (or be admin)
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

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const [gstRes, tdsRes] = await Promise.all([
      supabase.from("gst_filings").select("*").eq("business_id", businessId).order("due_date", { ascending: false }).limit(48),
      supabase.from("tds_filings").select("*").eq("business_id", businessId).order("due_date", { ascending: false }).limit(48),
    ]);
    if (gstRes.error) throw gstRes.error;
    if (tdsRes.error) throw tdsRes.error;

    const gst = (gstRes.data || []) as any[];
    const tds = (tdsRes.data || []) as any[];

    // ── Compliance ──
    const gstFiled = gst.filter((f) => f.status === "filed");
    const gstOnTime = gstFiled.filter((f) => f.filed_date && f.filed_date <= f.due_date).length;
    const gstComplianceRate = gstFiled.length ? (gstOnTime / gstFiled.length) * 100 : 0;

    const tdsFiled = tds.filter((f) => f.status === "filed");
    const tdsOnTime = tdsFiled.filter((f) => f.filed_date && f.filed_date <= f.due_date).length;
    const tdsComplianceRate = tdsFiled.length ? (tdsOnTime / tdsFiled.length) * 100 : 0;

    const totalFiled = gstFiled.length + tdsFiled.length;
    const totalOnTime = gstOnTime + tdsOnTime;
    const overallComplianceRate = totalFiled ? (totalOnTime / totalFiled) * 100 : 0;

    // ── Tax liability (latest filed/most recent month) ──
    const sorted = [...gst].sort((a, b) => (b.due_date || "").localeCompare(a.due_date || ""));
    const latest = sorted[0];
    const outputTax = n(latest?.output_tax);
    const inputTax = n(latest?.input_tax_credit);
    const currentLiability = n(latest?.tax_payable) || Math.max(0, outputTax - inputTax);
    const itcUtilization = outputTax > 0 ? (Math.min(inputTax, outputTax) / outputTax) * 100 : 0;

    // ── 12-month trend ──
    const trendMap = new Map<string, { month: string; output_tax: number; input_tax: number; net_liability: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      const k = monthKey(d);
      trendMap.set(k, { month: k, output_tax: 0, input_tax: 0, net_liability: 0 });
    }
    for (const f of gst) {
      if (!f.due_date) continue;
      const k = monthKey(new Date(f.due_date));
      const row = trendMap.get(k);
      if (!row) continue;
      row.output_tax += n(f.output_tax);
      row.input_tax += n(f.input_tax_credit);
      row.net_liability += n(f.tax_payable) || Math.max(0, n(f.output_tax) - n(f.input_tax_credit));
    }
    const trend = Array.from(trendMap.values());

    // ── Forecast next 3 months (simple moving avg of last 6) ──
    const recent = trend.slice(-6).filter((t) => t.net_liability > 0);
    const avgLiab = recent.length ? recent.reduce((s, t) => s + t.net_liability, 0) / recent.length : currentLiability;
    const variance = recent.length
      ? Math.sqrt(recent.reduce((s, t) => s + (t.net_liability - avgLiab) ** 2, 0) / recent.length)
      : 0;
    const cv = avgLiab > 0 ? variance / avgLiab : 1;
    const confidence = cv < 0.2 ? "high" : cv < 0.5 ? "medium" : "low";
    const forecast = [1, 2, 3].map((i) => {
      const d = new Date(today);
      d.setMonth(d.getMonth() + i);
      return {
        month: monthKey(d),
        estimated_liability: avgLiab,
        confidence,
      };
    });

    // ── Upcoming deadlines (combined) ──
    const upcoming = [
      ...gst.filter((f) => f.due_date >= todayStr && f.status !== "filed").map((f) => ({
        type: "GST" as const,
        filing_type: f.return_type,
        period: f.filing_period,
        due_date: f.due_date,
        days_remaining: Math.ceil((new Date(f.due_date).getTime() - today.getTime()) / 86400_000),
      })),
      ...tds.filter((f) => f.due_date >= todayStr && f.status !== "filed").map((f) => ({
        type: "TDS" as const,
        filing_type: f.form_type,
        period: f.quarter,
        due_date: f.due_date,
        days_remaining: Math.ceil((new Date(f.due_date).getTime() - today.getTime()) / 86400_000),
      })),
    ].sort((a, b) => a.due_date.localeCompare(b.due_date));

    // ── Overdue counts ──
    const gstOverdue = gst.filter((f) => f.due_date < todayStr && f.status !== "filed").length;
    const tdsOverdue = tds.filter((f) => f.due_date < todayStr && f.status !== "filed").length;
    const overdueTotal = gstOverdue + tdsOverdue;

    // ── Alerts ──
    const alerts: any[] = [];
    if (overdueTotal > 0) {
      alerts.push({
        severity: "critical",
        title: "Overdue filings",
        message: `${overdueTotal} filing${overdueTotal > 1 ? "s" : ""} past due date. File immediately to avoid penalties.`,
        action: "Review filings",
      });
    }
    const within7 = upcoming.filter((u) => u.days_remaining <= 7).length;
    if (within7 > 0) {
      alerts.push({
        severity: "warning",
        title: "Filings due this week",
        message: `${within7} filing${within7 > 1 ? "s" : ""} due in the next 7 days.`,
      });
    }
    if (overallComplianceRate > 0 && overallComplianceRate < 80) {
      alerts.push({
        severity: "warning",
        title: "Compliance below 80%",
        message: `On-time filing rate is ${overallComplianceRate.toFixed(0)}%. Improve scheduling.`,
      });
    }
    if (itcUtilization > 0 && itcUtilization < 50 && outputTax > 0) {
      alerts.push({
        severity: "info",
        title: "Low ITC utilization",
        message: `Only ${itcUtilization.toFixed(0)}% of output tax offset via ITC. Review eligible credits.`,
      });
    }

    // ── Suggestions ──
    const suggestions: any[] = [];
    if (itcUtilization < 70 && outputTax > 0) {
      suggestions.push({
        priority: itcUtilization < 50 ? "high" : "medium",
        type: "itc_optimization",
        message: "Reconcile vendor invoices in GSTR-2B to claim missed input tax credit.",
        potential_savings: Math.max(0, outputTax * 0.7 - inputTax),
      });
    }
    if (overdueTotal > 0 || overallComplianceRate < 90) {
      suggestions.push({
        priority: "high",
        type: "compliance_improvement",
        message: "Set automated reminders 7 and 3 days before each due date to eliminate late filings.",
      });
    }
    if (avgLiab > 0) {
      suggestions.push({
        priority: "low",
        type: "tax_planning",
        message: `Set aside ~${Math.round(avgLiab).toLocaleString("en-IN")} per month to smooth tax cash flow.`,
      });
    }

    // ── Health badge ──
    let health = { label: "Healthy", color: "#1A6B3C" };
    if (overdueTotal > 0) health = { label: "At risk", color: "#C41E1E" };
    else if (overallComplianceRate > 0 && overallComplianceRate < 80) health = { label: "Watch", color: "#8B5A00" };

    return new Response(
      JSON.stringify({
        compliance: {
          overall_compliance_rate: overallComplianceRate,
          gst_compliance_rate: gstComplianceRate,
          tds_compliance_rate: tdsComplianceRate,
          health,
        },
        gst_summary: {
          total_filings: gst.length,
          filed: gstFiled.length,
          on_time: gstOnTime,
          overdue: gstOverdue,
        },
        tds_summary: {
          total_filings: tds.length,
          filed: tdsFiled.length,
          on_time: tdsOnTime,
          overdue: tdsOverdue,
        },
        tax_liability: {
          current_liability: currentLiability,
          output_tax: outputTax,
          input_tax: inputTax,
          itc_utilization_percent: itcUtilization,
          period: latest?.filing_period || null,
        },
        trend,
        forecast,
        upcoming_deadlines: upcoming.slice(0, 12),
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
