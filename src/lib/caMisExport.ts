import type { CellFormat, TypedMisReport } from "@/lib/caMisReports";
import { dateIN, inr } from "@/components/ca/portalUi";

export function formatCell(v: number | string | null | undefined, f: CellFormat): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (f) {
    case "inr": return typeof v === "number" ? inr(v) : String(v);
    case "count": return typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
    case "pct": return typeof v === "number" ? `${v}%` : String(v);
    case "date": return dateIN(String(v));
    default: return String(v);
  }
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function reportToHtml(report: TypedMisReport): string {
  const sections = report.sections.map((s) => {
    const head = `<tr><th>${esc(s.labelHeading ?? "")}</th>${s.columns.map((c) => `<th class="${c.format === "text" || c.format === "date" ? "l" : "r"}">${esc(c.label)}</th>`).join("")}</tr>`;
    const body = s.rows.map((r) => {
      const cls = r.emphasis === "total" ? "total" : r.emphasis === "subtotal" ? "sub" : r.emphasis === "muted" ? "muted" : "";
      return `<tr class="${cls}"><td>${esc(r.label)}</td>${s.columns.map((c) => `<td class="${c.format === "text" || c.format === "date" ? "l" : "r"}">${esc(formatCell(r.cells[c.key], c.format))}</td>`).join("")}</tr>`;
    }).join("");
    return `<h2>${esc(s.title)}</h2><table>${head}${body}</table>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}`;
  }).join("");
  const issues = report.issues.filter((i) => i.level !== "info");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)} — ${esc(report.client_name)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#171208;margin:28px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#666;margin:22px 0 6px}
.meta{color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse}
th,td{padding:6px 8px;border-bottom:1px solid #ddd}th{font-size:10px;text-transform:uppercase;color:#777}
.l{text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}
tr.total td{font-weight:700;background:#f5f5f5}tr.sub td{font-weight:700}tr.muted td{color:#777}
.issue{background:#fbf3df;border-radius:6px;padding:6px 10px;margin:4px 0}.note{color:#777;font-size:11px}
.foot{margin-top:24px;color:#777;font-size:10px}
</style></head><body>
<h1>${esc(report.title)}</h1>
<div class="meta">${esc(report.client_name)} · ${esc(report.period_label)} · FY ${esc(report.financial_year)}${report.comparison_label ? ` · vs ${esc(report.comparison_label)}` : ""}<br>Generated ${esc(new Date(report.generated_at).toLocaleString("en-IN"))}</div>
${issues.map((i) => `<div class="issue"><b>${i.level === "error" ? "Cannot generate" : "Check"}:</b> ${esc(i.message)}</div>`).join("")}
${sections}
<div class="foot">Sources: ${esc(report.sources.map((s) => `${s.name} (${s.records})`).join("; ") || "—")}. Figures are calculated from the records listed; no AI is used for any number. Review before distribution.</div>
</body></html>`;
}
