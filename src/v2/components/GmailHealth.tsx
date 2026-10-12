/**
 * Gmail intake, made visible: what the last check found, the emails FynHelp
 * looked at and what it did with each, and a health check that runs every
 * step for real and says which one fails.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { gmailHealthCheck } from "@/lib/caGmail.functions";
import { Badge, V, type Tone } from "../ui";
import { ShimmerText } from "../agents";

type Step = { key: string; label: string; ok: boolean | null; detail: string };
type Row = { message_id: string; subject: string | null; sender_email: string | null; outcome: string; reason: string | null; created_at: string };

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  done: { label: "Read", tone: "good" },
  skipped: { label: "Skipped", tone: "neutral" },
  processing: { label: "Reading", tone: "info" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function GmailHealth({ firmId, lastResult, autoRun }: { firmId: string; lastResult: string | null; autoRun?: boolean }) {
  const check = useServerFn(gmailHealthCheck);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [parts, setParts] = useState<Record<string, { filed: number; unassigned: number; duplicate: number }>>({});
  const [passedOver, setPassedOver] = useState(0);

  const loadRows = useCallback(async () => {
    const { data } = await supabase
      .from("ca_gmail_processed" as never)
      .select("*")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(60);
    const all = (data ?? []) as (Row & { part_id: string })[];
    const tally: Record<string, { filed: number; unassigned: number; duplicate: number }> = {};
    for (const r of all) {
      if (r.part_id === "*") continue;
      const t = (tally[r.message_id] ??= { filed: 0, unassigned: 0, duplicate: 0 });
      if (r.outcome === "filed") t.filed++;
      else if (r.outcome === "unassigned") t.unassigned++;
      else if (r.outcome === "duplicate") t.duplicate++;
    }
    setParts(tally);
    const emails = all.filter((r) => r.part_id === "*");
    // Only client mail is listed; the rest of the inbox is a count, nothing more.
    setRows(emails.filter((r) => r.outcome !== "skipped").slice(0, 10));
    setPassedOver(emails.filter((r) => r.outcome === "skipped").length);
  }, [firmId]);

  const runCheck = useCallback(async () => {
    setRunning(true);
    try {
      const r = await check({ data: { firmId } });
      setSteps(r.steps);
    } catch (e) {
      setSteps([{ key: "error", label: "Health check", ok: false, detail: e instanceof Error ? e.message : "The health check could not run." }]);
    } finally {
      setRunning(false);
    }
  }, [check, firmId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, lastResult]);
  useEffect(() => {
    if (autoRun) void runCheck();
  }, [autoRun, runCheck]);

  const REASONS: Record<string, string> = {
    signature_image: "only a signature logo",
    system_file: "only an invite or digital signature",
    unsupported: "a file type that isn't read",
    too_large: "a file over 25 MB",
    empty: "an empty file",
  };
  const plain = (reason: string) => reason.replace(/no documents \(([^)]*)\)/, (_, list: string) => `no documents: ${list.split(", ").map((k) => REASONS[k] ?? k).join(", ")}`);
  const status = (r: Row): { label: string; tone: Tone } => {
    const t = parts[r.message_id];
    if (t?.filed) return { label: "Filed", tone: "good" };
    if (t?.unassigned) return { label: "Needs a client", tone: "warn" };
    if (t?.duplicate) return { label: "Already had it", tone: "neutral" };
    return OUTCOME[r.outcome] ?? { label: r.outcome, tone: "neutral" };
  };
  const describe = (r: Row) => {
    const t = parts[r.message_id];
    if (t && (t.filed || t.unassigned || t.duplicate)) {
      const bits = [];
      if (t.filed) bits.push(`${t.filed} filed under the client`);
      if (t.unassigned) bits.push(`${t.unassigned} waiting in Unassigned`);
      if (t.duplicate) bits.push(`${t.duplicate} already received`);
      return bits.join(", ");
    }
    return r.reason ? plain(r.reason) : "";
  };

  return (
    <div style={{ display: "grid", gap: 12, padding: "4px 2px 2px" }} data-testid="gmail-health">
      {lastResult && (
        <div role="status" style={{ fontSize: 13, color: V.ink, background: "#F3F3F3", borderRadius: 10, padding: "9px 12px" }} data-testid="gmail-last-result">
          <b>Last check:</b> {lastResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="v2-btn v2-btn-quiet" type="button" onClick={runCheck} disabled={running} data-working={running}>
          {running ? <ShimmerText text="Checking every step…" /> : "Run Gmail health check"}
        </button>
        <span style={{ fontSize: 12, color: V.muted }}>Tests the keys, database, Google access, inbox and automatic checks. Changes nothing.</span>
      </div>

      {steps && (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }} data-testid="gmail-health-steps">
          {steps.map((s) => (
            <li key={s.key} data-ok={String(s.ok)} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", gap: 10, alignItems: "start" }}>
              <span style={{ color: s.ok === false ? V.maroon : s.ok ? V.green : V.muted, paddingTop: 2 }}>
                {s.ok === false ? <AlertCircle size={16} /> : s.ok ? <Check size={16} /> : <Minus size={16} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 12.5, color: s.ok === false ? V.maroon : V.body, overflowWrap: "anywhere" }}>{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div>
        <div style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: V.muted, fontWeight: 600, marginBottom: 6 }}>Recent client emails</div>
        <p style={{ fontSize: 12.5, color: V.body, margin: "0 0 8px", lineHeight: 1.55 }} data-testid="gmail-privacy-rule">
          FynHelp only takes in emails with attachments that come from a client's saved email, a sender you filed before, an address at a
          client's domain, or that name a client or its GSTIN in the subject. Forward anything else to this inbox to bring it in.
          {passedOver > 0 && (
            <>
              {" "}
              <b>{passedOver} other email{passedOver === 1 ? " was" : "s were"} left alone</b>; nothing from {passedOver === 1 ? "it" : "them"} was saved.
            </>
          )}
        </p>
        {rows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: V.body }}>
            No client emails yet. Documents your clients email to this inbox show here with what FynHelp did with each one.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }} data-testid="gmail-recent">
            {rows.map((r) => {
              const o = status(r);
              return (
                <div key={r.message_id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "start", fontSize: 12.5, borderTop: `1px solid ${V.line}`, paddingTop: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject || "(no subject)"}</div>
                    <div style={{ color: V.body, overflowWrap: "anywhere" }}>
                      {r.sender_email ?? "unknown sender"} · {when(r.created_at)}
                      {describe(r) ? ` · ${describe(r)}` : ""}
                    </div>
                  </div>
                  <Badge tone={o.tone}>{o.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
