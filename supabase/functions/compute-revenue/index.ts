// compute-revenue — recomputes revenue intelligence for a business.
//
// Writes to the external Supabase project (financial intelligence store):
//   - revenue_metrics (mrr, arr, growth, customers, arpu, churn_rate, ltv,
//     at_risk_customers, churned_customers)
//   - cohort_analysis (monthly cohorts, M1..M6 retention + revenue)
//   - churn_signals  (customers with no invoice for >= 60 days)
//
// Auth: caller must be signed in on Lovable Cloud and own the business_id
// (or be a platform admin). The external project is written with the caller's
// JWT so its RLS policies apply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") as string;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const EXTERNAL_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ??
  "https://wiknwxniwqvsxgyzqqxu.supabase.co";
const EXTERNAL_ANON = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpa253eG5pd3F2c3hneXpxcXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzc1MTksImV4cCI6MjA5MTgxMzUxOX0.MVIp_hMUZsiMQ-LFulVdYaFkGonNk5WwdcHYWsx__qY";
const EXTERNAL_SERVICE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return typeof x === "number" && isFinite(x) ? x : 0;
};

/** YYYY-MM key for a date string. */
const monthKey = (d: string): string => new Date(d).toISOString().slice(0, 7);

/** Whole-month distance between two YYYY-MM keys. */
const monthDiff = (from: string, to: string): number => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

interface Invoice {
  id: string;
  business_id: string;
  customer_id: string | null;
  invoice_date: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const businessId: string | undefined = body.business_id || body.org_id;
    if (!businessId) return json({ error: "business_id required" }, 400);

