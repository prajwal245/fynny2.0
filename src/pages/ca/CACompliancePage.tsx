/**
 * Compliance OS — live filing calendar for the firm's portfolio.
 * Reads ca_compliance_events, auto-prepares returns into working papers, and
 * records filings. Updates live over realtime.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { CA, CABadge, CACard, CAButton, CAEmpty, caTd, caTh, dateIN, inr, type Tone } from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";
import { GspLimitationBanner } from "@/components/ca/GspLimitationBanner";
import { ICAIGate } from "@/components/ca/ICAIGate";
import { autoPrepareReturn } from "@/lib/caCompliance.functions";
import { penaltyEstimate } from "@/lib/caPenalty";
import { useFirmClientIntelligence, filingRiskBand, lateSharePct } from "@/hooks/useCAIntelligence";
import { signalBrain } from "@/lib/caBrainSignals";

const DAY = 86_400_000;
type TabKey = "upcoming" | "overdue" | "filed";

interface EventRow {
  id: string;
  business_id: string;
  event_type: string;
  filing_period: string;
  due_date: string;
  status: string;
  filing_date: string | null;
  penalty_amount: number | null;
  late_fee_amount: number | null;
}

const PREPARABLE: Record<string, string> = {
  GSTR1: "GSTR1",
  GSTR3B: "GSTR3B",
  TDS_QUARTERLY: "TDS_26Q",
  ITR: "ITR",
};

const startOfToday = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime();
};

const daysFromToday = (due: string) => Math.round((new Date(due).getTime() - startOfToday()) / DAY);

export default function CACompliancePage() {
  const { firmId, userId } = useCAPortal();
  const { byBusiness: intel } = useFirmClientIntelligence(firmId);
  const { can, hasICAI, setHasICAI } = useCARole();
  const [icaiGateEvent, setIcaiGateEvent] = useState<EventRow | null>(null);
  const navigate = useNavigate();
  const prepare = useServerFn(autoPrepareReturn);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [clients, setClients] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firmId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: evs, error }, { data: cls }] = await Promise.all([
      supabase
        .from("ca_compliance_events")
        .select("id, business_id, event_type, filing_period, due_date, status, filing_date, penalty_amount, late_fee_amount")
        .eq("ca_firm_id", firmId)
        .order("due_date", { ascending: true }),
      supabase.from("ca_clients").select("business_id, client_name").eq("ca_firm_id", firmId),
    ]);
    if (error) toast.error(error.message);
    setEvents((evs ?? []) as EventRow[]);
    const map = new Map<string, string>();
    for (const c of (cls ?? []) as { business_id: string | null; client_name: string }[]) {
      if (c.business_id) map.set(c.business_id, c.client_name);
    }
    setClients(map);
    setLoading(false);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates on filings and alerts.
  useEffect(() => {
    if (!firmId) return;
    const channel = supabase
      .channel(`ca-compliance-${firmId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ca_compliance_events", filter: `ca_firm_id=eq.${firmId}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ca_notifications", filter: `ca_firm_id=eq.${firmId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [firmId, load]);

  const buckets = useMemo(() => {
    const today = startOfToday();
    const upcoming: EventRow[] = [];
    const overdue: EventRow[] = [];
    const filed: EventRow[] = [];
    for (const e of events) {
      const due = new Date(e.due_date).getTime();
      if (e.status === "filed") filed.push(e);
      else if (due < today) overdue.push(e);
      else if (due - today <= 30 * DAY) upcoming.push(e);
    }
    return { upcoming, overdue, filed };
  }, [events]);

  const rows = buckets[tab];

  const totalPenalty = buckets.overdue.reduce(
    (s, e) => s + (Number(e.penalty_amount ?? 0) + Number(e.late_fee_amount ?? 0) || penaltyEstimate(e.event_type, e.due_date)),
    0,
  );

  const onAutoPrepare = async (e: EventRow) => {
    const returnType = PREPARABLE[e.event_type];
    if (!firmId || !returnType) return;
    setBusyId(e.id);
    try {
      const res = await prepare({
        data: {
          firm_id: firmId,
          client_id: e.business_id,
          business_id: e.business_id,
          return_type: returnType,
          period: e.filing_period,
        },
      });
      toast.success(`${res.return_type} ${res.period} prepared from ${res.doc_count} document(s)`);
      navigate({ to: "/ca/working-papers" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-prepare failed");
    } finally {
      setBusyId(null);
    }
  };

  const onMarkFiled = async (e: EventRow) => {
    if (!firmId) return;
    setBusyId(e.id);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("ca_compliance_events")
      .update({
        status: "filed",
        filing_date: nowIso.slice(0, 10),
        filed_at: nowIso,
        filed_by: userId,
        updated_at: nowIso,
      })
      .eq("id", e.id)
      .eq("ca_firm_id", firmId);
    setBusyId(null);
    if (error) toast.error(error.message);
    else {
      const daysLate = e.due_date && new Date(e.due_date) < new Date()
        ? Math.floor((Date.now() - new Date(e.due_date).getTime()) / DAY)
        : 0;
      void signalBrain(firmId, e.business_id, "compliance_filed", {
        event_type: e.event_type,
        days_late: daysLate,
        period: e.filing_period,
      });
      toast.success(`${e.event_type} ${e.filing_period} marked as filed`);
      void load();
    }
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: buckets.upcoming.length },
    { key: "overdue", label: "Overdue", count: buckets.overdue.length },
    { key: "filed", label: "Filed", count: buckets.filed.length },
  ];

  const emptyCopy: Record<TabKey, { title: string; hint: string }> = {
    upcoming: { title: "Nothing due in the next 30 days", hint: "Generate a compliance calendar from an engagement to populate filings." },
    overdue: { title: "No overdue filings", hint: "Every filing in your portfolio is on or ahead of its due date." },
    filed: { title: "No filings recorded yet", hint: "Filings you mark as filed appear here with their filing date." },
  };

  return (
    <div>
      <ModuleHeader
        title="Compliance OS"
        subtitle="Every statutory filing across your portfolio — due dates, penalty exposure, auto-prepared returns and sign-off."
      />
      <GspLimitationBanner />

      <StatStrip
        items={[
          { label: "Due in 30 days", value: String(buckets.upcoming.length) },
          { label: "Overdue", value: String(buckets.overdue.length) },
          { label: "Penalty accruing", value: inr(totalPenalty) },
          { label: "Filed", value: String(buckets.filed.length) },
        ]}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              fontFamily: CA.sans,
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 14px",
              borderRadius: 999,
              cursor: "pointer",
              border: `0.5px solid ${tab === t.key ? CA.teal : CA.line}`,
              background: tab === t.key ? CA.tealSoft : "#fff",
              color: tab === t.key ? CA.teal : CA.muted,
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <CACard style={{ padding: rows.length ? 0 : 24, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24, fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading filings…</div>
        ) : !rows.length ? (
          <CAEmpty title={emptyCopy[tab].title} hint={emptyCopy[tab].hint} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Client", "Return", "Period", "Due", "Status", tab === "filed" ? "Filed on" : "Days", "Penalty risk", ""].map((h) => (
                    <th key={h} style={caTh}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const days = daysFromToday(e.due_date);
                  const overdue = tab === "overdue";
                  const penalty =
                    Number(e.penalty_amount ?? 0) + Number(e.late_fee_amount ?? 0) || penaltyEstimate(e.event_type, e.due_date);
                  const statusTone: Tone = e.status === "filed" ? "green" : overdue ? "red" : days <= 3 ? "amber" : "grey";
                  const canPrepare = !!PREPARABLE[e.event_type] && can("process");
                  return (
                    <tr key={e.id}>
                      <td style={caTd}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {clients.get(e.business_id) ?? "—"}
                          {(() => {
                            const score = intel.get(e.business_id)?.filing_risk_score ?? null;
                            const band = filingRiskBand(score);
                            if (!band) return null;
                            return (
                              <span title={`This client has filed late in ${lateSharePct(score)}% of past filings.`}>
                                <CABadge tone={band.tone}>{band.label}</CABadge>
                              </span>
                            );
                          })()}
                        </span>
                      </td>
                      <td style={{ ...caTd, fontWeight: 600 }}>{e.event_type.replace(/_/g, " ")}</td>
                      <td style={caTd}>{e.filing_period}</td>
                      <td style={caTd}>{dateIN(e.due_date)}</td>
                      <td style={caTd}>
                        <CABadge tone={statusTone}>{e.status}</CABadge>
                      </td>
                      <td style={caTd}>
                        {tab === "filed"
                          ? dateIN(e.filing_date)
                          : overdue
                            ? `${Math.abs(days)} days late`
                            : `${days} days left`}
                      </td>
                      <td style={{ ...caTd, fontFamily: CA.mono, color: overdue ? CA.red : CA.muted, fontWeight: overdue ? 700 : 400 }}>
                        {e.status === "filed"
                          ? "—"
                          : overdue
                            ? `${inr(penalty)} accruing over ${Math.abs(days)} days`
                            : `${inr(penalty)} if missed`}
                      </td>
                      <td style={{ ...caTd, textAlign: "right", whiteSpace: "nowrap" }}>
                        {e.status !== "filed" && (
                          <span style={{ display: "inline-flex", gap: 8 }}>
                            {canPrepare && (
                              <CAButton variant="ghost" disabled={busyId === e.id} onClick={() => void onAutoPrepare(e)}>
                                {busyId === e.id ? "Preparing…" : "Auto-prepare"}
                              </CAButton>
                            )}
                            {can("process") && (
                              <CAButton
                                disabled={busyId === e.id}
                                onClick={() => { if (!hasICAI) { setIcaiGateEvent(e); return; } void onMarkFiled(e); }}
                              >
                                Mark filed
                              </CAButton>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CACard>
      {icaiGateEvent && (
        <ICAIGate
          actionLabel="Filing a compliance return"
          onUnlocked={() => { const e = icaiGateEvent; setIcaiGateEvent(null); setHasICAI(true); void onMarkFiled(e); }}
          onCancel={() => setIcaiGateEvent(null)}
        />
      )}
    </div>
  );
}
