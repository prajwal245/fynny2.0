import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CABadge, CACard, CAButton, CAEmpty, caInputStyle } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, StatStrip, StateChip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";
import {
  computeReadiness,
  isCloseReady,
  periodLabel,
  recentPeriods,
  reopenPeriod,
  saveReadiness,
  signOffPeriod,
  type ClosePeriodRow,
  type CloseReadiness,
} from "@/lib/caClose";

/** Logs a completed close checklist once per client per period. */
async function logCloseComplete(firmId: string, businessId: string, period: string, score: number) {
  const { data: seen } = await supabase
    .from("ca_audit_events")
    .select("id")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("action", "close_step_completed")
    .eq("detail->>period", period)
    .limit(1);
  if ((seen ?? []).length) return;
  await logCAAudit({
    firmId,
    businessId,
    entityType: "close_period",
    entityId: businessId,
    action: "close_step_completed",
    detail: { period, score },
  });
}

export default function CAClosePage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CAClosePage mounted"); }, []);
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients, isLoading: clientsLoading } = useCAClientOptions();

  const periods = useMemo(() => recentPeriods(12), []);
  const [businessId, setBusinessId] = useState("");
  const [period, setPeriod] = useState(periods[0]);
  const [readiness, setReadiness] = useState<CloseReadiness | null>(null);
  const [row, setRow] = useState<ClosePeriodRow | null>(null);
  const [history, setHistory] = useState<ClosePeriodRow[]>([]);
  const [running, setRunning] = useState(false);
  const [portfolioReady, setPortfolioReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const loadHistory = useCallback(async () => {
    if (!firmId || !businessId) return;
    const { data } = await supabase
      .from("ca_close_periods")
      .select("id, business_id, period, status, readiness_score, checklist, signed_off_at, signed_off_by")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .order("period", { ascending: false })
      .limit(12);
    setHistory((data ?? []) as ClosePeriodRow[]);
  }, [firmId, businessId]);

  useEffect(() => {
    setReadiness(null);
    setRow(null);
    void loadHistory();
  }, [loadHistory]);

  const run = async () => {
    if (!firmId || !businessId) return toast.error("Pick a client first");
    setRunning(true);
    try {
      const result = await computeReadiness(firmId, businessId, period);
      setReadiness(result);
      if (result.checks.every((c) => c.passed)) await logCloseComplete(firmId, businessId, period, result.score);
      const saved = await saveReadiness(firmId, businessId, result);
      setRow(saved);
      setPortfolioReady(await isCloseReady(firmId, businessId));
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not compute readiness");
    } finally {
      setRunning(false);
    }
  };

  const doSignOff = async () => {
    if (!firmId || !readiness) return;
    const res = await signOffPeriod(firmId, businessId, readiness, role);
    if (!res.ok) return toast.error(res.reason ?? "Sign-off refused");
    toast.success(`${periodLabel(period)} signed off`);
    await loadHistory();
    await run();
  };

  const doReopen = async (target: ClosePeriodRow) => {
    if (!firmId) return;
    const err = await reopenPeriod(firmId, businessId, target.id, target.period, role);
    if (err) return toast.error(err);
    toast.success(`${periodLabel(target.period)} re-opened`);
    await loadHistory();
    if (target.period === period) await run();
  };

  if (roleLoading) return null;
  if (!can("process")) {
    return (
      <div>
        <ModuleHeader title="Month-end close" subtitle="Lock a period once the evidence is complete." />
        <PermissionNotice permission="process" />
      </div>
    );
  }

  const current = history.find((h) => h.period === period) ?? row;
  const isSignedOff = current?.status === "signed_off";
  const scoreTone = !readiness ? "grey" : readiness.score === 100 ? "green" : readiness.score >= 70 ? "amber" : "red";

  return (
    <div>
      <ModuleHeader
        title="Month-end close"
        subtitle="Readiness is computed live from the ledger — reconciliation, exceptions, review queue and open requests. A period can only be signed off when every blocking check is genuinely clear."
      />

      <CACard style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...caInputStyle, maxWidth: 260 }} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            {!clients.length && <option value="">{clientsLoading ? "Loading clients…" : "No clients yet"}</option>}
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <select style={{ ...caInputStyle, maxWidth: 200 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
          <CAButton onClick={run} disabled={running || !businessId}>
            {running ? "Checking…" : "Run readiness check"}
          </CAButton>
          {isSignedOff && <CABadge tone="green">Signed off</CABadge>}
          {portfolioReady !== null && (
            <CABadge tone={portfolioReady ? "green" : "amber"}>
              {portfolioReady ? "Counted as close ready on the dashboard" : "Not yet counted as close ready"}
            </CABadge>
          )}
        </div>
      </CACard>

      {readiness && (
        <StatStrip
          items={[
            { label: "Readiness", value: `${readiness.score}%`, tone: scoreTone as never },
            { label: "Open blockers", value: String(readiness.blockers), tone: readiness.blockers ? "red" : "green" },
            { label: "Checks passing", value: `${readiness.checks.filter((c) => c.passed).length}/${readiness.checks.length}` },
            { label: "Period", value: periodLabel(readiness.period) },
          ]}
        />
      )}

      {readiness ? (
        <CACard style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: "grid", gap: 0 }}>
            {readiness.checks.map((c) => (
              <div
                key={c.key}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  padding: "14px 0",
                  borderBottom: `0.5px solid ${CA.line}`,
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 2,
                    background: c.passed ? CA.teal : "transparent",
                    border: c.passed ? "none" : `1.5px solid ${CA.line}`,
                    color: "#fff",
                    fontSize: 11,
                    lineHeight: "18px",
                    textAlign: "center",
                  }}
                >
                  {c.passed ? "✓" : ""}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: CA.sans, fontSize: 14, fontWeight: 600, color: CA.ink }}>
                    {c.label}{" "}
                    <span style={{ fontWeight: 500, color: CA.faint, fontSize: 12 }}>· weight {c.weight}</span>
                  </div>
                  <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 3 }}>{c.hint}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: CA.mono,
                      fontSize: 14,
                      fontVariantNumeric: "tabular-nums",
                      color: c.passed ? CA.muted : CA.red,
                    }}
                  >
                    {c.blockers}
                  </div>
                  {!c.passed && (
                    <Link to={c.route} style={{ fontFamily: CA.sans, fontSize: 12, color: CA.teal, fontWeight: 600 }}>
                      Clear →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {can("sign_off") ? (
              isSignedOff ? (
                <CAButton variant="ghost" onClick={() => current && doReopen(current)}>
                  Re-open period
                </CAButton>
              ) : (
                <CAButton onClick={doSignOff} disabled={readiness.score < 100 || !readiness.hasActivity}>
                  Sign off {periodLabel(readiness.period)}
                </CAButton>
              )
            ) : (
              <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                Only a Partner or Manager can sign off a period.
              </span>
            )}
            {!readiness.hasActivity ? (
              <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                Nothing was booked in this period — load the books before signing off.
              </span>
            ) : readiness.score < 100 ? (
              <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                Sign-off unlocks at 100% — clear the open checks above.
              </span>
            ) : null}

          </div>
        </CACard>
      ) : (
        <CACard style={{ padding: 22, marginBottom: 20 }}>
          <CAEmpty
            title="No readiness computed yet"
            hint="Pick a client and period, then run the check. Nothing is stored until you do."
          />
        </CACard>
      )}

      <CACard style={{ padding: 22 }}>
        <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: CA.faint, marginBottom: 12 }}>
          Close history
        </div>
        {!history.length ? (
          <CAEmpty title="No periods recorded" hint="Run a readiness check to start the trail." />
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: `0.5px solid ${CA.line}` }}>
                <div style={{ fontFamily: CA.sans, fontSize: 13.5, fontWeight: 600, color: CA.ink, width: 170 }}>
                  {periodLabel(h.period)}
                </div>
                <div style={{ fontFamily: CA.mono, fontSize: 13, fontVariantNumeric: "tabular-nums", color: CA.muted, width: 60 }}>
                  {h.readiness_score}%
                </div>
                <StateChip value={h.status} />
                <div style={{ flex: 1 }} />
                {h.signed_off_at && (
                  <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint }}>
                    {new Date(h.signed_off_at).toLocaleString("en-IN")}
                  </div>
                )}
                {h.status === "signed_off" && can("sign_off") && (
                  <CAButton variant="ghost" onClick={() => doReopen(h)}>
                    Re-open
                  </CAButton>
                )}
              </div>
            ))}
          </div>
        )}
      </CACard>
    </div>
  );
}