    // ── AuthN + AuthZ on Lovable Cloud ──────────────────────────────────
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const [{ data: profile }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("business_id").eq("user_id", userData.user.id).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userData.user.id),
    ]);
    const isAdmin = (roles || []).some((r: { role: string }) =>
      ["admin", "super_admin", "ops_admin", "analyst"].includes(r.role)
    );
    if (!isAdmin && profile?.business_id !== businessId) return json({ error: "Forbidden" }, 403);

    // ── External client (financial intelligence store) ──────────────────
    const ext = EXTERNAL_SERVICE
      ? createClient(EXTERNAL_URL, EXTERNAL_SERVICE)
      : createClient(EXTERNAL_URL, EXTERNAL_ANON, {
        global: { headers: { Authorization: authHeader, apikey: EXTERNAL_ANON } },
      });

    // ── Source data ─────────────────────────────────────────────────────
    const { data: invRows, error: invErr } = await ext
      .from("invoices")
      .select("id,business_id,customer_id,invoice_date,total_amount,paid_amount,status")
      .eq("business_id", businessId)
      .order("invoice_date", { ascending: true });
    if (invErr) throw invErr;

    const invoices = ((invRows || []) as Invoice[]).filter((i) => i.invoice_date);
    if (invoices.length === 0) {
      return json({
        success: true,
        business_id: businessId,
        invoices: 0,
        cohorts: 0,
        churn_signals: 0,
        ltv: 0,
        message: "No invoices for this business — nothing to compute.",
      });
    }

    const customerIds = [...new Set(invoices.map((i) => i.customer_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (customerIds.length) {
      const { data: custRows } = await ext
        .from("customers")
        .select("id,customer_name")
        .eq("business_id", businessId)
        .in("id", customerIds);
      for (const c of (custRows || []) as { id: string; customer_name: string | null }[]) {
        if (c.customer_name) nameById.set(c.id, c.customer_name);
      }
    }

    const amountOf = (i: Invoice) => n(i.paid_amount) || n(i.total_amount);

    // ── Headline revenue metrics ────────────────────────────────────────
    const byMonth = new Map<string, number>();
    for (const i of invoices) {
      const k = monthKey(i.invoice_date);
      byMonth.set(k, (byMonth.get(k) || 0) + amountOf(i));
    }
    const months = [...byMonth.keys()].sort();
    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const mrr = byMonth.get(lastMonth) || 0;
    const prevMrr = prevMonth ? byMonth.get(prevMonth) || 0 : 0;
    const arr = mrr * 12;
    const growthRate = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0;

    // ── Per-customer aggregates ─────────────────────────────────────────
    type Agg = { total: number; first: string; last: string; months: Set<string> };
    const perCustomer = new Map<string, Agg>();
    for (const i of invoices) {
      const cid = i.customer_id;
      if (!cid) continue;
      const a = perCustomer.get(cid) ??
        { total: 0, first: i.invoice_date, last: i.invoice_date, months: new Set<string>() };
      a.total += amountOf(i);
      if (i.invoice_date < a.first) a.first = i.invoice_date;
      if (i.invoice_date > a.last) a.last = i.invoice_date;
      a.months.add(monthKey(i.invoice_date));
      perCustomer.set(cid, a);
    }

    const customerCount = perCustomer.size;
    const totalRevenue = [...perCustomer.values()].reduce((s, a) => s + a.total, 0);
    const arpu = customerCount > 0 ? totalRevenue / customerCount : 0;

    // ── LTV: avg of (customer total revenue / active months) ────────────
    let ltvSum = 0;
    for (const a of perCustomer.values()) {
      const activeMonths = Math.max(1, monthDiff(monthKey(a.first), monthKey(a.last)) + 1);
      ltvSum += a.total / activeMonths;
    }
    const ltv = customerCount > 0 ? ltvSum / customerCount : 0;

    // ── Cohort analysis ─────────────────────────────────────────────────
    // cohort_month = month of the customer's first invoice.
    const cohortMembers = new Map<string, string[]>();
    for (const [cid, a] of perCustomer) {
      const k = monthKey(a.first);
      const arr2 = cohortMembers.get(k) ?? [];
      arr2.push(cid);
      cohortMembers.set(k, arr2);
    }
    // revenue per (customer, month)
    const custMonthRevenue = new Map<string, number>();
    for (const i of invoices) {
      if (!i.customer_id) continue;
      const k = `${i.customer_id}|${monthKey(i.invoice_date)}`;
      custMonthRevenue.set(k, (custMonthRevenue.get(k) || 0) + amountOf(i));
    }
    const addMonths = (key: string, add: number): string => {
      const [y, m] = key.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + add, 1));
      return d.toISOString().slice(0, 7);
    };

    const cohortRows = [...cohortMembers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohortMonth, members]) => {
        const row: Record<string, unknown> = {
          business_id: businessId,
          cohort_month: cohortMonth,
          cohort_size: members.length,
        };
        for (let m = 1; m <= 6; m++) {
          const target = addMonths(cohortMonth, m);
          let retained = 0;
          let revenue = 0;
          for (const cid of members) {
            const rev = custMonthRevenue.get(`${cid}|${target}`);
            if (rev !== undefined) {
              retained += 1;
              revenue += rev;
            }
          }
          row[`retained_m${m}`] = retained;
          row[`revenue_m${m}`] = Math.round(revenue * 100) / 100;
        }
        return row;
      });

    let cohortsWritten = 0;
    if (cohortRows.length) {
      const { error: cohortErr } = await ext
        .from("cohort_analysis")
        .upsert(cohortRows, { onConflict: "business_id,cohort_month" });
      if (cohortErr) console.error("[compute-revenue] cohort upsert failed:", cohortErr.message);
      else cohortsWritten = cohortRows.length;
    }

    // ── Churn signals: no invoice for >= 60 days ────────────────────────
    const nowMs = Date.now();
    const signals: Record<string, unknown>[] = [];
    const activeCustomerIds: string[] = [];
    for (const [cid, a] of perCustomer) {
      const days = Math.floor((nowMs - new Date(a.last).getTime()) / 86_400_000);
      if (days >= 60) {
        signals.push({
          business_id: businessId,
          customer_id: cid,
          customer_name: nameById.get(cid) ?? cid,
          last_invoice_date: a.last.slice(0, 10),
          days_since_invoice: days,
          signal_type: "no_recent_invoice",
          severity: days >= 90 ? "critical" : "warning",
          detected_at: new Date().toISOString(),
        });
      } else {
        activeCustomerIds.push(cid);
      }
    }

    let signalsWritten = 0;
    if (signals.length) {
      const { error: churnErr } = await ext
        .from("churn_signals")
        .upsert(signals, { onConflict: "business_id,customer_id" });
      if (churnErr) console.error("[compute-revenue] churn upsert failed:", churnErr.message);
      else signalsWritten = signals.length;
    }
    // Customers that recovered (invoiced within 60d) should not keep a signal.
    if (activeCustomerIds.length) {
      await ext
        .from("churn_signals")
        .delete()
        .eq("business_id", businessId)
        .in("customer_id", activeCustomerIds);
    }

    const atRisk = signals.filter((s) => s.severity === "warning").length;
    const churned = signals.filter((s) => s.severity === "critical").length;
    const churnRate = customerCount > 0 ? (churned / customerCount) * 100 : 0;

    // ── revenue_metrics (keyed by org_id in the external store) ─────────
    const periodStart = `${lastMonth}-01`;
    const periodEndDate = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0));
    const metrics = {
      org_id: businessId,
      period_start: periodStart,
      period_end: periodEndDate.toISOString().slice(0, 10),
      period_type: "monthly",
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      net_revenue: Math.round(totalRevenue * 100) / 100,
      revenue_growth_rate: Math.round(growthRate * 100) / 100,
      customer_count: customerCount,
      arpu: Math.round(arpu * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      ltv_estimate: Math.round(ltv * 100) / 100,
      churn_rate: Math.round(churnRate * 100) / 100,
      at_risk_customers: atRisk,
      churned_customers: churned,
    };

    const { data: existing } = await ext
      .from("revenue_metrics")
      .select("id")
      .eq("org_id", businessId)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await ext.from("revenue_metrics").update(metrics).eq("id", existing.id);
      if (error) console.error("[compute-revenue] metrics update failed:", error.message);
    } else {
      const { error } = await ext.from("revenue_metrics").insert(metrics);
      if (error) console.error("[compute-revenue] metrics insert failed:", error.message);
    }

    return json({
      success: true,
      business_id: businessId,
      invoices: invoices.length,
      cohorts: cohortsWritten,
      churn_signals: signalsWritten,
      at_risk_customers: atRisk,
      churned_customers: churned,
      ltv: metrics.ltv,
      mrr: metrics.mrr,
      arr: metrics.arr,
    });
  } catch (e) {
    console.error("[compute-revenue] error", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
