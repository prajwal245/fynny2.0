/**
 * AI Deduction & Exemption engine — client 360 tab.
 * Every finding is a real row in `ca_deduction_findings`, produced by the
 * detectDeductions server function from the client's own financial data.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectDeductions } from "@/lib/caDeductions.functions";
import { logCAAudit } from "@/lib/caAudit";
import { CA, CACard, CABadge, CAButton, CAEmpty, CAField, caInputStyle, inr, type Tone } from "./portalUi";
import { useFirmIntelligence } from "@/hooks/useCAIntelligence";

interface Finding {
  id: string;
  period: string;
  provision: string;
  provision_label: string;
  category: string;
  estimated_benefit: number;
  confidence: string;
  status: string;
  evidence: unknown;
  explanation: string;
  action_required: string;
  created_at: string | null;
}

const FILTERS = ["All", "Open", "Actioned", "Dismissed"] as const;
type Filter = typeof FILTERS[number];

const categoryColor = (category: string): string => {
  switch (category) {
    case "Employment": return CA.teal;
    case "ITC": return CA.amber;
    case "Startup": return CA.red;
    case "Donations": return CA.green;
    case "Presumptive Taxation": return CA.teal;
    default: return CA.faint;
  }
};

const confidenceTone = (c: string): Tone =>
  c === "high" ? "green" : c === "medium" ? "amber" : "grey";

/** Sample-size explainer — shows the firm-level count only, never clients or amounts. */
function WhySuggestion({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ fontFamily: CA.sans, fontSize: 11 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: CA.sans, fontSize: 11, fontWeight: 600, color: CA.teal,
          textDecoration: "underline dotted",
        }}
      >
        Why this suggestion?
      </button>
      {open && (
        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: CA.faint, fontStyle: "italic" }}>
          Based on {count} similar clients of this type in your firm.
        </span>
      )}
    </span>
  );
}

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function EvidenceList({ evidence }: { evidence: unknown }) {
  const [open, setOpen] = useState(false);
  const rows = Array.isArray(evidence) ? (evidence as Record<string, unknown>[]) : [];
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: CA.sans, fontSize: 12, fontWeight: 600, color: CA.teal }}
      >
        {open ? "Hide evidence" : `View evidence (${rows.length})`}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ background: CA.tealSoft, borderRadius: 8, padding: "10px 12px" }}>
              {Object.entries(r).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontFamily: CA.sans, fontSize: 12, padding: "2px 0" }}>
                  <span style={{ color: CA.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
                  <span style={{ fontFamily: typeof v === "number" ? CA.mono : CA.sans, color: CA.ink, textAlign: "right" }}>
                    {v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientDeductionsTab({
  firmId, businessId, clientId, userId,
}: { firmId: string; businessId: string; clientId?: string | null; userId?: string | null }) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState<Filter>("Open");
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [entityType, setEntityType] = useState<string | null>(null);
  const runScan = useServerFn(detectDeductions);
  const { data: firmIntel } = useFirmIntelligence(firmId);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) return;
    (async () => {
      const { data } = await supabase
        .from("ca_clients")
        .select("entity_type")
        .eq("id", clientId)
        .eq("ca_firm_id", firmId)
        .maybeSingle();
      if (!cancelled) setEntityType((data as { entity_type: string | null } | null)?.entity_type ?? null);
    })();
    return () => { cancelled = true; };
  }, [clientId, firmId]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("ca_deduction_findings")
      .select("*")
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (error) { console.warn("[fyn:ca] ca_deduction_findings", error); return; }
    setFindings((data ?? []) as unknown as Finding[]);
  }, [firmId, businessId]);

  useEffect(() => { load(); }, [load]);

  // Realtime — findings surface as the scan writes them.
  useEffect(() => {
    const channel = supabase
      .channel(`ca-deductions-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ca_deduction_findings", filter: `business_id=eq.${businessId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId, load]);

  const scan = async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) return toast.error("Pick a period first");
    setScanning(true);
    try {
      const res = await runScan({ data: { firm_id: firmId, business_id: businessId, client_id: clientId ?? null, period } });
      setScanned(true);
      setFilter("Open");
      await load();
      if (res.findings.length === 0) toast.success(`Scan complete — no new deductions detected for ${period}`);
      else toast.success(`${res.findings.length} opportunities worth ${inr(res.total_benefit)} identified`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deduction scan failed");
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (f: Finding, next: "actioned" | "dismissed") => {
    const patch = next === "actioned"
      ? { status: "actioned", actioned_at: new Date().toISOString(), actioned_by: userId ?? null }
      : { status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: userId ?? null };
    const { error } = await supabase.from("ca_deduction_findings").update(patch).eq("id", f.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId, businessId,
      entityType: "deduction_finding",
      entityId: f.id,
      action: next === "actioned" ? "deduction_actioned" : "deduction_dismissed",
      detail: { provision: f.provision, estimated_benefit: f.estimated_benefit, period: f.period },
    });
    setFindings((prev) => prev.map((r) => (r.id === f.id ? { ...r, status: next } : r)));
    toast.success(next === "actioned" ? "Marked as actioned" : "Finding dismissed");
  };

  const open = useMemo(() => findings.filter((f) => f.status === "open"), [findings]);
  const totals = useMemo(() => ({
    benefit: open.reduce((s, f) => s + Number(f.estimated_benefit ?? 0), 0),
    high: open.filter((f) => f.confidence === "high").length,
    medium: open.filter((f) => f.confidence === "medium").length,
    low: open.filter((f) => f.confidence === "low").length,
  }), [open]);

  // Firm-scoped provision weights (learned from THIS firm's own dismissals).
  const entity = entityType ?? "Unspecified";
  const weights = useMemo(() => {
    const byEntity = firmIntel?.provision_weights ?? {};
    return (byEntity[entity] ?? byEntity["default"] ?? {}) as Record<string, number>;
  }, [firmIntel, entity]);

  // Unlearned provisions sit at neutral 0.5 until the brain has seen enough.
  const weightOf = useCallback((p: string) => weights[p] ?? 0.5, [weights]);
  const sampleOf = useCallback(
    (p: string) => {
      const n = weights[`${p}__n`];
      return typeof n === "number" && n >= 5 ? n : null;
    },
    [weights],
  );

  const visible = useMemo(() => {
    const list = filter === "All" ? findings : findings.filter((f) => f.status === filter.toLowerCase());
    return [...list].sort((a, b) => weightOf(b.provision) - weightOf(a.provision));
  }, [findings, filter, weightOf]);

  const lastScan = findings[0]?.created_at ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700, color: CA.ink }}>AI Deduction Scan</div>
          <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginTop: 4 }}>
            Last scanned: {stamp(lastScan)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <CAField label="Period">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...caInputStyle, width: 170 }} />
          </CAField>
          <CAButton onClick={scan} disabled={scanning}>{scanning ? "Scanning…" : "Run Scan"}</CAButton>
        </div>
      </div>

      {open.length > 0 && (
        <div style={{ background: CA.teal, borderRadius: 12, padding: "20px 22px", marginTop: 18 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700, color: "#fff" }}>
            {inr(totals.benefit)} in potential tax savings identified across {open.length} provisions.
          </div>
          <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
            Confidence: {totals.high} high · {totals.medium} medium · {totals.low} low
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: CA.sans, fontSize: 12.5, fontWeight: filter === f ? 700 : 500,
              color: filter === f ? "#fff" : CA.muted,
              background: filter === f ? CA.teal : "#fff",
              border: `0.5px solid ${filter === f ? CA.teal : CA.line}`,
              borderRadius: 999, padding: "6px 14px", cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {visible.length === 0 && (
          <CACard>
            {findings.length === 0 && !scanned ? (
              <CAEmpty
                title="No deductions scanned yet"
                hint="Click Run Scan to analyse this client's financial data for tax-saving opportunities."
              />
            ) : findings.length === 0 ? (
              <CAEmpty
                title={`No additional deductions detected for ${period}`}
                hint="All applicable provisions appear to be claimed."
              />
            ) : (
              <CAEmpty title={`No ${filter.toLowerCase()} findings`} hint="Switch filter to see other findings." />
            )}
          </CACard>
        )}

        {visible.map((f) => (
          <CACard key={f.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: CA.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                color: "#fff", background: categoryColor(f.category), padding: "3px 9px", borderRadius: 6,
              }}>
                {f.provision}
              </span>
              <span style={{ fontFamily: CA.serif, fontSize: 15, fontWeight: 700, color: CA.ink }}>{f.provision_label}</span>
              {sampleOf(f.provision) !== null && <WhySuggestion count={sampleOf(f.provision)!} />}
              {weightOf(f.provision) < 0.3 && (
                <span style={{ fontFamily: CA.sans, fontSize: 11, color: CA.faint, fontStyle: "italic" }}>
                  Less relevant for this entity type
                </span>
              )}
              <CABadge tone={confidenceTone(f.confidence)}>{f.confidence} confidence</CABadge>
              {f.status !== "open" && <CABadge tone={f.status === "actioned" ? "teal" : "grey"}>{f.status}</CABadge>}
              <span style={{ marginLeft: "auto", fontFamily: CA.sans, fontSize: 11.5, color: CA.faint }}>{f.period} · {f.category}</span>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.faint }}>
                Estimated benefit
              </div>
              <div style={{
                fontFamily: CA.mono, fontSize: 28, fontWeight: 700, marginTop: 4,
                fontVariantNumeric: "tabular-nums", color: f.status === "dismissed" ? CA.faint : CA.teal,
              }}>
                {inr(f.estimated_benefit)}
              </div>
            </div>

            <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 12, lineHeight: 1.55 }}>{f.explanation}</p>

            <div style={{ marginTop: 12, borderLeft: `3px solid ${CA.teal}`, background: CA.tealSoft, padding: "10px 12px", borderRadius: "0 8px 8px 0" }}>
              <div style={{ fontFamily: CA.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: CA.teal }}>
                Action required
              </div>
              <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.ink, marginTop: 4, lineHeight: 1.5 }}>{f.action_required}</div>
            </div>

            <EvidenceList evidence={f.evidence} />

            {f.status === "open" && (
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <CAButton onClick={() => resolve(f, "actioned")}>Mark actioned</CAButton>
                <CAButton variant="danger" onClick={() => resolve(f, "dismissed")}>Dismiss</CAButton>
              </div>
            )}
          </CACard>
        ))}
      </div>
    </div>
  );
}
