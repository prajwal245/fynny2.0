import { jsPDF } from "jspdf";

const BRAND = {
  ink: [26, 16, 8] as [number, number, number],
  red: [196, 30, 30] as [number, number, number],
  beige: [244, 237, 218] as [number, number, number],
  beigeDark: [237, 228, 203] as [number, number, number],
  gold: [139, 105, 20] as [number, number, number],
  muted: [110, 95, 75] as [number, number, number],
  rule: [220, 210, 190] as [number, number, number],
  rowAlt: [250, 246, 234] as [number, number, number],
};

export type BookColumn = {
  key: string;
  label: string;
  width: number; // relative weight
  align?: "left" | "right";
  numeric?: boolean;
};

export type BookPdfOptions = {
  title: string;
  subtitle?: string;
  fromDate: string;
  toDate: string;
  columns: BookColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
  totals?: Record<string, string | number | null | undefined>;
  filename: string;
};

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "-";

export function downloadBookPdf(opts: BookPdfOptions) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usable = pageWidth - margin * 2;
  const headerHeight = 72;
  const footerHeight = 36;
  const contentTop = headerHeight + 40;
  const contentBottom = pageHeight - footerHeight - 12;

  const totalWeight = opts.columns.reduce((s, c) => s + c.width, 0);
  const colWidths = opts.columns.map((c) => (c.width / totalWeight) * usable);
  const colX: number[] = [];
  {
    let x = margin;
    for (const w of colWidths) {
      colX.push(x);
      x += w;
    }
  }

  const drawLogo = (originX: number, originY: number) => {
    const iconSize = 30;
    const scale = iconSize / 24;
    const sx = (n: number) => originX + n * scale;
    const sy = (n: number) => originY + n * scale;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BRAND.ink);
    doc.setLineWidth(1.5 * scale);
    doc.roundedRect(sx(1), sy(1), 22 * scale, 22 * scale, 2 * scale, 2 * scale, "FD");
    doc.setDrawColor(...BRAND.ink);
    doc.setLineWidth(2 * scale);
    doc.setLineCap("round");
    doc.line(sx(4), sy(17), sx(10), sy(17));
    doc.line(sx(4), sy(13), sx(12), sy(13));
    doc.line(sx(4), sy(9), sx(8), sy(9));
    doc.setDrawColor(...BRAND.red);
    doc.setLineWidth(1.5 * scale);
    doc.line(sx(8), sy(14), sx(18), sy(6));
    doc.setFillColor(...BRAND.red);
    doc.circle(sx(18), sy(6), 2 * scale, "F");
    doc.setDrawColor(...BRAND.red);
    doc.setLineWidth(1.5 * scale);
    doc.line(sx(8), sy(21), sx(16), sy(21));
    doc.setLineCap("butt");

    const wordmarkX = originX + iconSize + 8;
    const wordmarkBaseline = originY + iconSize * 0.66;
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.ink);
    doc.text("Fyn", wordmarkX, wordmarkBaseline);
    const fynWidth = doc.getTextWidth("Fyn");
    doc.setTextColor(...BRAND.red);
    doc.text("Help", wordmarkX + fynWidth, wordmarkBaseline);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gold);
    doc.setCharSpace(1.2);
    doc.text("FIND YOUR NUMBERS", wordmarkX, wordmarkBaseline + 10);
    doc.setCharSpace(0);
  };

  const drawHeader = () => {
    doc.setFillColor(...BRAND.beigeDark);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
    doc.setFillColor(...BRAND.red);
    doc.rect(0, 0, 6, headerHeight, "F");
    drawLogo(margin, (headerHeight - 30) / 2);

    const rightX = pageWidth - margin;
    doc.setFont("times", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.ink);
    doc.text(opts.title, rightX, 30, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(`${fmtDate(opts.fromDate)}  —  ${fmtDate(opts.toDate)}`, rightX, 46, { align: "right" });
    if (opts.subtitle) {
      doc.text(opts.subtitle, rightX, 60, { align: "right" });
    }

    doc.setDrawColor(...BRAND.rule);
    doc.setLineWidth(0.5);
    doc.line(margin, headerHeight + 8, pageWidth - margin, headerHeight + 8);
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(...BRAND.red);
    doc.rect(margin, y, usable, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    opts.columns.forEach((c, i) => {
      const cellX = c.align === "right" ? colX[i] + colWidths[i] - 6 : colX[i] + 6;
      doc.text(c.label, cellX, y + 15, { align: c.align === "right" ? "right" : "left" });
    });
    return y + 22;
  };

  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setDrawColor(...BRAND.rule);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text("FynHelp · Confidential", margin, pageHeight - footerHeight + 16);
    doc.setFont("courier", "normal");
    doc.text(`Page ${pageNum} of ${pageCount}`, pageWidth - margin, pageHeight - footerHeight + 16, {
      align: "right",
    });
  };

  drawHeader();
  let y = contentTop;
  y = drawTableHeader(y);

  const rowHeight = 20;
  const drawRow = (row: Record<string, any>, index: number, bold = false) => {
    if (y + rowHeight > contentBottom) {
      doc.addPage();
      drawHeader();
      y = contentTop;
      y = drawTableHeader(y);
    }
    if (bold) {
      doc.setFillColor(...BRAND.beigeDark);
      doc.rect(margin, y, usable, rowHeight, "F");
    } else if (index % 2 === 1) {
      doc.setFillColor(...BRAND.rowAlt);
      doc.rect(margin, y, usable, rowHeight, "F");
    }
    doc.setFont(bold ? "helvetica" : "helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.ink);
    opts.columns.forEach((c, i) => {
      const raw = row[c.key];
      const text = raw == null ? "" : String(raw);
      const cellX = c.align === "right" ? colX[i] + colWidths[i] - 6 : colX[i] + 6;
      if (c.numeric) doc.setFont("courier", bold ? "bold" : "normal");
      else doc.setFont("helvetica", bold ? "bold" : "normal");
      const maxW = colWidths[i] - 12;
      const clipped = doc.splitTextToSize(text, maxW)[0] ?? text;
      doc.text(clipped, cellX, y + 14, { align: c.align === "right" ? "right" : "left" });
    });
    y += rowHeight;
  };

  opts.rows.forEach((r, i) => drawRow(r, i));
  if (opts.totals) drawRow(opts.totals, opts.rows.length, true);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  doc.save(opts.filename);
}
