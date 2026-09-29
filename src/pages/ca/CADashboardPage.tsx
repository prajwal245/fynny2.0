import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { proxyExternalQuery } from "@/integrations/supabase/external";
import { useCAPortal } from "@/hooks/useCAPortal";
import {
  CA, CACard, CAHeading, CABadge, healthTone, inr, dateIN, CAEmpty, caTh, caTd, caNum,
} from "@/components/ca/portalUi";
import { CATasksSummaryCard } from "@/components/ca/CATasksSummaryCard";
import { CAOnboardingBanner } from "@/components/ca/CAOnboardingBanner";

import { timeAgo, useFirmIntelligence } from "@/hooks/useCAIntelligence";
import { isCloseReady } from "@/lib/caClose";

interface ClientRow {
  id: string;
  business_id: string | null;
  client_name: string;
  client_status: string | null;
}

interface Enriched extends ClientRow {
  cash_position: number | null;
  health_status: string | null;
  runway_months: number | null;
  burn_rate_current: number | null;
  next_gst_due: string | null;
  next_gst_type: string | null;
}

interface DueReminder {
  id: string;
  title: string;
  business_id: string | null;
  remind_at: string;
}

interface ExceptionRow {
  key: string;
  clientName: string;
  clientId: string | null;
  type: string;
  amount: number;
  daysOpen: number;
  path: string;
}

