/**
 * FynHelp v2 — report exports.
 * PDF uses the browser print pipeline on branded HTML; Excel is a real .xlsx
 * workbook (SheetJS) with one sheet per part of the report.
 */
import type { Report } from "../store";

const inr = (n: number) => "Rs " + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export type ExportMeta = { clientName: string; firmName: string };

function rowsTable(title: string, rows: { date: string; particulars: string; amount: number }[]) {
  if (rows.length === 0) return "";
  return `
  <h3>${esc(title)}</h3>
  <table>
    <thead><tr><th>Date</th><th>Particulars</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${rows.map((r) => `<tr><td>${day(r.date)}</td><td>${esc(r.particulars)}</td><td class="r">${inr(r.amount)}</td></tr>`).join("")}
    </tbody>
  </table>`;
}

export function buildReportHtml(report: Report, meta: ExportMeta) {
  const net = report.revenue - report.expenses;
  const all = [...report.sources.revenue, ...report.sources.expenses];

  const varianceTable = `
  <h3>Key variances against the prior period</h3>
  <table>
    <thead><tr><th>Line</th><th class="r">Current</th><th class="r">Prior</th><th class="r">Change</th></tr></thead>
    <tbody>
      ${report.variances.map((v) => {
        const delta = v.current - v.prior;
        const pct = v.prior === 0 ? "New" : `${Math.round((delta / Math.abs(v.prior)) * 100)} percent`;
        return `<tr><td>${esc(v.label)}</td><td class="r">${inr(v.current)}</td><td class="r">${inr(v.prior)}</td><td class="r">${inr(delta)} (${pct})</td></tr>`;
      }).join("")}
    </tbody>
  </table>`;

  const bankTable = `
  <h3>Bank reconciliation summary</h3>
  <table>
    <thead><tr><th>Line</th><th class="r">Value</th><th class="r">Transactions</th></tr></thead>
    <tbody>
      ${report.bankSummary.map((b) => `<tr><td>${esc(b.label)}</td><td class="r">${b.label.includes("lines") ? b.value : inr(b.value)}</td><td class="r">${b.rows.length}</td></tr>`).join("")}
    </tbody>
  </table>`;

  const body =
    report.template === "Key Variances" ? varianceTable
      : report.template === "Bank Reconciliation Summary" ? bankTable + rowsTable("All bank lines considered", all)
        : report.template === "Working Paper"
          ? varianceTable + bankTable + rowsTable("Revenue transactions", report.sources.revenue) + rowsTable("Expense transactions", report.sources.expenses)
          : varianceTable + rowsTable("Revenue transactions", report.sources.revenue) + rowsTable("Expense transactions", report.sources.expenses);

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${esc(meta.clientName)} ${esc(report.template)} ${esc(report.period)}</title>
<style>
  body { font-family: 'Space Grotesk', Helvetica, Arial, sans-serif; color:#141414; margin:36px; }
  header { border-bottom:2px solid #141414; padding-bottom:14px; margin-bottom:22px; }
  h1 { font-size:21px; margin:0 0 4px; }
  h3 { font-size:14px; margin:26px 0 8px; }
  .meta { font-size:12px; color:#555; }
  .cards { display:flex; gap:14px; margin:18px 0 6px; }
  .card { flex:1; border:1px solid #e3e3e3; border-radius:12px; padding:12px 14px; }
  .card span { display:block; font-size:10px; letter-spacing:.09em; text-transform:uppercase; color:#777; }
  .card strong { font-size:19px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:7px 8px; border-bottom:1px solid #ececec; }
  th { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:#777; }
  .r { text-align:right; }
  .insight { background:#f6f5f2; border-radius:10px; padding:10px 12px; font-size:12px; margin-bottom:8px; }
  footer { margin-top:28px; font-size:11px; color:#777; }
</style></head>
<body>
  <header>
    <h1>${esc(meta.clientName)}</h1>
    <div class="meta">${esc(report.template)} &middot; ${esc(report.period)} &middot; generated ${day(report.generated)} by ${esc(meta.firmName)}</div>
  </header>
  <div class="cards">
    <div class="card"><span>Revenue</span><strong>${inr(report.revenue)}</strong></div>
    <div class="card"><span>Expenses</span><strong>${inr(report.expenses)}</strong></div>
    <div class="card"><span>Net</span><strong>${inr(net)}</strong></div>
  </div>
  <h3>Insights</h3>
  ${report.insights.map((i) => `<div class="insight">${esc(i.text)}<br /><em>Based on ${esc(i.source)}</em></div>`).join("")}
  ${body}
  <footer>Prepared in FynHelp. Every figure above is derived from ${all.length} matched transactions held in the workspace.</footer>
</body></html>`;
}

export function printReport(report: Report, meta: ExportMeta) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1500);
  };
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); throw new Error("Could not open the print view"); }
  doc.open();
  doc.write(buildReportHtml(report, meta));
  doc.close();
}

/** A real .xlsx workbook: Summary, Insights, Other flows, Variances and every source transaction. */
export async function downloadExcel(report: Report, meta: ExportMeta) {
  const XLSX = await import("xlsx");
  const status = report.signedOff
    ? `Signed off by ${report.signedOff.by} on ${day(report.signedOff.at)}`
    : report.correction
      ? `Correction requested: ${report.correction.note}`
      : "Awaiting partner sign off";
  const summary: (string | number)[][] = [
    [meta.clientName],
    [`${report.template} — ${report.period}`],
    ["Prepared by", meta.firmName],
    ["Generated", day(report.generated)],
    ["Status", status],
    [],
    ["Line", "Amount (₹)"],
    ["Revenue", report.revenue],
    ["Expenses", report.expenses],
    ["Net", report.revenue - report.expenses],
    ...(report.otherFlows ?? []).map((f) => [`${f.label} (not revenue/expense)`, f.direction === "out" ? -f.amount : f.amount]),
    [],
    ["Unmatched lines left out", report.excluded],
    ...(report.warnings ?? []).map((w) => ["Note", w]),
  ];
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number | null)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Summary", summary, [44, 22]);
  add("Insights", [["Insight", "Based on"], ...report.insights.map((i) => [i.text, i.source])], [90, 40]);
  if (report.variances.length)
    add("Variances", [["Line", "Current (₹)", "Prior (₹)", "Change (₹)"], ...report.variances.map((v) => [v.label, v.current, v.prior, v.current - v.prior])], [40, 16, 16, 16]);
  if (report.bankSummary.length)
    add("Bank summary", [["Line", "Value"], ...report.bankSummary.map((b) => [b.label, b.value])], [44, 18]);
  const tx = (label: string, rows: { date: string; particulars: string; amount: number }[]) => rows.map((r) => [label, r.date, r.particulars, r.amount]);
  add(
    "Transactions",
    [
      ["Figure", "Date", "Particulars", "Amount (₹)"],
      ...tx("Revenue", report.sources.revenue),
      ...tx("Expenses", report.sources.expenses),
      ...(report.otherFlows ?? []).flatMap((f) => tx(f.label, f.rows)),
    ],
    [26, 12, 60, 16],
  );
  const file = `${meta.clientName.replace(/\s+/g, "-")}-${report.template.replace(/\s+/g, "-")}-${report.period.replace(/\s+/g, "-")}.xlsx`;
  XLSX.writeFile(wb, file);
}
