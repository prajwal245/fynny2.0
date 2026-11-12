/**
 * Is this bank statement correct and complete? Shown first, above the lines: the balance chain, the opening and closing
 * balance, quiet stretches and months with no lines, and lines that are also in an earlier statement of the account.
 */
import { AlertTriangle, CheckCircle2, CircleHelp, Layers } from "lucide-react";
import { overlapSentence, type Overlap, type StatementCheck } from "@/lib/practice/extract/statementCheck";
import { V, formatDate, formatINR } from "../ui";

type Report = StatementCheck & { overlap: Overlap | null };

const TONE = {
  pass: { bg: "rgba(47,107,79,.08)", fg: "#2f6b4f", title: "Correct and complete" },
  warn: { bg: "rgba(176,122,26,.12)", fg: "#8a5d0a", title: "Check the dates" },
  fail: { bg: "rgba(169,56,56,.09)", fg: "#a93838", title: "The balance does not follow" },
  unknown: { bg: V.gray, fg: "inherit", title: "Could not check" },
} as const;

/** "2026-09" to "Sep 2026". */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function StatementCheckCard({ report, lineCount, period }: { report: Report; lineCount: number; period?: string | null }) {
  // The statement is filed by the dates of its own lines. Say so when the page is set to another month.
  const from = report.first?.slice(0, 7);
  const to = report.last?.slice(0, 7);
  const covers = from && to ? (from === to ? monthName(from) : `${monthName(from)} to ${monthName(to)}`) : null;
  const outside = Boolean(period && /^\d{4}-\d{2}$/.test(period) && from && to && (period < from || period > to));
  const t = TONE[report.status];
  const overlap = report.overlap ? overlapSentence(report.overlap, lineCount) : null;
  const Icon = report.status === "pass" ? CheckCircle2 : report.status === "unknown" ? CircleHelp : AlertTriangle;
  return (
    <section aria-label="Statement check" data-testid="statement-check" style={{ background: t.bg, borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Icon size={18} style={{ color: t.fg, flexShrink: 0, marginTop: 2 }} />
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 700, color: t.fg }}>Statement check: {t.title}</div>
          <div style={{ fontSize: 13.5 }}>{report.headline}</div>
        </div>
      </div>

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