interface FirmBrain {
  narrative: string | null;
  risk_score: number | null;
  brain_last_run_at: string | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function workStatus(c: Enriched): { label: string; tone: "red" | "amber" | "grey" | "green" } {
  if (c.health_status === "critical") return { label: "Exception open", tone: "red" };
  if (c.health_status === "warning") return { label: "Review needed", tone: "amber" };
  if (c.cash_position === null) return { label: "Not linked", tone: "grey" };
  return { label: "Active", tone: "green" };
}

export default function CADashboardPage() {
  const { firmId } = useCAPortal();
  const { data: firmIntel } = useFirmIntelligence(firmId ?? null);
  const navigate = useNavigate();
  const [clients, setClients] = useState<Enriched[]>([]);
  const [dueToday, setDueToday] = useState<DueReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [brainLastRunAt, setBrainLastRunAt] = useState<string | null>(null);

  const [itcAtRisk, setItcAtRisk] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [weekFilings, setWeekFilings] = useState(0);
  const [closeReady, setCloseReady] = useState({ ready: 0, total: 0 });
  const [firmBrainData, setFirmBrainData] = useState<FirmBrain | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [isFirstRun, setIsFirstRun] = useState(false);
  // 0 = not first run, 1 = no clients, 2 = has client no docs, 3 = has docs needs review, 4 = complete
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [nbaMap, setNbaMap] = useState<Record<string, { action: string; path: string; tone: "red" | "gold" | "teal" }>>({});
  const [pendingVerificationCount, setPendingVerificationCount] = useState(0);

  useEffect(() => {
    if (!clients.length || !firmId) return;
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    let cancelled = false;

    const compute = async () => {
      const businessIds = clients.filter((c) => c.business_id).map((c) => c.business_id as string);
      if (!businessIds.length) return;

      let exceptions: { business_id: string; status: string; amount: number }[] = [];
      let compliance: { business_id: string; status: string; due_date: string; event_type: string }[] = [];
      const recentTxns = new Set<string>();
      const pendingChasers = new Set<string>();
      const pendingVerification = new Set<string>();

      try {
        const pendingVerifRes = await supabase
          .from("ca_document_extractions")
          .select("business_id", { count: "exact" })
          .eq("ca_firm_id", firmId)
          .eq("review_state", "pending_verification")
          .limit(200);
        for (const item of (pendingVerifRes.data ?? []) as { business_id: string | null }[]) {
          if (item.business_id) pendingVerification.add(item.business_id);
        }
        if (!cancelled) setPendingVerificationCount(pendingVerifRes.count ?? 0);
      } catch { /* silent */ }

      try {
        const excRes = await supabase
          .from("ca_exceptions").select("business_id, status, amount")
          .eq("ca_firm_id", firmId).neq("status", "resolved");
        exceptions = ((excRes.data ?? []) as unknown as typeof exceptions);
      } catch { /* silent */ }

      try {
        const compRes = await supabase
          .from("ca_compliance_events").select("business_id, status, due_date, event_type")
          .eq("ca_firm_id", firmId).in("business_id", businessIds).neq("status", "filed").lte("due_date", in3Days);
        compliance = ((compRes.data ?? []) as unknown as typeof compliance);
      } catch { /* silent */ }

      try {
        const txnRes = await supabase
          .from("bank_transactions").select("business_id, date")
          .in("business_id", businessIds)
          .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
          .limit(500);
        for (const t of (txnRes.data ?? []) as { business_id: string }[]) recentTxns.add(t.business_id);
      } catch { /* silent */ }

      try {
        const chaserRes = await (supabase as unknown as { from: (t: string) => any })
          .from("ca_chasers").select("business_id, status")
          .in("business_id", businessIds).eq("status", "pending").limit(200);
        for (const c of ((chaserRes?.data ?? []) as { business_id: string }[])) pendingChasers.add(c.business_id);
      } catch { /* table may not exist */ }

      const map: Record<string, { action: string; path: string; tone: "red" | "gold" | "teal" }> = {};
      const now = new Date();
      for (const c of clients) {
        const bid = c.business_id;
        if (!bid) continue;

        const topException = exceptions
          .filter((e) => e.business_id === bid)
          .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
        const overdueCompliance = compliance.filter((e) => e.business_id === bid && new Date(e.due_date) < now);
        const upcomingCompliance = compliance.filter((e) => e.business_id === bid && new Date(e.due_date) >= now);

        if (pendingVerification.has(bid)) {
          map[c.id] = { action: "Confirm Gmail document before ledger posting", path: "/ca/intake/inbox", tone: "red" };
        } else if (topException && (topException.amount ?? 0) > 10000) {
          map[c.id] = { action: `Resolve exception — ${inr(topException.amount)} at risk`, path: "/ca/exceptions", tone: "red" };
        } else if (overdueCompliance.length > 0) {
          map[c.id] = { action: `File overdue ${overdueCompliance[0]!.event_type ?? "return"}`, path: `/ca/clients/${c.id}`, tone: "red" };
        } else if (!recentTxns.has(bid)) {
          map[c.id] = { action: "Upload bank statement — no transactions this month", path: "/ca/intake/inbox", tone: "gold" };
        } else if (pendingChasers.has(bid)) {
          map[c.id] = { action: "Send pending chaser", path: "/ca/chaser", tone: "gold" };
        } else if (upcomingCompliance.length > 0) {
          map[c.id] = { action: `File ${upcomingCompliance[0]!.event_type ?? "return"} by ${upcomingCompliance[0]!.due_date}`, path: `/ca/clients/${c.id}`, tone: "teal" };
        }
      }
      if (cancelled) return;
      setNbaMap(map);
      console.log(`[fyn:nba] computed ${Object.keys(map).length} next-best-actions for ${firmId}`);
    };
    void compute();
    return () => { cancelled = true; };
  }, [clients, firmId]);



  useEffect(() => {
    console.log("[fyn:ca:portal-rebuild] v2 complete — zones 1-4 active, tab order updated, brain connected");
    console.log("[fyn:brain:wired] signals 1-5 active, recon opts personalized, chaser brain-suggested");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!firmId) return;
    (async () => {
      const { data } = await supabase.from("ca_firms").select("brain_last_run_at").eq("id", firmId).maybeSingle();
      if (!cancelled) setBrainLastRunAt((data as { brain_last_run_at: string | null } | null)?.brain_last_run_at ?? null);
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from("ca_clients")
        .select("id, business_id, client_name, client_status")
        .eq("ca_firm_id", firmId)
        .eq("is_demo", false)
        .order("created_at", { ascending: false });
      if (error) console.warn("[fyn:ca] ca_clients", error);

      const base = (rows as ClientRow[]) ?? [];
      const enriched: Enriched[] = await Promise.all(
        base.map(async (c) => {
          let metrics: any = null;
          let gst: any = null;
          if (c.business_id) {
            const liq = await proxyExternalQuery({
              table: "liquidity_metrics",
              business_id: c.business_id,
              select: "cash_position, health_status, runway_months, burn_rate_current",
              order: { column: "recorded_at", ascending: false },
              limit: 1,
            });
            if (liq.error) console.warn("[fyn:ca] liquidity_metrics", c.business_id, liq.error);
            metrics = liq.data?.[0] ?? null;

            const gstRes = await proxyExternalQuery({
              table: "gst_filings",
              business_id: c.business_id,
              select: "due_date, return_type, status",
              order: { column: "due_date", ascending: true },
              limit: 50,
            });
            if (gstRes.error) console.warn("[fyn:ca] gst_filings", c.business_id, gstRes.error);
            gst = (gstRes.data ?? []).find((g: any) => g.status !== "filed") ?? null;
          }

          return {
            ...c,
            cash_position: metrics?.cash_position ?? null,
            health_status: metrics?.health_status ?? null,
            runway_months: metrics?.runway_months ?? null,
            burn_rate_current: metrics?.burn_rate_current ?? null,
            next_gst_due: gst?.due_date ?? null,
            next_gst_type: gst?.return_type ?? null,
          };
        }),
      );

      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      const { data: reminders } = await supabase
        .from("ca_reminders")
        .select("id, title, business_id, remind_at")
        .eq("ca_firm_id", firmId)
        .eq("is_done", false)
        .gte("remind_at", startOfDay.toISOString())
        .lte("remind_at", endOfDay.toISOString())
        .order("remind_at", { ascending: true });

      if (cancelled) return;
      setClients(enriched);
      setDueToday((reminders as DueReminder[]) ?? []);
      setLoading(false);

      // Exception rows: overdue compliance events per client (limit 2 each)
      const withBusiness = enriched.filter((c) => c.business_id);
      const rowsPerClient = await Promise.all(
        withBusiness.map(async (c) => {
          const { data: evts } = await supabase
            .from("ca_compliance_events")
            .select("id, event_type, due_date, penalty_amount, status")
            .eq("business_id", c.business_id!)
            .neq("status", "filed")
            .lt("due_date", todayISO())
            .order("due_date", { ascending: true })
            .limit(2);
          return ((evts as any[]) ?? []).map((e): ExceptionRow => ({
            key: String(e.id),
            clientName: c.client_name,
            clientId: c.id,
            type: e.event_type ?? "Compliance",
            amount: Number(e.penalty_amount ?? 0),
            daysOpen: Math.max(0, Math.floor((Date.now() - new Date(e.due_date).getTime()) / 86400000)),
            path: `/ca/clients/${c.id}`,
          }));
        }),
      );
      // Reconciliation / ITC / TDS exceptions raised by the engines.
      const { data: engineExc } = await supabase
        .from("ca_exceptions")
        .select("id, business_id, source, reason_code, amount, status, created_at")
        .eq("ca_firm_id", firmId)
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(50);
      const byBusiness = new Map(enriched.filter((c) => c.business_id).map((c) => [c.business_id as string, c]));
      const engineRows = ((engineExc as any[]) ?? []).map((e): ExceptionRow => {
        const c = byBusiness.get(String(e.business_id));
        return {
          key: `exc:${e.id}`,
          clientName: c?.client_name ?? "Unknown client",
          clientId: c?.id ?? null,
          type: String(e.reason_code ?? e.source ?? "Exception"),
          amount: Number(e.amount ?? 0),
          daysOpen: Math.max(0, Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000)),
          path: c?.id ? `/ca/clients/${c.id}` : "/ca/exceptions",
        };
      });

      if (cancelled) return;
      setExceptions(
        [...rowsPerClient.flat(), ...engineRows].sort((a, b) => b.amount - a.amount).slice(0, 8),
      );

      console.log("[fyn:ca] portfolio mount", { firmId, clientCount: enriched.length });
    })();

    return () => { cancelled = true; };
  }, [firmId]);

  // ITC at risk
  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ca_itc_records")
        .select("total_itc")
        .eq("ca_firm_id", firmId)
        .eq("match_status", "mismatched")
        .eq("is_demo", false);
      if (cancelled) return;
      setItcAtRisk(((data as { total_itc: number | null }[]) ?? []).reduce((s, r) => s + Number(r.total_itc ?? 0), 0));
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  // Overdue count, week filings, close readiness
  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from("ca_clients")
        .select("business_id, client_status")
        .eq("ca_firm_id", firmId)
        .eq("is_demo", false);
      const all = ((rows as { business_id: string | null; client_status: string | null }[]) ?? []);
      const ids = all.map((r) => r.business_id).filter((x): x is string => !!x);
      if (ids.length === 0) {
        if (!cancelled) { setOverdueCount(0); setWeekFilings(0); setCloseReady({ ready: 0, total: 0 }); }
        return;
      }
      const today = todayISO();
      const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const { count: overdue } = await supabase
        .from("ca_compliance_events")
        .select("id", { count: "exact", head: true })
        .in("business_id", ids)
        .neq("status", "filed")
        .lt("due_date", today);

      const { count: week7 } = await supabase
        .from("ca_compliance_events")
        .select("id", { count: "exact", head: true })
        .in("business_id", ids)
        .neq("status", "filed")
        .gte("due_date", today)
        .lte("due_date", week);

      const activeIds = all
        .filter((r) => (r.client_status ?? "").toLowerCase() === "active" && r.business_id)
        .map((r) => r.business_id as string);

      const flags = await Promise.all(activeIds.map((bid) => isCloseReady(firmId, bid)));
      const ready = flags.filter(Boolean).length;

      if (cancelled) return;
      setOverdueCount(overdue ?? 0);
      setWeekFilings(week7 ?? 0);
      setCloseReady({ ready, total: activeIds.length });
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  // Firm brain narrative
  useEffect(() => {
    if (!firmId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("ca_firm_intelligence")
          .select("narrative, risk_score, brain_last_run_at")
          .eq("ca_firm_id", firmId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setFirmBrainData((data as FirmBrain | null) ?? null);
      } catch {
        /* table may not exist */
      }
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  // First-run onboarding detection from real data
  useEffect(() => {
    if (!firmId || loading) return;
    let cancelled = false;

    if (clients.length === 0) {
      setIsFirstRun(true);
      setOnboardingStep(1);
      return;
    }

    const checkDocs = async () => {
      const businessIds = clients
        .filter((c) => c.business_id)
        .map((c) => c.business_id as string);
      if (businessIds.length === 0) {
        if (!cancelled) { setIsFirstRun(true); setOnboardingStep(2); }
        return;
      }

      const { count } = await supabase
        .from("ca_document_extractions")
        .select("id", { count: "exact", head: true })
        .in("business_id", businessIds)
        .eq("ca_firm_id", firmId);
      if (cancelled) return;
      if (!count || count === 0) {
        setIsFirstRun(true);
        setOnboardingStep(2);
        return;
      }

      const { count: pending } = await supabase
        .from("ca_document_extractions")
        .select("id", { count: "exact", head: true })
        .in("business_id", businessIds)
        .eq("ca_firm_id", firmId)
        .eq("review_state", "needs_review");
      if (cancelled) return;
      if (pending && pending > 0) {
        setIsFirstRun(true);
        setOnboardingStep(3);
        return;
      }

      setIsFirstRun(false);
      setOnboardingStep(4);
      try {
        void supabase.from("ca_brain_events").insert({
          ca_firm_id: firmId,
          business_id: null,
          event_type: "onboarding_complete",
          payload: { client_count: clients.length, completed_at: new Date().toISOString() },
        });
      } catch { /* non-blocking */ }
    };

    void checkDocs();
    return () => { cancelled = true; };
  }, [firmId, clients, loading]);

  const total = clients.length;

  const active = clients.filter((c) => (c.client_status ?? "").toLowerCase() === "active").length;

  const actionsToday = dueToday.length + overdueCount + pendingVerificationCount;
  const now = new Date();
  const daysToMonthEnd = Math.max(
    0,
    Math.ceil((new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() - now.getTime()) / 86400000),
  );
  const readyPct = closeReady.total > 0 ? Math.round((closeReady.ready / closeReady.total) * 100) : 0;

  const cardStyle = {
    background: CA.card,
    border: "1px solid rgba(23,18,8,0.09)",
    borderRadius: 16,
    padding: 18,
  } as const;
  const labelStyle = {
    fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase" as const,
    letterSpacing: "0.12em", color: CA.faint, fontWeight: 700,
  };
  const sectionHeading = {
    fontFamily: CA.sans, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const,
    letterSpacing: "0.14em", color: CA.faint, marginBottom: 10,
  };

  const riskTone = (score: number | null | undefined) =>
    score == null ? "grey" : score < 30 ? "green" : score < 60 ? "amber" : "red";

  const summary = [
    { label: "Total clients", value: String(total) },
    { label: "Active", value: String(active) },
    { label: "Exceptions open", value: String(exceptions.length) },
    { label: "Filings this week", value: String(weekFilings) },
  ];

  return (
    <div>
      {isFirstRun && onboardingStep > 0 && onboardingStep < 4 && (
        <CAOnboardingBanner
          step={onboardingStep as 1 | 2 | 3 | 4}
          firmId={firmId ?? ""}
          firstClientId={clients[0]?.id ?? null}
        />
      )}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>

        <CAHeading>Portfolio</CAHeading>
        <span style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint }}>
          Intelligence updated {timeAgo(firmIntel?.brain_last_run_at ?? brainLastRunAt)}
        </span>
      </div>

      {dueToday.length > 0 && (
        <CACard style={{ marginBottom: 18, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderColor: "rgba(179,38,30,0.35)" }}>
          <CABadge tone="red">Due today</CABadge>
          {dueToday.map((r) => {
            const client = clients.find((c) => c.business_id && c.business_id === r.business_id);
            return (
              <button
                key={r.id}
                onClick={() => client && navigate(`/ca/clients/${client.id}`)}
                style={{
                  background: "none", border: `0.5px solid ${CA.line}`, borderRadius: 8, padding: "6px 10px",
                  fontFamily: CA.sans, fontSize: 12.5, color: CA.ink, cursor: client ? "pointer" : "default",
                }}
              >
                <strong>{client?.client_name ?? "Client"}</strong> · {r.title} ·{" "}
                {new Date(r.remind_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </button>
            );
          })}
        </CACard>
      )}

      {/* ZONE 1 — Command strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Actions today</div>
          <div style={{ fontFamily: CA.mono, fontSize: 32, fontWeight: 700, marginTop: 6, color: actionsToday > 0 ? "#A93838" : "#1F5A46", fontVariantNumeric: "tabular-nums" }}>
            {actionsToday}
          </div>
          <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 4 }}>
            {pendingVerificationCount} verifications, {dueToday.length} reminders, {overdueCount} overdue filings
          </div>
          {actionsToday > 0 && (
            <span style={{ display: "inline-block", marginTop: 8, background: "rgba(169,56,56,0.10)", color: "#A93838", fontFamily: CA.sans, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999 }}>
              Needs attention
            </span>
          )}
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>ITC at risk</div>
          <div style={{ fontFamily: CA.mono, fontSize: 28, fontWeight: 700, marginTop: 6, color: itcAtRisk > 0 ? "#A93838" : "#1F5A46", fontVariantNumeric: "tabular-nums" }}>
            {inr(itcAtRisk)}
          </div>
          <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 4 }}>
            {itcAtRisk > 0 ? "across mismatched records" : "All ITC matched"}
          </div>
          {itcAtRisk > 0 && (
            <button
              onClick={() => navigate("/ca/itc-recon")}
              style={{ background: "transparent", border: "none", color: "#A93838", fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 8, padding: 0 }}
            >
              Resolve
            </button>
          )}
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Close readiness</div>
          <div style={{ fontFamily: CA.sans, fontSize: 15, fontWeight: 600, color: CA.ink, marginTop: 8 }}>
            {closeReady.ready} of {closeReady.total} clients ready
          </div>
          <div style={{ background: "rgba(23,18,8,0.08)", borderRadius: 999, height: 6, marginTop: 8 }}>
            <div style={{ width: `${readyPct}%`, background: "#1F5A46", borderRadius: 999, height: 6 }} />
          </div>
          <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 8 }}>
            {daysToMonthEnd} days until month end
          </div>
        </div>
      </div>

      {/* ZONE 2 — Exception queue */}
      <div style={{ marginBottom: 20 }}>
        <div style={sectionHeading}>Open exceptions</div>
        {exceptions.length === 0 ? (
          <CACard style={{ padding: 16, borderColor: "rgba(31,90,70,0.35)" }}>
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: "#1F5A46", fontWeight: 600 }}>
              No open exceptions. Portfolio is clean.
            </div>
          </CACard>
        ) : (
          <>
            <CACard style={{ overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={caTh}>Client</th>
                  <th style={caTh}>Type</th>
                  <th style={{ ...caTh, textAlign: "right" }}>Amount</th>
                  <th style={{ ...caTh, textAlign: "right" }}>Days open</th>
                  <th style={caTh}>Action</th>
                </tr></thead>
                <tbody>
                  {exceptions.map((e) => (
                    <tr key={e.key}>
                      <td style={caTd}>{e.clientName}</td>
                      <td style={caTd}>{e.type}</td>
                      <td style={caNum}>{inr(e.amount)}</td>
                      <td style={caNum}>{e.daysOpen}</td>
                      <td style={caTd}>
                        <button
                          onClick={() => navigate(e.path)}
                          style={{ background: "none", border: "none", padding: 0, color: "#A93838", fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CACard>
            <button
              onClick={() => navigate("/ca/exceptions")}
              style={{ background: "none", border: "none", padding: 0, marginTop: 10, color: "#A93838", fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            >
              View all
            </button>
          </>
        )}
      </div>

      {/* ZONE 3 — Clients and brain brief */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div>
          <div style={sectionHeading}>Clients</div>
          {loading ? (
            <CACard><CAEmpty title="Loading portfolio…" /></CACard>
          ) : clients.length === 0 ? (
            <>
              <CACard>
                <CAEmpty
                  title="No clients yet"
                  hint="Add a client using the button below. Once added, upload their bank statement from the Intake inbox to begin."
                />
              </CACard>
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => navigate("/ca/clients/add")}
                  style={{
                    background: "#A93838", color: "#F7F1E6", border: "none", borderRadius: 10,
                    padding: "10px 20px", fontFamily: CA.sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Add first client
                </button>
              </div>
            </>

          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {clients.map((c) => {
                const ws = workStatus(c);
                return (
                  <CACard key={c.id} style={{ padding: 18, cursor: "pointer" }} className="hover:shadow-xs transition-shadow">
                    <div onClick={() => navigate(`/ca/clients/${c.id}`)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                        <div style={{ fontFamily: CA.serif, fontSize: 15.5, fontWeight: 700, color: CA.ink }}>{c.client_name}</div>
                        <CABadge tone={healthTone(c.health_status)}>{c.health_status ?? "no data"}</CABadge>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <CABadge tone={ws.tone}>{ws.label}</CABadge>
                      </div>
                      {nbaMap[c.id] && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const nba = nbaMap[c.id]!;
                              navigate(nba.path);
                              try {
                                if (firmId) {
                                  void supabase.from("ca_brain_events").insert({
                                    ca_firm_id: firmId,
                                    business_id: c.business_id ?? undefined,
                                    event_type: "nba_clicked",
                                    payload: { action: nba.action, tone: nba.tone, client_id: c.id },
                                  });
                                }
                              } catch { /* non-blocking */ }
                            }}
                            style={{
                              display: "flex", alignItems: "center", gap: 6, width: "100%",
                              background: nbaMap[c.id]!.tone === "red" ? "rgba(169,56,56,0.08)" : nbaMap[c.id]!.tone === "gold" ? "rgba(139,105,20,0.08)" : "rgba(31,90,70,0.08)",
                              border: `1px solid ${nbaMap[c.id]!.tone === "red" ? "rgba(169,56,56,0.20)" : nbaMap[c.id]!.tone === "gold" ? "rgba(139,105,20,0.18)" : "rgba(31,90,70,0.18)"}`,
                              borderRadius: 8, padding: "7px 10px", cursor: "pointer", textAlign: "left",
                              fontFamily: CA.sans, fontSize: 12, fontWeight: 600,
                              color: nbaMap[c.id]!.tone === "red" ? "#A93838" : nbaMap[c.id]!.tone === "gold" ? "#8B6914" : "#1F5A46",
                            }}
                          >
                            {nbaMap[c.id]!.action}
                          </button>
                        </div>
                      )}
                      <div style={{ marginTop: 12, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                        Next GST due: {c.next_gst_due ? `${dateIN(c.next_gst_due)}${c.next_gst_type ? ` · ${c.next_gst_type}` : ""}` : "—"}
                      </div>
                    </div>
                  </CACard>
                );
              })}
            </div>
          )}
        </div>

        <CACard style={{ padding: 18 }}>
          <div style={{ fontFamily: CA.sans, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: CA.faint, fontWeight: 700 }}>
            Fynny says
          </div>
          {firmBrainData?.narrative ? (
            <>
              <div style={{ marginTop: 10 }}>
                <CABadge tone={riskTone(firmBrainData.risk_score) as any}>
                  Risk score: {firmBrainData.risk_score ?? "—"}
                </CABadge>
              </div>
              <p style={{ fontFamily: CA.sans, fontSize: 13.5, lineHeight: 1.6, color: CA.muted, marginTop: 12 }}>
                {firmBrainData.narrative}
              </p>
              <div style={{ fontFamily: CA.sans, fontSize: 11, color: CA.faint, marginTop: 8 }}>
                Updated {timeAgo(firmBrainData.brain_last_run_at)}
              </div>
            </>
          ) : (
            <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 10 }}>
              Intelligence runs at 2 AM IST. Check back tomorrow morning.
            </p>
          )}
        </CACard>
      </div>

      {/* ZONE 4 — Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 22 }}>
        {summary.map((s) => (
          <CACard key={s.label} style={{ padding: "16px 18px" }}>
            <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: CA.faint }}>
              {s.label}
            </div>
            <div style={{ fontFamily: CA.mono, fontSize: 22, fontWeight: 600, color: CA.ink, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </div>
          </CACard>
        ))}
      </div>

      <CATasksSummaryCard />
    </div>
  );
}
