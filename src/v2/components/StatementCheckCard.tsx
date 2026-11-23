/**
 * Is this bank statement correct and complete? Shown first, above the lines: the balance chain, the opening and closing
 * balance, quiet stretches and months with no lines, and lines that are also in an earlier statement of the account.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Layers } from "lucide-react";
import { verificationOf } from "@/lib/practice/statementVerification";
import { overlapSentence, type Overlap, type StatementCheck } from "@/lib/practice/extract/statementCheck";
import { V, formatDate, formatINR } from "../ui";

type Report = StatementCheck & { overlap: Overlap | null; bankTie?: { tied: boolean | null; source: string }; hold?: { reason: string; suggested: { id: string; name: string } | null } };

const TONE = {
  pass: { bg: "rgba(47,107,79,.08)", fg: "#2f6b4f", title: "Correct and complete" },
  warn: { bg: "rgba(176,122,26,.12)", fg: "#8a5d0a", title: "Check the dates" },
  fail: { bg: "rgba(169,56,56,.09)", fg: "#a93838", title: "The balance does not follow" },
  unknown: { bg: V.gray, fg: "inherit", title: "Could not check" },
} as const;

/** "2026-09" to "Sep 2026". */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

/** The proof at a glance: balance chain, then each figure the bank itself printed, ticked or crossed. */
function ProofStrip({ report }: { report: Report }) {
  const items: { key: string; ok: boolean | null; text: string }[] = [];
  const balance = report.checks.find((c) => c.label === "Running balance");
  if (balance) items.push({ key: "bal", ok: balance.ok, text: "Balance follows" });
  for (const c of report.checks) {
    if (c.label === "The bank's own count") items.push({ key: c.label, ok: c.ok, text: "Count ties" });
    else if (c.label === "The bank's own totals") items.push({ key: c.label, ok: c.ok, text: "Totals tie" });
    else if (c.label === "The bank's own balances") items.push({ key: c.label, ok: c.ok, text: "Opening and closing tie" });
    else if (c.label === "The bank's line numbers") items.push({ key: c.label, ok: c.ok, text: "Line numbers complete" });
    else if (c.label === "Pages") items.push({ key: c.label, ok: c.ok, text: "All pages" });
  }
  if (!report.bankTie || items.length < 2) return null;
  return (
    <div role="list" aria-label="What was checked against the bank's own figures" data-testid="proof-strip" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {items.map((i) => (
        <span
          key={i.key}
          role="listitem"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,.7)", color: i.ok === false ? "#a93838" : i.ok ? "#2f6b4f" : V.muted, border: `1px solid ${i.ok === false ? "rgba(169,56,56,.35)" : "rgba(47,107,79,.25)"}` }}
        >
          {i.ok === false ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
          {i.text}
        </span>
      ))}
    </div>
  );
}

