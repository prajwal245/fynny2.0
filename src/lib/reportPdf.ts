import { jsPDF } from "jspdf";

// FynHelp brand tokens (RGB equivalents of HSL hex in mem://design/brand)
const BRAND = {
  ink: [26, 16, 8] as [number, number, number],          // #1A1008
  red: [196, 30, 30] as [number, number, number],        // #C41E1E
  beige: [244, 237, 218] as [number, number, number],    // #F4EDDA
  beigeDark: [237, 228, 203] as [number, number, number],// #EDE4CB
  gold: [139, 105, 20] as [number, number, number],      // #8B6914
  muted: [110, 95, 75] as [number, number, number],
  rule: [220, 210, 190] as [number, number, number],
};

const formatDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

interface ReportLike {
  id?: string;
  brief_date?: string | null;
  created_at?: string | null;
  content?: string | null;
  delivered?: boolean | null;
  brief_type?: string | null;
}

export type ReportPdfVariant = "branded" | "simple";

export function downloadReportPdf(
  report: ReportLike,
  variant: ReportPdfVariant = "branded"
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const isSimple = variant === "simple";

  const margin = 56;
  const usable = pageWidth - margin * 2;

  const headerHeight = isSimple ? 56 : 72;
  const footerHeight = 40;
  const contentTop = headerHeight + (isSimple ? 16 : 32);
  const contentBottom = pageHeight - footerHeight - 16;

  // In simple mode, force everything to black/grey for print friendliness.
  const inkColor = isSimple ? ([0, 0, 0] as [number, number, number]) : BRAND.ink;
  const accentColor = isSimple
    ? ([0, 0, 0] as [number, number, number])
    : BRAND.red;
  const mutedColor = isSimple
    ? ([90, 90, 90] as [number, number, number])
    : BRAND.muted;
  const goldColor = isSimple ? mutedColor : BRAND.gold;

  const briefDateLabel = formatDate(report.brief_date);
  const generatedLabel = formatDate(report.created_at);
  const statusLabel = report.delivered ? "Delivered" : "Ready";

  // ---------- Reusable chrome ----------
  // Renders the FynHelp logo (icon + wordmark + tagline) using jsPDF
  // vector primitives. Mirrors src/components/FynLogo.tsx (24x24 viewBox):
  // - White rounded square with ink border
  // - Three horizontal ink bars (ascending widths)
  // - Red diagonal trend line with red end dot
  // - Red underline accent
  // - "Fyn" ink + "Help" red serif wordmark
  const drawLogo = (originX: number, originY: number) => {
    const iconSize = 32; // pt
    const scale = iconSize / 24; // SVG viewBox is 24x24
    const sx = (n: number) => originX + n * scale;
    const sy = (n: number) => originY + n * scale;

    // Rounded square (white fill, ink border)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BRAND.ink);
    doc.setLineWidth(1.5 * scale);
    doc.roundedRect(sx(1), sy(1), 22 * scale, 22 * scale, 2 * scale, 2 * scale, "FD");

    // Three horizontal ink bars (ascending), round caps
    doc.setDrawColor(...BRAND.ink);
    doc.setLineWidth(2 * scale);
    doc.setLineCap("round");
    doc.line(sx(4), sy(17), sx(10), sy(17));
    doc.line(sx(4), sy(13), sx(12), sy(13));
    doc.line(sx(4), sy(9), sx(8), sy(9));

    // Red diagonal trend line
    doc.setDrawColor(...BRAND.red);
    doc.setLineWidth(1.5 * scale);
    doc.line(sx(8), sy(14), sx(18), sy(6));

    // Red end dot
    doc.setFillColor(...BRAND.red);
    doc.circle(sx(18), sy(6), 2 * scale, "F");

    // Red underline accent
    doc.setDrawColor(...BRAND.red);
    doc.setLineWidth(1.5 * scale);
    doc.line(sx(8), sy(21), sx(16), sy(21));
    doc.setLineCap("butt");

    // Wordmark "Fyn" (ink) + "Help" (red), serif
    const wordmarkX = originX + iconSize + 8;
    const wordmarkBaseline = originY + iconSize * 0.66;
    doc.setFont("times", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...BRAND.ink);
    doc.text("Fyn", wordmarkX, wordmarkBaseline);
    const fynWidth = doc.getTextWidth("Fyn");
    doc.setTextColor(...BRAND.red);
    doc.text("Help", wordmarkX + fynWidth, wordmarkBaseline);

    // Gold tagline
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.gold);
    doc.setCharSpace(1.2);
    doc.text("FIND YOUR NUMBERS", wordmarkX, wordmarkBaseline + 10);
    doc.setCharSpace(0);
  };

  const drawHeader = () => {
    if (isSimple) {
      // Print-friendly: plain text header, no fills, no logo.
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...inkColor);
      doc.text("CFO Report", margin, 32);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);
      const meta = `Brief: ${briefDateLabel}   Generated: ${generatedLabel}   Status: ${statusLabel}`;
      doc.text(meta, margin, 46);

      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(margin, headerHeight, pageWidth - margin, headerHeight);
      return;
    }

    // Branded header (beige band, red bar, logo, tabular meta)
    doc.setFillColor(...BRAND.beigeDark);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
    doc.setFillColor(...BRAND.red);
    doc.rect(0, 0, 6, headerHeight, "F");
    drawLogo(margin, (headerHeight - 36) / 2);

    const rightX = pageWidth - margin;
    const drawMetaRow = (label: string, value: string, ly: number) => {
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.ink);
      doc.text(value, rightX, ly, { align: "right" });
      const valueWidth = doc.getTextWidth(value);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.muted);
      doc.text(label, rightX - valueWidth - 4, ly, { align: "right" });
    };
    drawMetaRow("Brief", briefDateLabel, 28);
    drawMetaRow("Generated", generatedLabel, 42);
    drawMetaRow("Status", statusLabel, 56);

    doc.setDrawColor(...BRAND.rule);
    doc.setLineWidth(0.5);
    doc.line(margin, headerHeight + 8, pageWidth - margin, headerHeight + 8);
  };

  const drawFooter = (pageNum: number, pageCount: number) => {
    doc.setDrawColor(isSimple ? 200 : BRAND.rule[0], isSimple ? 200 : BRAND.rule[1], isSimple ? 200 : BRAND.rule[2]);
    doc.setLineWidth(0.5);
    doc.line(
      margin,
      pageHeight - footerHeight,
      pageWidth - margin,
      pageHeight - footerHeight
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text(
      isSimple ? "CFO Report" : "FynHelp · Confidential",
      margin,
      pageHeight - footerHeight + 18
    );
    doc.setFont(isSimple ? "helvetica" : "courier", "normal");
    doc.setFontSize(8);
    doc.text(
      `Page ${pageNum} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - footerHeight + 18,
      { align: "right" }
    );
  };

  // ---------- Body layout ----------
  drawHeader();

  // Title block
  let y = contentTop;
  doc.setFont(isSimple ? "helvetica" : "times", "bold");
  doc.setFontSize(isSimple ? 16 : 22);
  doc.setTextColor(...inkColor);
  doc.text("CFO Report", margin, y);
  y += 10;

  if (!isSimple) {
    // Red underline accent (branded only)
    doc.setDrawColor(...accentColor);
    doc.setLineWidth(2);
    doc.line(margin, y, margin + 48, y);
  }
  y += isSimple ? 12 : 22;

  if (report.brief_type) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...goldColor);
    doc.text(report.brief_type.toUpperCase(), margin, y);
    y += 18;
  }

  // Body, paragraph-aware pagination
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...inkColor);

  const bodyText =
    typeof report.content === "string" && report.content.trim().length > 0
      ? report.content.trim()
      : "(No content available for this report.)";

  const lineHeight = 16;
  const paragraphGap = 8;



  // Render a line of text with numeric tokens (currency, %, dates, plain
  // numbers) in courier so digits align like Inter's tabular-nums.
  // Matches: ₹/$/€ amounts, percentages, ISO dates, en-IN dates, integers,
  // decimals, comma-grouped numbers, and lakh-style 1,23,456.
  const NUM_TOKEN_RE =
    /(?:[₹$€£]\s?\d[\d,]*(?:\.\d+)?|\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d[\d,]*(?:\.\d+)?%?)/g;

  const drawTabularLine = (text: string, x: number, ly: number) => {
    // In simple mode, render the whole line in helvetica (no font switching)
    // for maximum print compatibility and speed.
    if (isSimple) {
      doc.setFont("helvetica", "normal");
      doc.text(text, x, ly);
      return;
    }
    const segments: { text: string; tabular: boolean }[] = [];
    let cursor = 0;
    for (const match of text.matchAll(NUM_TOKEN_RE)) {
      const start = match.index ?? 0;
      if (start > cursor) {
        segments.push({ text: text.slice(cursor, start), tabular: false });
      }
      segments.push({ text: match[0], tabular: true });
      cursor = start + match[0].length;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), tabular: false });
    }
    if (segments.length === 0) {
      doc.text(text, x, ly);
      return;
    }

    let cx = x;
    for (const seg of segments) {
      if (seg.tabular) {
        doc.setFont("courier", "normal");
      } else {
        doc.setFont("helvetica", "normal");
      }
      doc.text(seg.text, cx, ly);
      cx += doc.getTextWidth(seg.text);
    }
    doc.setFont("helvetica", "normal");
  };

  // ---------- Block parsing ----------
  // Recognises:
  //   #, ##, ### headings   → "heading"
  //   -, *, • prefixed lines → unordered "list" item
  //   1. 2. ... prefixed     → ordered "list" item
  //   everything else        → "para" (paragraph, joined across single newlines)
  // Consecutive list items become a single "list" block so we can keep
  // consistent indentation and pre-measure the whole list for pagination.

  type ListItem = { marker: string; lines: string[]; height: number };
  type Block =
    | { kind: "heading"; text: string; height: number }
    | { kind: "para"; lines: string[]; height: number }
    | { kind: "list"; items: ListItem[]; height: number };

  const headingHeight = lineHeight + 4;
  const usablePageHeight = contentBottom - contentTop;

  // Layout constants for lists
  const bulletGutter = 16; // space between marker and text
  const bulletIndent = 0;  // outer indent of the list block

  const isBulletLine = (s: string) => /^\s*([-*•]|\d{1,2}[.)])\s+/.test(s);
  const parseBullet = (s: string): { marker: string; text: string } => {
    const m = s.match(/^\s*([-*•]|\d{1,2}[.)])\s+(.*)$/);
    if (!m) return { marker: "•", text: s };
    const raw = m[1];
    // Normalise "-" / "*" to "•" for visual consistency; keep numbers as-is.
    const marker = /^\d/.test(raw) ? raw : "•";
    return { marker, text: m[2] };
  };

  const measureLines = (text: string, width: number): string[] => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    return doc.splitTextToSize(text, width) as string[];
  };

  // First pass: split into logical units separated by blank lines, but treat
  // each line within a unit individually so we can pull out bullet runs.
  const sourceLines = bodyText.split(/\n/);
  const blocks: Block[] = [];

  let paraBuffer: string[] = [];
  let listBuffer: ListItem[] = [];

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    const text = paraBuffer.join(" ").trim();
    paraBuffer = [];
    if (!text) return;

    const isHeading =
      /^#{1,3}\s+/.test(text) ||
      (text.length <= 80 &&
        !/[.!?]$/.test(text) &&
        text === text.replace(/\s+/g, " "));

    if (isHeading && text.length <= 120) {
      blocks.push({
        kind: "heading",
        text: text.replace(/^#{1,3}\s+/, ""),
        height: headingHeight,
      });
      return;
    }

    const lines = measureLines(text, usable);
    blocks.push({ kind: "para", lines, height: lines.length * lineHeight });
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    const totalHeight = items.reduce((sum, it) => sum + it.height, 0);
    blocks.push({ kind: "list", items, height: totalHeight });
  };

  const textIndent = bulletIndent + bulletGutter;
  const bulletTextWidth = usable - textIndent;

  for (const rawLine of sourceLines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }

    if (isBulletLine(line)) {
      flushPara();
      const { marker, text } = parseBullet(line);
      const wrapped = measureLines(text, bulletTextWidth);
      listBuffer.push({
        marker,
        lines: wrapped,
        height: wrapped.length * lineHeight,
      });
      continue;
    }

    // Non-bullet, non-blank: end any open list, accumulate into paragraph.
    flushList();
    paraBuffer.push(line.trim());
  }
  flushPara();
  flushList();

  // ---------- Pagination + rendering ----------
  const pageBreak = () => {
    doc.addPage();
    drawHeader();
    y = contentTop;
  };
  const remaining = () => contentBottom - y;

  const renderPara = (lines: string[]) => {
    for (const line of lines) {
      if (y + lineHeight > contentBottom) pageBreak();
      drawTabularLine(line, margin, y);
      y += lineHeight;
    }
  };

  const renderListItem = (item: ListItem) => {
    for (let li = 0; li < item.lines.length; li++) {
      if (y + lineHeight > contentBottom) pageBreak();
      if (li === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...inkColor);
        doc.text(item.marker, margin + bulletIndent, y);
      }
      drawTabularLine(item.lines[li], margin + textIndent, y);
      y += lineHeight;
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.kind === "heading") {
      const next = blocks[i + 1];
      const glueHeight =
        block.height +
        (next
          ? next.kind === "para"
            ? Math.min(next.height, lineHeight * 2)
            : next.kind === "list"
              ? Math.min(next.height, next.items[0]?.height ?? lineHeight)
              : next.height
          : 0);
      if (glueHeight > remaining() && glueHeight <= usablePageHeight) {
        pageBreak();
      } else if (block.height > remaining()) {
        pageBreak();
      }

      doc.setFont(isSimple ? "helvetica" : "times", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...inkColor);
      doc.text(block.text, margin, y);
      y += headingHeight;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...inkColor);
    } else if (block.kind === "para") {
      if (block.height <= remaining()) {
        renderPara(block.lines);
      } else if (block.height <= usablePageHeight) {
        pageBreak();
        renderPara(block.lines);
      } else {
        renderPara(block.lines); // line-by-line with safe breaks
      }
    } else {
      // List: keep each item together when possible (avoid splitting an item
      // across pages unless it's larger than a single page).
      for (const item of block.items) {
        if (item.height <= remaining()) {
          renderListItem(item);
        } else if (item.height <= usablePageHeight) {
          pageBreak();
          renderListItem(item);
        } else {
          renderListItem(item);
        }
      }
    }

    if (i < blocks.length - 1) {
      y = Math.min(y + paragraphGap, contentBottom);
    }
  }

  // ---------- Footers across all pages ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  const suffix = isSimple ? "simple" : "branded";
  const filename = `fynhelp-cfo-report-${
    report.brief_date || report.id || "report"
  }-${suffix}.pdf`.replace(/[^a-z0-9.\-_]/gi, "_");
  doc.save(filename);
}
