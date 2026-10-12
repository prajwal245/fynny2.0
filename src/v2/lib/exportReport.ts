/**
 * FynHelp v2 — report exports.
 * PDF is a real file built from the branded HTML (jsPDF); Print uses the
 * browser's print view of the same HTML; Excel is a real .xlsx
 * workbook (SheetJS) with one sheet per part of the report.
 */
import type { Report } from "../store";

// Same as the screen: ₹, paise kept when there are any (₹4,07,485.50 never becomes ₹4,07,486).
const inr = (n: number) => {
  const abs = Math.abs(n);
  const paise = Math.round(abs * 100) % 100 !== 0;
  const body = new Intl.NumberFormat("en-IN", paise ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }).format(abs);
  return (n < 0 ? "−₹" : "₹") + body;
};
const statusOf = (report: Report) =>
  report.signedOff
    ? `Signed off by ${report.signedOff.by} on ${day(report.signedOff.at)}`
    : report.correction
      ? `Correction requested: ${report.correction.note}`
      : "Awaiting partner sign off";
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

  const varianceTable = !report.variances.length ? "" : `
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

  const flows = report.otherFlows ?? [];
  const otherFlowsTable = !flows.length ? "" : `
  <h3>Not counted as revenue or expenses</h3>
  <table>
    <thead><tr><th>Line</th><th class="r">Amount</th><th class="r">Transactions</th></tr></thead>
    <tbody>
      ${flows.map((f) => { const m = flowMoney(f); return `<tr><td>${esc(f.label)}${m.in && m.out ? `<br><small>In ${inr(m.in)} · Out ${inr(m.out)}</small>` : ""}</td><td class="r">${inr(m.net)}</td><td class="r">${f.count}</td></tr>`; }).join("")}
    </tbody>
  </table>`;
  const gatewayNote = !report.gateway ? "" : `
  <div class="insight">Payment gateway payouts grossed up: ${report.gateway.payouts} payout${report.gateway.payouts === 1 ? "" : "s"} matched the settlement report. Revenue includes ${inr(report.gateway.fees + report.gateway.gst_on_fees)} kept by the gateway, booked in expenses as fees ${inr(report.gateway.fees)} and GST on fees ${inr(report.gateway.gst_on_fees)}.</div>`;
  const decisions = report.decisions ?? [];
  const exceptionBody = `
  <h3>Open exceptions and review items</h3>
  <table>
    <thead><tr><th>Item</th><th class="r">Count</th></tr></thead>
    <tbody>${report.bankSummary.map((b) => `<tr><td>${esc(b.label)}</td><td class="r">${b.value}</td></tr>`).join("") || `<tr><td>Nothing open</td><td class="r">0</td></tr>`}</tbody>
  </table>
  <h3>Decided this period</h3>
  ${decisions.length ? `<table>
    <thead><tr><th>Date</th><th>Line</th><th class="r">Amount</th><th>Decision</th><th>Note</th></tr></thead>
    <tbody>${decisions.map((d) => `<tr><td>${d.date ? day(d.date) : ""}</td><td>${esc(d.particulars)}<br/><small>${esc(d.reason)}</small></td><td class="r">${inr(d.amount)}</td><td>${esc(d.outcome)}</td><td>${esc(d.note)}</td></tr>`).join("")}</tbody>
  </table>` : `<p class="meta">No line was ignored, matched by hand or marked reconciled elsewhere.</p>`}`;

  const body =
    report.template === "Exception and Review Summary" ? exceptionBody
    : report.template === "Key Variances" ? varianceTable
      : report.template === "Bank Reconciliation Summary" ? bankTable + rowsTable("All bank lines considered", all)
        : report.template === "Working Paper"
          ? varianceTable + bankTable + rowsTable("Revenue transactions", report.sources.revenue) + rowsTable("Expense transactions", report.sources.expenses)
          : varianceTable + rowsTable("Revenue transactions", report.sources.revenue) + rowsTable("Expense transactions", report.sources.expenses);
  const isException = report.template === "Exception and Review Summary";
  const flowCount = flows.reduce((n, f) => n + f.count, 0);
  const notes = [
    ...(report.excluded ? [`${report.excluded} unmatched line${report.excluded === 1 ? " is" : "s are"} left out of these figures by rule.`] : []),
    ...(report.warnings ?? []).filter((w) => !/not reconciled and/.test(w)),
  ];

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${esc(meta.clientName)} ${esc(report.template)} ${esc(report.period)}</title>
<style>
  body { font-family: 'Geist', system-ui, -apple-system, Helvetica, Arial, sans-serif; font-variant-numeric: tabular-nums; color:#141414; margin:36px; }
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
    <div class="meta"><strong>${esc(statusOf(report))}</strong></div>
  </header>
  ${isException ? "" : `<div class="cards">
    <div class="card"><span>Revenue</span><strong>${inr(report.revenue)}</strong></div>
    <div class="card"><span>Expenses</span><strong>${inr(report.expenses)}</strong></div>
    <div class="card"><span>Net</span><strong>${inr(net)}</strong></div>
  </div>`}
  ${notes.map((n) => `<p class="meta">${esc(n)}</p>`).join("")}
  ${isException ? "" : gatewayNote + otherFlowsTable}
  ${isException || !report.statutory?.length ? "" : `<h3>Statutory dates that follow from this month</h3><table><tbody>${report.statutory.map((s) => `<tr><td>${esc(s.label)}</td><td class="r">by ${day(s.due)}</td></tr>`).join("")}</tbody></table>`}
  ${isException || !report.insights.length ? "" : `<h3>Insights</h3>
  ${report.insights.map((i) => `<div class="insight">${esc(i.text)}<br /><em>Based on ${esc(i.source)}</em></div>`).join("")}`}
  ${body}
  <footer>Prepared in FynHelp. Every figure above is derived from ${all.length + flowCount} matched transaction${all.length + flowCount === 1 ? "" : "s"} held in the workspace.</footer>
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
  const status = statusOf(report);
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
    ...(report.otherFlows ?? []).map((f) => [`${f.label} (not revenue/expense, net)`, flowMoney(f).net]),
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
  if (report.decisions?.length)
    add("Decisions", [["Date", "Line", "Reason", "Amount (₹)", "Decision", "Note"], ...report.decisions.map((d) => [d.date ?? "", d.particulars, d.reason, d.amount, d.outcome, d.note])], [12, 40, 24, 16, 26, 50]);
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
  const file = reportFileName(report, meta, "xlsx");
  XLSX.writeFile(wb, file);
}

/** A flow's signed net (in positive, out negative) and its in and out totals. Older reports stored one figure; their rows still carry signed amounts. */
export function flowMoney(f: { direction: "in" | "out"; amount: number; rows: { amount: number }[]; net?: number; in?: number; out?: number }) {
  if (typeof f.net === "number") return { net: f.net, in: f.in ?? 0, out: f.out ?? 0 };
  const inAmt = f.rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0);
  const outAmt = f.rows.filter((r) => r.amount < 0).reduce((t, r) => t - r.amount, 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return f.rows.length ? { net: round(inAmt - outAmt), in: round(inAmt), out: round(outAmt) } : { net: f.direction === "out" ? -f.amount : f.amount, in: 0, out: 0 };
}

/** File name a CA can attach as is: Client-Name_Monthly-MIS_July-2026.pdf */
export function reportFileName(report: Report, meta: ExportMeta, ext: "pdf" | "xlsx") {
  const part = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${part(meta.clientName)}_${part(report.template)}_${part(report.period)}.${ext}`;
}

