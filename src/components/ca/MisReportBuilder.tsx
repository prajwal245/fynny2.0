import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, X } from "lucide-react";
import { generateTypedMis } from "@/lib/caMis.functions";
import {
  financialYearOf,
  MIS_CATALOG,
  type ComparisonMode,
  type MisReportKind,
  type ReportRow,
  type ReportSection,
  type TypedMisReport,
} from "@/lib/caMisReports";
import { printHtmlDocument } from "@/lib/printPdf";
import { formatCell, reportToHtml } from "@/lib/caMisExport";
import {
  CA, CAButton, CABadge, CACard, CAField, caInputStyle, caNum, caTd, caTh,
} from "@/components/ca/portalUi";

interface Props {
  firmId: string | null;
  businessId: string | null;
  clientName: string;
  /** YYYY-MM; seeds the reporting month. */
  defaultMonth: string;
  /** The existing General MIS controls, rendered unchanged when General MIS is selected. */
  generalContent: ReactNode;
}

const COMPARISON_LABELS: Record<ComparisonMode, string> = {
  none: "No comparison",
  prev_month: "Previous month",
  prev_year: "Same month last year",
};

export default function MisReportBuilder({ firmId, businessId, clientName, defaultMonth, generalContent }: Props) {
  const run = useServerFn(generateTypedMis);
  const [kind, setKind] = useState<MisReportKind>("general_mis");
  const [month, setMonth] = useState(defaultMonth);
  const [comparison, setComparison] = useState<ComparisonMode>("none");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [report, setReport] = useState<TypedMisReport | null>(null);

  useEffect(() => { setMonth(defaultMonth); }, [defaultMonth]);

  const entry = MIS_CATALOG.find((c) => c.kind === kind)!;
  const fy = useMemo(() => (/^\d{4}-\d{2}$/.test(month) ? financialYearOf(month).label : "—"), [month]);

  // Comparison only applies to some reports; reset it when switching to one that has none.
  useEffect(() => { if (!entry.supportsComparison) setComparison("none"); }, [entry.supportsComparison]);

  const generate = async (persist: boolean) => {
    if (!businessId || !firmId) return toast.error("This client has no linked business yet.");
    if (!/^\d{4}-\d{2}$/.test(month)) return toast.error("Pick a reporting month first");
    setBusy(persist ? "save" : "preview");
    try {
      const res = await run({
        data: { firm_id: firmId, business_id: businessId, report_type: kind, month, comparison, persist },
      });
      setReport(res);
      if (persist) toast.success(`${res.title} saved for ${res.period_label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report generation failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Report type"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}
      >
        {MIS_CATALOG.map((c) => {
          const locked = c.status === "locked";
          const selected = c.kind === kind;
          return (
            <button
              key={c.kind}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={locked}
              disabled={locked}
              title={locked ? `${c.label} — ${c.lockedReason ?? "Not available yet"}` : c.description}
              onClick={() => { setKind(c.kind); setReport(null); }}
              style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: locked ? "not-allowed" : "pointer",
                background: selected ? CA.tealSoft : CA.card,
                border: `${selected ? 1.5 : 0.5}px solid ${selected ? CA.teal : CA.line}`,
                opacity: locked ? 0.55 : 1, fontFamily: CA.sans, color: CA.ink,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{c.label}</span>
                {locked && <Lock size={13} aria-hidden="true" />}
              </div>
              <div style={{ fontSize: 11.5, color: CA.muted, marginTop: 4, lineHeight: 1.4 }}>{c.description}</div>
              <div style={{ marginTop: 8 }}>
                {locked ? <CABadge tone="grey">{c.lockedReason ?? "Locked"}</CABadge>
                  : c.kind === "general_mis" ? <CABadge tone="green">Default</CABadge> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        {kind === "general_mis" ? generalContent : (
          <CACard style={{ padding: 16 }}>
            <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{entry.label} — configuration</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <CAField label="Client / entity">
                <input style={{ ...caInputStyle, background: "rgba(23,18,8,0.04)" }} value={clientName} readOnly aria-readonly="true" />
              </CAField>
              <CAField label="Reporting month">
                <input type="month" style={caInputStyle} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Reporting month" />
              </CAField>
              <CAField label="Financial year">
                <input style={{ ...caInputStyle, background: "rgba(23,18,8,0.04)" }} value={fy} readOnly aria-readonly="true" />
              </CAField>
              {entry.supportsComparison && (
                <CAField label="Comparison period">
                  <select style={caInputStyle as never} value={comparison} onChange={(e) => setComparison(e.target.value as ComparisonMode)}>
                    {(Object.keys(COMPARISON_LABELS) as ComparisonMode[]).map((k) => (
                      <option key={k} value={k}>{COMPARISON_LABELS[k]}</option>
                    ))}
                  </select>
                </CAField>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12.5, color: CA.muted }}>
              <strong style={{ color: CA.ink }}>Data sources:</strong>{" "}
              {entry.sources.join(" · ")}
              {!entry.supportsComparison && <span> · Comparison period is not applicable to this report.</span>}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <CAButton onClick={() => void generate(false)} disabled={!businessId || busy !== null}>
                {busy === "preview" ? "Building preview…" : "Preview report"}
              </CAButton>
            </div>
            <div style={{ fontSize: 12, color: CA.faint, marginTop: 6 }}>
              Preview first. You can save and export (PDF or Excel) from the preview once it has no blocking errors.
            </div>
          </CACard>
        )}
      </div>

      {report && (
        <ReportPreview
          report={report}
          saving={busy === "save"}
          onSave={() => void generate(true)}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}

// ── Preview modal ────────────────────────────────────────────────────────

const ISSUE_STYLE = {
  error: { bg: "rgba(169,56,56,0.10)", fg: CA.red, label: "Cannot generate" },
  warning: { bg: "rgba(139,105,20,0.12)", fg: CA.amber, label: "Check" },
  info: { bg: "rgba(23,18,8,0.05)", fg: CA.muted, label: "Note" },
} as const;

function ReportPreview({ report, saving, onSave, onClose }: {
  report: TypedMisReport; saving: boolean; onSave: () => void; onClose: () => void;
}) {
  const [trace, setTrace] = useState<{ row: ReportRow; section: string } | null>(null);
  const blocked = report.issues.some((i) => i.level === "error");
  const saved = !!report.report_id;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary: (string | number | null)[][] = [
      [`FynHelp — ${report.title}`],
      ["Client", report.client_name],
      ["Period", report.period_label],
      ["Financial year", report.financial_year],
      ...(report.comparison_label ? [["Compared with", report.comparison_label]] : []),
      ["Generated", new Date(report.generated_at).toLocaleString("en-IN")],
      [],
      ["Data checks"],
      ...report.issues.map((i) => [ISSUE_STYLE[i.level].label, i.message]),
      [],
      ["Sources"],
      ...report.sources.map((s) => [s.name, `${s.records} record(s)`, s.status]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    for (const s of report.sections) {
      const head = [s.labelHeading ?? "", ...s.columns.map((c) => c.label), "Source records"];
      const body = s.rows.map((r) => [
        r.label,
        ...s.columns.map((c) => r.cells[c.key] ?? null),
        r.trace ? `${r.trace.table}: ${r.trace.ids.join(", ")}` : "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
      ws["!cols"] = [{ wch: 34 }, ...s.columns.map(() => ({ wch: 16 })), { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws, s.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    }
    XLSX.writeFile(wb, `${report.title}-${report.client_name}-${report.period_label}.xlsx`.replace(/\s+/g, "-"));
  };

  const exportPdf = () => {
    try { printHtmlDocument(reportToHtml(report)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not open the print view"); }
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`${report.title} preview`} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,20,18,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 60 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFFFFF", borderRadius: 12, width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto", padding: 24, border: `0.5px solid ${CA.line}` }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700 }}>{report.title} — {report.period_label}</div>
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, marginTop: 4 }}>
              {report.client_name} · FY {report.financial_year}
              {report.comparison_label ? ` · vs ${report.comparison_label}` : ""}
            </div>
            <div style={{ marginTop: 8 }}>
              <CABadge tone={saved ? "green" : "amber"}>{saved ? "Saved" : "Preview — not saved"}</CABadge>
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {report.issues.length > 0 && (
          <div style={{ marginTop: 14, display: "grid", gap: 6 }} role="status">
            {[...report.issues].sort((a, b) => ["error", "warning", "info"].indexOf(a.level) - ["error", "warning", "info"].indexOf(b.level)).map((i, n) => (
              <div key={`${i.code}-${n}`} style={{ background: ISSUE_STYLE[i.level].bg, color: ISSUE_STYLE[i.level].fg, borderRadius: 8, padding: "8px 12px", fontFamily: CA.sans, fontSize: 12.5 }}>
                <strong>{ISSUE_STYLE[i.level].label}: </strong>{i.message}
              </div>
            ))}
          </div>
        )}

        {report.sections.map((s) => (
          <SectionTable key={s.id} section={s} onTrace={(row) => setTrace({ row, section: s.title })} />
        ))}

        {trace?.row.trace && (
          <div style={{ marginTop: 16, background: CA.card, borderRadius: 10, border: `0.5px solid ${CA.line}`, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: CA.faint }}>
                Source records — {trace.row.label}
              </div>
              <button aria-label="Close source records" onClick={() => setTrace(null)} style={{ background: "none", border: "none", cursor: "pointer", color: CA.muted }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, margin: "6px 0" }}>
              Table <code>{trace.row.trace.table}</code>{trace.row.trace.note ? ` · ${trace.row.trace.note}` : ""}
            </div>
            <div style={{ fontFamily: CA.mono, fontSize: 11, color: CA.faint, wordBreak: "break-all", lineHeight: 1.6 }}>
              {trace.row.trace.ids.slice(0, 50).join("  ")}
              {trace.row.trace.ids.length > 50 && `  … and ${trace.row.trace.ids.length - 50} more`}
            </div>
          </div>
        )}

        {report.sources.length > 0 && (
          <div style={{ marginTop: 16, fontFamily: CA.sans, fontSize: 12, color: CA.faint }}>
            Sources read: {report.sources.map((s) => `${s.name} (${s.records}${s.status === "truncated" ? "+" : ""})`).join(" · ")}
          </div>
        )}
        <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint, marginTop: 8 }}>
          All figures are calculated from the records above. No AI is used for any number in this report.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          <CAButton variant="ghost" onClick={onClose}>Close</CAButton>
          {!saved && (
            <CAButton onClick={onSave} disabled={blocked || saving}>
              {saving ? "Saving…" : blocked ? "Fix errors to save" : "Save report"}
            </CAButton>
          )}
          <CAButton variant="ghost" onClick={exportExcel} disabled={!saved}>Export Excel</CAButton>
          <CAButton variant="ghost" onClick={exportPdf} disabled={!saved}>Export PDF</CAButton>
        </div>
        {!saved && !blocked && (
          <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, textAlign: "right", marginTop: 6 }}>
            Review the figures, then save to enable export.
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTable({ section, onTrace }: { section: ReportSection; onTrace: (row: ReportRow) => void }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: CA.faint, marginBottom: 4 }}>
        {section.title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={caTh}>{section.labelHeading ?? ""}</th>
              {section.columns.map((c) => (
                <th key={c.key} style={{ ...caTh, textAlign: c.format === "text" || c.format === "date" ? "left" : "right" }}>{c.label}</th>
              ))}
              <th style={caTh} aria-label="Sources" />
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => {
              const strong = r.emphasis === "total" || r.emphasis === "subtotal";
              return (
                <tr key={`${r.label}-${i}`} style={{ background: r.emphasis === "total" ? "rgba(23,18,8,0.03)" : undefined }}>
                  <td style={{ ...caTd, fontWeight: strong ? 700 : 400, color: r.emphasis === "muted" ? CA.muted : CA.ink }}>{r.label}</td>
                  {section.columns.map((c) => {
                    const v = r.cells[c.key];
                    const text = c.format === "text" || c.format === "date";
                    return (
                      <td key={c.key} style={{ ...(text ? caTd : caNum), fontWeight: strong ? 700 : 400, color: typeof v === "number" && v < 0 && c.format === "inr" ? CA.red : undefined }}>
                        {formatCell(v, c.format)}
                      </td>
                    );
                  })}
                  <td style={{ ...caTd, textAlign: "right", whiteSpace: "nowrap" }}>
                    {r.trace && r.trace.ids.length > 0 && (
                      <button
                        type="button" onClick={() => onTrace(r)}
                        style={{ background: "none", border: "none", color: CA.teal, fontWeight: 600, fontSize: 11, cursor: "pointer" }}
                      >
                        {r.trace.ids.length} source{r.trace.ids.length === 1 ? "" : "s"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {section.note && <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 4 }}>{section.note}</div>}
    </div>
  );
}