export function StatementCheckCard({ report, lineCount, period, onMove, onConfirm, onAccept, busy }: { report: Report & { accepted?: { by: string | null; at: string; note: string } | null }; lineCount: number; period?: string | null; onMove?: (clientId: string) => void; onConfirm?: () => void; /** Accept a statement that failed verification, with a written reason. Resolves to an error message, or null when it worked. */ onAccept?: (note: string) => Promise<string | null>; busy?: boolean }) {
  const verification = verificationOf(report);
  const [acceptNote, setAcceptNote] = useState("");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  // The statement is filed by the dates of its own lines. Say so when the page is set to another month.
  const from = report.first?.slice(0, 7);
  const to = report.last?.slice(0, 7);
  const covers = from && to ? (from === to ? monthName(from) : `${monthName(from)} to ${monthName(to)}`) : null;
  const outside = Boolean(period && /^\d{4}-\d{2}$/.test(period) && from && to && (period < from || period > to));
  // Held only because of who the statement belongs to: its balance, count and totals all tie. Say that, not "the balance does not follow".
  const ownerOnly = report.status === "fail" && Boolean(report.hold) && (report.checks ?? []).filter((c) => !/^account (holder|number)$/i.test(c.label)).every((c) => c.ok !== false);
  const t = ownerOnly ? { ...TONE.fail, title: "On hold: confirm it belongs to this client" } : TONE[report.status];
  // The count in the sentence is the statement's own number of lines, not how many rows happen to be loaded on screen.
  const overlap = report.overlap ? overlapSentence(report.overlap, report.lines || lineCount) : null;
  const Icon = report.status === "pass" ? CheckCircle2 : report.status === "unknown" ? CircleHelp : AlertTriangle;
  return (
    <section aria-label="Statement check" data-testid="statement-check" style={{ background: t.bg, borderRadius: 14, padding: 14, display: "grid", gap: 10, minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon size={18} style={{ color: t.fg, flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 700, color: t.fg, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>Statement check: {t.title}</span>
            <span data-testid="verification-result" style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: verification.result === "passed" ? "rgba(47,107,79,.16)" : verification.result === "failed" ? "rgba(169,56,56,.16)" : "rgba(20,18,16,.08)", color: verification.result === "passed" ? "#2f6b4f" : verification.result === "failed" ? "#a93838" : V.body }}>Verification: {ownerOnly && verification.held ? "On hold" : verification.label}</span>
          </div>
          <div style={{ fontSize: 13.5 }}>{report.headline}</div>
          {(report.lines || lineCount) > 0 && (
            <div style={{ fontSize: 12.5, color: V.muted }} data-testid="lines-read">
              Lines read from the file: <b>{(report.lines || lineCount).toLocaleString("en-IN")}</b>.{report.bankTie ? "" : " Compare with the bank's own count of transactions."}
            </div>
          )}
          <ProofStrip report={report} />
        </div>
      </div>

      {verification.held && !report.hold && (
        <div role="alert" data-testid="verification-held" style={{ border: "1px solid rgba(169,56,56,.45)", background: "rgba(255,255,255,.6)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
          <b style={{ color: "#a93838" }}>Held: not treated as processed.</b>
          <span style={{ fontSize: 13 }}>This statement did not pass its checks. Its lines are exactly as read, nothing was changed or removed. A partner or manager can accept it with a reason, or upload a corrected statement.</span>
          {verification.summary === "not_available" && <span style={{ fontSize: 12.5, color: V.muted }}>The bank prints no summary to compare, so this rests on the running balance.</span>}
          {onAccept && (
            <div style={{ display: "grid", gap: 6 }}>
              <textarea className="v2-input" rows={2} value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} placeholder="Why it can be accepted, for example: page 3 is blank in the bank's PDF" aria-label="Why this statement can be accepted" />
              {acceptError && <span style={{ fontSize: 12.5, color: V.maroon }}>{acceptError}</span>}
              <div>
                <button type="button" className="v2-btn v2-btn-ghost" disabled={busy || accepting || acceptNote.trim().length < 10} onClick={async () => { setAccepting(true); setAcceptError(await onAccept(acceptNote.trim())); setAccepting(false); }}>
                  {accepting ? "Saving…" : "Accept with this reason"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {verification.acceptedBy && (
        <div style={{ fontSize: 12.5, color: V.muted }} data-testid="verification-accepted">Failed its checks and was accepted by {verification.acceptedBy}{report.accepted?.note ? `: “${report.accepted.note}”` : ""}.</div>
      )}

      {report.hold && (
        <div role="alert" style={{ border: "1px solid rgba(169,56,56,.45)", background: "rgba(255,255,255,.6)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
          <b style={{ color: "#a93838" }}>Held: not filed under this client.</b>
          <span style={{ fontSize: 13 }}>{report.hold.reason} None of its lines reach this client's reconciliation or approvals until you decide.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {report.hold.suggested && onMove && (
              <button type="button" className="v2-btn v2-btn-primary" disabled={busy} onClick={() => onMove(report.hold!.suggested!.id)}>
                Move to {report.hold.suggested.name}
              </button>
            )}
            {onConfirm && (
              <button type="button" className="v2-btn v2-btn-ghost" disabled={busy} onClick={onConfirm}>
                It does belong to this client: use it
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {report.checks.map((c) => (
          <div key={c.label} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 8, fontSize: 12.5, alignItems: "start" }}>
            <span style={{ color: c.ok === null ? V.muted : c.ok ? V.green : V.maroon, paddingTop: 1 }}>{c.ok === null ? <CircleHelp size={15} /> : c.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
            <span><b>{c.label}.</b> {c.detail}</span>
          </div>
        ))}
        {overlap && (
          <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 8, fontSize: 12.5, alignItems: "start" }}>
            <span style={{ color: V.muted, paddingTop: 1 }}><Layers size={15} /></span>
            <span><b>Overlap with an earlier statement.</b> {overlap}</span>
          </div>
        )}
      </div>

      {covers && (
        <div style={{ fontSize: 12.5, color: outside ? V.maroon : V.body }}>
          This statement covers <b>{covers}</b>. Its lines are filed under the month of their own dates{outside ? `, not under ${monthName(period!)}, which is the month on screen. Switch the period to ${monthName(from!)} to reconcile them.` : "."}
        </div>
      )}

      {report.breaks.length > 0 && (
        <details open={report.status === "fail"}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Where the balance breaks ({report.breaks.length})</summary>
          <div className="v2-scroll" style={{ marginTop: 8 }}>
            <table className="v2-table" style={{ minWidth: 560 }}>
              <thead>
                <tr><th>Line</th><th>Date</th><th style={{ textAlign: "right" }}>Expected</th><th style={{ textAlign: "right" }}>Statement</th><th>What it means</th></tr>
              </thead>
              <tbody>
                {report.breaks.slice(0, 8).map((b) => (
                  <tr key={b.line}>
                    <td className="num">{b.line}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>{formatDate(b.date)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{formatINR(b.expected)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{formatINR(b.printed)}</td>
                    <td style={{ fontSize: 12.5, minWidth: 260 }}>{b.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {report.opening !== null && report.closing !== null && (
        <div style={{ fontSize: 12, color: V.muted }}>
          Opening {formatINR(report.opening)} · money in {formatINR(report.totals.in)} · money out {formatINR(report.totals.out)} · closing {formatINR(report.closing)}{report.order === "newest_first" ? " · printed newest first" : ""}
        </div>
      )}
    </section>
  );
}
