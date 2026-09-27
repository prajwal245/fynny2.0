/**
 * Data Quality Engine — completeness scoring, duplicate detection and
 * statistical anomaly detection over the client's real transactions.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { runDataQualityScan } from "@/lib/caFinIntel.functions";
import { CA, CACard, CAButton, CABadge, CAEmpty, CAField, caInputStyle, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";

interface Run {
  id: string; period: string; total_records: number; completeness_score: number;
  duplicate_count: number; anomaly_count: number; missing_field_count: number; created_at: string;
}
interface Issue {
  id: string; issue_type: string; severity: string; entity_type: string; entity_id: string | null;
  description: string; detail: Record<string, unknown>; status: string;
}

const SEV: Record<string, "red" | "amber" | "grey"> = { high: "red", medium: "amber", low: "grey" };
const FILTERS = ["all", "duplicate", "anomaly", "missing_field", "uncategorised"] as const;

export default function CADataQualityPage() {
  useEffect(() => { console.log("[fyn:ca:os-complete] CADataQualityPage mounted"); }, []);
  const { firmId, userId } = useCAPortal();
  const { can } = useCARole();
  const { clients } = useCAClientOptions();
  const [businessId, setBusinessId] = useState("");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [runs, setRuns] = useState<Run[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [scanning, setScanning] = useState(false);
  const scan = useServerFn(runDataQualityScan);
  const editable = can("manage_clients");

  useEffect(() => {
    if (!businessId && clients.length) setBusinessId(clients[0].business_id);
  }, [clients, businessId]);

  const load = useCallback(async () => {
    if (!firmId || !businessId) return;
    const { data: runRows } = await supabase
      .from("ca_data_quality_runs")
      .select("id, period, total_records, completeness_score, duplicate_count, anomaly_count, missing_field_count, created_at")
      .eq("ca_firm_id", firmId).eq("business_id", businessId)
      .order("created_at", { ascending: false }).limit(12);
    const rl = (runRows ?? []) as Run[];
    setRuns(rl);
    if (rl[0]) {
      const { data: issueRows } = await supabase
        .from("ca_data_quality_issues")
        .select("id, issue_type, severity, entity_type, entity_id, description, detail, status")
        .eq("run_id", rl[0].id)
        .order("severity")
        .limit(300);
      setIssues((issueRows ?? []) as unknown as Issue[]);
    } else {
      setIssues([]);
    }
  }, [firmId, businessId]);

  useEffect(() => { void load(); }, [load]);

  const runScan = async () => {
    if (!firmId || !businessId) return;
    setScanning(true);
    try {
      const res = await scan({ data: { firm_id: firmId, business_id: businessId, period } });
      toast.success(`Completeness ${res.completeness_score}% · ${res.duplicate_count} duplicates · ${res.anomaly_count} anomalies`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const resolveIssue = async (i: Issue) => {
    const { error } = await supabase.from("ca_data_quality_issues")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: userId ?? null })
      .eq("id", i.id);
    if (error) return toast.error(error.message);
    setIssues((prev) => prev.map((r) => (r.id === i.id ? { ...r, status: "resolved" } : r)));
  };

  const latest = runs[0];
  const visible = useMemo(
    () => (filter === "all" ? issues : issues.filter((i) => i.issue_type === filter)),
    [issues, filter],
  );

  return (
    <div>
      <ModuleHeader
        title="Data Quality Engine"
        subtitle="Completeness scoring, duplicate detection and statistical anomaly detection against the client's posted transactions. Every issue links back to the source row."
        right={editable ? undefined : <CABadge tone="grey">Read only</CABadge>}
      />

      <CACard style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <CAField label="Client">
            <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} style={{ ...caInputStyle, width: 300 }}>
              {clients.length === 0 && <option value="">No clients yet</option>}
              {clients.map((c) => <option key={c.business_id} value={c.business_id}>{c.client_name}</option>)}
            </select>
          </CAField>
          <CAField label="Period">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...caInputStyle, width: 170 }} />
          </CAField>
          {editable && <CAButton onClick={runScan} disabled={scanning || !businessId}>{scanning ? "Scanning…" : "Run quality scan"}</CAButton>}
        </div>
      </CACard>

      <StatStrip items={[
        { label: "Completeness", value: latest ? `${latest.completeness_score}%` : "—" },
        { label: "Records scanned", value: latest ? String(latest.total_records) : "—" },
        { label: "Duplicates", value: latest ? String(latest.duplicate_count) : "—" },
        { label: "Anomalies", value: latest ? String(latest.anomaly_count) : "—" },
        { label: "Incomplete rows", value: latest ? String(latest.missing_field_count) : "—" },
      ]} />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: CA.sans, fontSize: 12.5, fontWeight: filter === f ? 700 : 500,
            color: filter === f ? "#fff" : CA.muted, background: filter === f ? CA.teal : "#fff",
            border: `0.5px solid ${filter === f ? CA.teal : CA.line}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer",
          }}>{f.replace("_", " ")}</button>
        ))}
      </div>

      <CACard style={{ padding: 4, marginBottom: 18 }}>
        {visible.length === 0 ? (
          <CAEmpty
            title={latest ? "No issues in this category" : "No quality scan yet"}
            hint={latest ? "Switch filter or run a fresh scan." : "Pick a client and period, then run the quality scan."}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id} style={{ borderBottom: `0.5px solid ${CA.line}`, opacity: i.status === "resolved" ? 0.5 : 1 }}>
                    <td style={{ padding: "10px 12px", width: 110 }}><CABadge tone={SEV[i.severity] ?? "grey"}>{i.severity}</CABadge></td>
                    <td style={{ padding: "10px 12px", width: 140, fontFamily: CA.sans, fontSize: 12, color: CA.muted }}>{i.issue_type.replace("_", " ")}</td>
                    <td style={{ padding: "10px 12px", fontFamily: CA.sans, fontSize: 13, color: CA.ink }}>{i.description}</td>
                    <td style={{ padding: "10px 12px", width: 120, textAlign: "right" }}>
                      {editable && i.status !== "resolved" && (
                        <button onClick={() => resolveIssue(i)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: CA.sans, fontSize: 12, color: CA.teal, fontWeight: 600 }}>
                          Mark resolved
                        </button>
                      )}
                      {i.status === "resolved" && <CABadge tone="green">resolved</CABadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CACard>

      {runs.length > 1 && (
        <CACard style={{ padding: 16 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink, marginBottom: 10 }}>Scan history</div>
          {runs.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 16, alignItems: "center", padding: "7px 0", borderTop: `0.5px solid ${CA.line}`, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
              <span style={{ fontFamily: CA.mono }}>{r.period}</span>
              <span>{dateIN(r.created_at)}</span>
              <span style={{ color: CA.ink, fontWeight: 600 }}>{r.completeness_score}% complete</span>
              <span>{r.duplicate_count} dup</span>
              <span>{r.anomaly_count} anomalies</span>
              <span style={{ marginLeft: "auto" }}>{r.total_records} records</span>
            </div>
          ))}
        </CACard>
      )}
    </div>
  );
}