/**
 * A real PDF file, downloaded straight away: the same branded layout as the
 * print view, laid out on A4 pages. Nothing opens and the tab never locks.
 */
export async function downloadPdf(report: Report, meta: ExportMeta) {
  const html = buildReportHtml(report, meta);
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:794px;background:#fff;";
  // Scope the report's own styles to this box so the app is untouched.
  const scoped = style.replace(/(^|\})\s*([^{}@]+)\{/g, (_m, close: string, sel: string) => `${close} ${sel.split(",").map((x) => `.fyn-pdf ${x.trim() === "body" ? "" : x.trim()}`).join(", ")} {`);
  host.innerHTML = `<style>${scoped}</style><div class="fyn-pdf" style="padding:36px;font-family:'Geist',system-ui,-apple-system,Helvetica,Arial,sans-serif;color:#141414;font-variant-numeric:tabular-nums">${body}</div>`;
  document.body.appendChild(host);
  try {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    await new Promise<void>((resolve, reject) => {
      pdf
        .html(host.querySelector(".fyn-pdf") as HTMLElement, {
          x: 0,
          y: 0,
          width: 595.28,
          windowWidth: 794,
          autoPaging: "text",
          margin: [18, 0, 24, 0],
          html2canvas: { scale: 0.75, backgroundColor: "#ffffff", logging: false },
          callback: () => resolve(),
        })
        .catch(reject);
    });
    pdf.save(reportFileName(report, meta, "pdf"));
  } finally {
    host.remove();
  }
}
