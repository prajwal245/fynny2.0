import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const BUCKET = "reports";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "https://wiknwxniwqvsxgyzqqxu.supabase.co";
const EXT_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });

// ---------------------------------------------------------------- utilities
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const inr = (n: number) =>
  (n < 0 ? "-Rs. " : "Rs. ") +
  Math.abs(Math.round(n)).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

const enc = (s: string) =>
  String(s ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u20B9/g, "Rs.")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: string) => String(d ?? "").slice(0, 7);
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

type Period = { start: string; end: string; label: string; prevStart: string; prevEnd: string };

function resolvePeriod(p: Record<string, unknown>): Period {
  const shift = (d: string) => {
    const dt = new Date(d);
    dt.setFullYear(dt.getFullYear() - 1);
    return ymd(dt);
  };
  const mk = (start: string, end: string, label: string): Period => ({
    start,
    end,
    label,
    prevStart: shift(start),
    prevEnd: shift(end),
  });

  const ps = typeof p.period_start === "string" ? p.period_start : "";
  const pe = typeof p.period_end === "string" ? p.period_end : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(ps) && /^\d{4}-\d{2}-\d{2}$/.test(pe)) {
    return mk(ps, pe, `${ps} to ${pe}`);
  }

  const month = typeof p.month === "string" ? p.month : "";
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0));
    return mk(`${month}-01`, ymd(last), monthLabel(month));
  }

  const fy = typeof p.fy === "string" ? p.fy : "";
  const fyMatch = fy.match(/(\d{4})/);
  if (fyMatch) {
    const y = Number(fyMatch[1]);
    return mk(`${y}-04-01`, `${y + 1}-03-31`, `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }

  // default: trailing 12 months
  const now = new Date();
  const end = ymd(now);
  const startDt = new Date(now);
  startDt.setMonth(startDt.getMonth() - 11);
  startDt.setDate(1);
  return mk(ymd(startDt), end, `${ymd(startDt)} to ${end}`);
}

// -------------------------------------------------------------- PDF builder
const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 48;
const RIGHT = PAGE_W - 48;
const TEAL = rgb(0.059, 0.431, 0.337);
const DARK = rgb(0.102, 0.102, 0.102);
const GRAY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.827, 0.82, 0.78);

type KV = { kind: "kv"; title: string; rows: [string, string][] };
type TBL = {
  kind: "table";
  title: string;
  headers: string[];
  widths: number[];
  aligns?: ("l" | "r")[];
  rows: string[][];
  totals?: string[];
};
type PARA = { kind: "para"; title?: string; text: string };
type Block = KV | TBL | PARA;

async function buildPdf(opts: {
  businessName: string;
  title: string;
  subtitle: string;
  meta: string[];
  blocks: Block[];
  disclaimer?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(enc(`${opts.title} — ${opts.businessName}`));
  doc.setProducer("FynHelp");
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: any[] = [];
  let page: any;
  let y = 0;

  const txt = (s: string, x: number, yy: number, size: number, font: any, color: any) =>
    page.drawText(enc(s), { x, y: yy, size, font, color });
  const rightTxt = (s: string, xr: number, yy: number, size: number, font: any, color: any) => {
    const v = enc(s);
    page.drawText(v, { x: xr - font.widthOfTextAtSize(v, size), y: yy, size, font, color });
  };
  const rule = (yy: number, thickness = 0.5) =>
    page.drawLine({ start: { x: LEFT, y: yy }, end: { x: RIGHT, y: yy }, thickness, color: LINE });

  const clip = (s: string, font: any, size: number, w: number) => {
    let v = enc(s);
    while (v.length > 1 && font.widthOfTextAtSize(v, size) > w) v = v.slice(0, -1);
    return v;
  };

  const newPage = (first = false) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    if (first) {
      txt(opts.businessName, LEFT, 800, 16, bold, TEAL);
      txt(opts.title, LEFT, 780, 12, bold, DARK);
      txt(opts.subtitle, LEFT, 766, 9, helv, GRAY);
      let my = 752;
      for (const m of opts.meta) {
        txt(m, LEFT, my, 9, helv, GRAY);
        my -= 12;
      }
      rule(my + 2);
      y = my - 14;
    } else {
      txt(opts.businessName, LEFT, 800, 8, helv, GRAY);
      rightTxt(`${opts.title} · ${opts.subtitle}`, RIGHT, 800, 8, helv, GRAY);
      rule(792);
      y = 778;
    }
  };

  newPage(true);
  const ensure = (needed: number) => {
    if (y - needed < 80) newPage();
  };

  const sectionTitle = (title: string) => {
    txt(title, LEFT, y, 10, bold, TEAL);
    y -= 6;
    rule(y, 0.4);
    y -= 14;
  };

  for (const b of opts.blocks) {
    if (b.kind === "para") {
      ensure(40);
      if (b.title) sectionTitle(b.title);
      const words = enc(b.text).split(/\s+/);
      let line = "";
      const maxW = RIGHT - LEFT;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (helv.widthOfTextAtSize(test, 9) > maxW) {
          ensure(14);
          txt(line, LEFT, y, 9, helv, DARK);
          y -= 13;
          line = w;
        } else line = test;
      }
      if (line) {
        ensure(14);
        txt(line, LEFT, y, 9, helv, DARK);
        y -= 13;
      }
      y -= 16;
      continue;
    }

    if (b.kind === "kv") {
      const h = 20 + b.rows.length * 16;
      ensure(h <= 690 ? h : 60);
      sectionTitle(b.title);
      if (!b.rows.length) {
        txt("No data available for this period.", LEFT, y, 9, helv, GRAY);
        y -= 16;
      }
      for (const [label, value] of b.rows) {
        ensure(16);
        const indent = label.startsWith("  ") ? 12 : 0;
        txt(label.trim(), LEFT + indent, y, 9, helv, DARK);
        rightTxt(value, RIGHT, y, 9, bold, DARK);
        y -= 16;
      }
      y -= 20;
      continue;
    }

    // table
    ensure(70);
    sectionTitle(b.title);
    const aligns = b.aligns ?? b.headers.map((_, i) => (i === 0 ? "l" : "r"));
    const xs: number[] = [];
    let acc = LEFT;
    for (const w of b.widths) {
      xs.push(acc);
      acc += w;
    }
    const drawRow = (cells: string[], font: any, size: number, color: any) => {
      cells.forEach((c, i) => {
        const w = b.widths[i] ?? 60;
        if (aligns[i] === "r") {
          const v = clip(c, font, size, w - 6);
          page.drawText(v, { x: xs[i] + w - 6 - font.widthOfTextAtSize(v, size), y, size, font, color });
        } else {
          page.drawText(clip(c, font, size, w - 6), { x: xs[i], y, size, font, color });
        }
      });
      y -= 14;
    };
    const headerRow = () => drawRow(b.headers, bold, 8, GRAY);
    headerRow();
    if (!b.rows.length) {
      txt("No records available for this period.", LEFT, y, 9, helv, GRAY);
      y -= 16;
    }
    for (const r of b.rows) {
      if (y - 14 < 80) {
        newPage();
        headerRow();
      }
      drawRow(r, helv, 8.5, DARK);
    }
    if (b.totals) {
      if (y - 20 < 80) newPage();
      y -= 2;
      rule(y + 8, 0.4);
      drawRow(b.totals, bold, 8.5, DARK);
    }
    y -= 20;
  }

  // disclaimer on last page
  if (y - 26 < 58) newPage();
  y -= 4;
  rule(y, 0.4);
  y -= 12;
  txt(
    opts.disclaimer ??
      "Generated by FynHelp from imported financial data. Figures are unaudited. Verify with your CA before statutory filing.",
    LEFT,
    y,
    8,
    helv,
    GRAY,
  );

  pages.forEach((p, i) => {
    p.drawLine({ start: { x: LEFT, y: 42 }, end: { x: RIGHT, y: 42 }, thickness: 0.5, color: LINE });
    const c = "FynHelp";
    p.drawText(c, { x: (PAGE_W - helv.widthOfTextAtSize(c, 8)) / 2, y: 32, size: 8, font: helv, color: GRAY });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: RIGHT - helv.widthOfTextAtSize(pn, 8), y: 32, size: 8, font: helv, color: GRAY });
  });

  return await doc.save();
}

// ------------------------------------------------------------ categorisation
const OPERATING_IN = ["revenue", "sales", "income", "customer", "receipt", "interest"];
const INVESTING = ["equipment", "asset", "capex", "capital", "property", "investment", "furniture", "computer"];
const FINANCING = ["loan", "emi", "borrow", "capital infusion", "dividend", "share", "interest paid"];
const MATERIAL = ["material", "cogs", "purchase", "inventory", "raw", "vendor", "supplier"];
const EMPLOYEE = ["salary", "salaries", "payroll", "wages", "staff", "employee", "pf", "esi", "bonus"];
const MARKETING = ["marketing", "advert", "ads", "promotion", "campaign", "seo"];
const FINANCE_COST = ["interest", "bank charge", "loan", "emi", "processing fee"];

const hit = (cat: string, list: string[]) => list.some((k) => cat.includes(k));

function cashflowBucket(category: string): "operating" | "investing" | "financing" {
  const c = String(category ?? "").toLowerCase();
  if (hit(c, INVESTING)) return "investing";
  if (hit(c, FINANCING)) return "financing";
  return "operating";
}

function expenseHead(category: string): string {
  const c = String(category ?? "").toLowerCase();
  if (hit(c, EMPLOYEE)) return "Employee benefit expense";
  if (hit(c, MATERIAL)) return "Cost of materials consumed";
  if (hit(c, FINANCE_COST)) return "Finance costs";
  if (hit(c, MARKETING)) return "Marketing and selling expenses";
  return "Other expenses";
}

const signed = (t: any) => {
  const a = num(t.amount);
  const ty = String(t.type ?? "").toLowerCase();
  if (ty === "debit" || ty === "withdrawal") return -Math.abs(a);
  if (ty === "credit" || ty === "deposit") return Math.abs(a);
  return a;
};

// professional tax slab (Karnataka-style default)
const profTax = (gross: number) => (gross > 25000 ? 200 : gross > 15000 ? 150 : 0);

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let reportRowId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "Missing authorization header" }, 401);
    }
    const token = authHeader.slice(7);
    const isServiceRoleToken = (t: string) => {
      if (t === SERVICE_KEY) return true;
      try {
        const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload?.role === "service_role";
      } catch {
        return false;
      }
    };
    const isServiceCall = isServiceRoleToken(token);

    let uid: string | null = null;
    if (!isServiceCall) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return json({ success: false, error: "Invalid or expired session" }, 401);
      }
      uid = userData.user.id;
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const report_type = String(body.report_type ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const business_id = String(body.business_id ?? "");
    const format = String(body.format ?? "pdf").toLowerCase();
    const parameters: Record<string, unknown> =
      body.parameters && typeof body.parameters === "object" ? body.parameters : {};
    reportRowId = typeof body.report_row_id === "string" && UUID_RE.test(body.report_row_id)
      ? body.report_row_id
      : null;

    if (!report_type) return json({ success: false, error: "report_type is required" }, 400);
    if (!UUID_RE.test(business_id)) return json({ success: false, error: "business_id must be a uuid" }, 400);

    // ---- authorisation: caller must own this business
    if (!isServiceCall) {
      const { data: profile } = await admin
        .from("profiles")
        .select("business_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (!profile?.business_id || profile.business_id !== business_id) {
        return json({ success: false, error: "Forbidden: no access to this business" }, 403);
      }
    }

    const period = resolvePeriod(parameters);

    // ---- business identity
    const { data: biz } = await admin
      .from("businesses")
      .select("business_name, gstin, state, business_type, industry")
      .eq("id", business_id)
      .maybeSingle();
    const businessName = biz?.business_name || "Your Business";

    // ---- data loaders
    const ext = createClient(EXT_URL, EXT_KEY, { auth: { persistSession: false } });
    const safe = async (p: PromiseLike<{ data: any; error: unknown }>, label: string) => {
      try {
        const { data, error } = await p;
        if (error) console.warn(`[report] ${label}`, error);
        return (data as any[]) ?? [];
      } catch (e) {
        console.warn(`[report] ${label} threw`, e);
        return [];
      }
    };

    const extRows = (table: string, col = "business_id") =>
      safe(ext.from(table).select("*").eq(col, business_id).limit(5000), table);

    const [
      txnsAll,
      invoices,
      customers,
      gstFilings,
      liquidityRows,
      revenueRows,
      anomalies,
      vendors,
      vendorPayments,
    ] = await Promise.all([
      safe(
        ext.from("bank_transactions").select("*").eq("business_id", business_id)
          .order("date", { ascending: true }).limit(5000),
        "bank_transactions",
      ),
      extRows("invoices"),
      extRows("customers"),
      extRows("gst_filings"),
      safe(
        ext.from("liquidity_metrics").select("*").eq("business_id", business_id)
          .order("recorded_at", { ascending: false }).limit(1),
        "liquidity_metrics",
      ),
      safe(
        ext.from("revenue_metrics").select("*").eq("org_id", business_id)
          .order("created_at", { ascending: false }).limit(1),
        "revenue_metrics",
      ),
      safe(
        ext.from("cost_anomalies").select("*").eq("org_id", business_id)
          .order("detected_at", { ascending: false }).limit(200),
        "cost_anomalies",
      ),
      extRows("vendors"),
      extRows("vendor_payments"),
    ]);

    const [itcRes, tdsRes, complianceRes] = await Promise.all([
      admin.from("ca_itc_records").select("*").eq("business_id", business_id),
      admin.from("ca_tds_records").select("*").eq("business_id", business_id),
      admin.from("ca_compliance_events").select("*").eq("business_id", business_id)
        .order("due_date", { ascending: true }),
    ]);
    const itc = itcRes.data ?? [];
    const tds = tdsRes.data ?? [];
    const compliance = complianceRes.data ?? [];

    const liquidity = liquidityRows[0] ?? null;
    const revenue = revenueRows[0] ?? null;
    const custName = (id: unknown) =>
      customers.find((c: any) => c.id === id)?.customer_name ?? "Unknown customer";
    const custGstin = (id: unknown) =>
      customers.find((c: any) => c.id === id)?.gstin ?? null;

    const inRange = (d: unknown, s: string, e: string) => {
      const v = String(d ?? "").slice(0, 10);
      return !!v && v >= s && v <= e;
    };
    const txns = txnsAll.filter((t: any) => inRange(t.date, period.start, period.end));
    const txnsPrev = txnsAll.filter((t: any) => inRange(t.date, period.prevStart, period.prevEnd));
    const invPeriod = invoices.filter((i: any) =>
      inRange(i.invoice_date ?? i.created_at, period.start, period.end));

    // ---------- shared P&L computation
    const pnlFor = (rows: any[]) => {
      const revenueOps = rows.reduce((s, t) => {
        const v = signed(t);
        const c = String(t.category ?? "").toLowerCase();
        return v > 0 && (hit(c, OPERATING_IN) || !c) ? s + v : s;
      }, 0);
      const otherIncome = rows.reduce((s, t) => {
        const v = signed(t);
        const c = String(t.category ?? "").toLowerCase();
        return v > 0 && c && !hit(c, OPERATING_IN) ? s + v : s;
      }, 0);
      const heads: Record<string, number> = {};
      for (const t of rows) {
        const v = signed(t);
        if (v >= 0) continue;
        const h = expenseHead(String(t.category ?? ""));
        heads[h] = (heads[h] ?? 0) + Math.abs(v);
      }
      const totalRevenue = revenueOps + otherIncome;
      const financeCosts = heads["Finance costs"] ?? 0;
      const depreciation = Math.round(
        rows.reduce((s, t) => {
          const v = signed(t);
          return v < 0 && cashflowBucket(String(t.category ?? "")) === "investing"
            ? s + Math.abs(v) * 0.15
            : s;
        }, 0),
      );
      const totalExpenses =
        Object.values(heads).reduce((s, v) => s + v, 0) + depreciation;
      const pbt = totalRevenue - totalExpenses;
      const ebitda = totalRevenue - (totalExpenses - financeCosts - depreciation);
      const tax = pbt > 0 ? pbt * 0.25 : 0;
      return {
        revenueOps, otherIncome, totalRevenue, heads, depreciation, financeCosts,
        totalExpenses, pbt, ebitda, tax, pat: pbt - tax,
      };
    };

    const cur = pnlFor(txns);
    const prev = pnlFor(txnsPrev);
    const hasPrev = txnsPrev.length > 0;
    const pv = (n: number) => (hasPrev ? inr(n) : "—");

    const monthsOf = (rows: any[]) => {
      const m = new Map<string, { in: number; out: number }>();
      for (const t of rows) {
        const k = monthKey(String(t.date ?? ""));
        if (!k) continue;
        const e = m.get(k) ?? { in: 0, out: 0 };
        const v = signed(t);
        if (v >= 0) e.in += v;
        else e.out += Math.abs(v);
        m.set(k, e);
      }
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };

    const meta = [
      `Period: ${period.label}`,
      `GSTIN: ${biz?.gstin ?? "—"}    State: ${biz?.state ?? "—"}`,
      `Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
    ];

    let bytes: Uint8Array;
    let ext_name = "pdf";
    let contentType = "application/pdf";
    let title = report_type.replace(/_/g, " ").toUpperCase();

    const makePdf = (t: string, blocks: Block[], disclaimer?: string) =>
      buildPdf({ businessName, title: t, subtitle: period.label, meta, blocks, disclaimer });

    const jsonFile = (obj: unknown) => {
      ext_name = "json";
      contentType = "application/json";
      return new TextEncoder().encode(JSON.stringify(obj, null, 2));
    };

    // ------------------------------------------------------------ builders
    switch (report_type) {
      case "profit_loss":
      case "pnl_sch3": {
        title = report_type === "pnl_sch3"
          ? "STATEMENT OF PROFIT AND LOSS (Schedule III)"
          : "PROFIT AND LOSS STATEMENT";
        const head = (k: string) => cur.heads[k] ?? 0;
        const phead = (k: string) => prev.heads[k] ?? 0;
        const rows: string[][] = [
          ["I. Revenue from operations", inr(cur.revenueOps), pv(prev.revenueOps)],
          ["II. Other income", inr(cur.otherIncome), pv(prev.otherIncome)],
          ["III. Total revenue (I + II)", inr(cur.totalRevenue), pv(prev.totalRevenue)],
          ["IV. Cost of materials consumed", inr(head("Cost of materials consumed")), pv(phead("Cost of materials consumed"))],
          ["     Employee benefit expense", inr(head("Employee benefit expense")), pv(phead("Employee benefit expense"))],
          ["     Finance costs", inr(cur.financeCosts), pv(prev.financeCosts)],
          ["     Depreciation and amortisation", inr(cur.depreciation), pv(prev.depreciation)],
          ["     Marketing and selling expenses", inr(head("Marketing and selling expenses")), pv(phead("Marketing and selling expenses"))],
          ["     Other expenses", inr(head("Other expenses")), pv(phead("Other expenses"))],
          ["V. Total expenses", inr(cur.totalExpenses), pv(prev.totalExpenses)],
          ["VI. Profit before exceptional items (III - V)", inr(cur.pbt), pv(prev.pbt)],
          ["VII. Exceptional items", inr(0), hasPrev ? inr(0) : "—"],
          ["VIII. Profit before tax (VI - VII)", inr(cur.pbt), pv(prev.pbt)],
          ["IX. Tax expense (current tax @ 25%)", inr(cur.tax), pv(prev.tax)],
          ["X. Profit for the period", inr(cur.pat), pv(prev.pat)],
        ];
        bytes = await makePdf(title, [
          {
            kind: "table",
            title: "STATEMENT OF PROFIT AND LOSS",
            headers: ["Particulars", "Current period", "Previous period"],
            widths: [270, 115, 114],
            aligns: ["l", "r", "r"],
            rows,
          },
          {
            kind: "kv",
            title: "PERFORMANCE INDICATORS",
            rows: [
              ["EBITDA", inr(cur.ebitda)],
              ["EBITDA margin", cur.totalRevenue ? pct((cur.ebitda / cur.totalRevenue) * 100) : "—"],
              ["PAT margin", cur.totalRevenue ? pct((cur.pat / cur.totalRevenue) * 100) : "—"],
              ["Transactions considered", String(txns.length)],
              ["Invoices in period", String(invPeriod.length)],
              ["Output tax (GST filings)", inr(gstFilings.reduce((s: number, g: any) => s + num(g.output_tax), 0))],
              ["Input tax credit (GST filings)", inr(gstFilings.reduce((s: number, g: any) => s + num(g.input_tax_credit), 0))],
            ],
          },
          {
            kind: "para",
            text:
              "Prepared on Companies Act 2013 Schedule III lines from imported bank and invoice data. Depreciation is an estimate derived from capital expenditure transactions.",
          },
        ]);
        break;
      }

      case "cash_flow": {
        title = "CASH FLOW STATEMENT";
        const buckets = { operating: { in: 0, out: 0 }, investing: { in: 0, out: 0 }, financing: { in: 0, out: 0 } };
        for (const t of txns) {
          const v = signed(t);
          const b = cashflowBucket(String(t.category ?? ""));
          if (v >= 0) buckets[b].in += v;
          else buckets[b].out += Math.abs(v);
        }
        const withBal = txns.filter((t: any) => t.balance !== null && t.balance !== undefined);
        const opening = withBal.length ? num(withBal[0].balance) : 0;
        const closing = withBal.length ? num(withBal[withBal.length - 1].balance) : opening;
        const months = monthsOf(txns);
        let running = opening;
        const mRows = months.map(([k, v]) => {
          const open = running;
          running = open + v.in - v.out;
          return [monthLabel(k), inr(open), inr(v.in), inr(v.out), inr(v.in - v.out), inr(running)];
        });
        bytes = await makePdf(title, [
          {
            kind: "kv",
            title: "A. CASH FLOW FROM OPERATING ACTIVITIES",
            rows: [
              ["Cash received from customers and operations", inr(buckets.operating.in)],
              ["Cash paid to suppliers, employees and overheads", inr(-buckets.operating.out)],
              ["Net cash from operating activities", inr(buckets.operating.in - buckets.operating.out)],
            ],
          },
          {
            kind: "kv",
            title: "B. CASH FLOW FROM INVESTING ACTIVITIES",
            rows: [
              ["Proceeds from sale of assets / investments", inr(buckets.investing.in)],
              ["Purchase of equipment and capital assets", inr(-buckets.investing.out)],
              ["Net cash used in investing activities", inr(buckets.investing.in - buckets.investing.out)],
            ],
          },
          {
            kind: "kv",
            title: "C. CASH FLOW FROM FINANCING ACTIVITIES",
            rows: [
              ["Proceeds from borrowings / capital", inr(buckets.financing.in)],
              ["Repayment of borrowings, interest and dividends", inr(-buckets.financing.out)],
              ["Net cash from financing activities", inr(buckets.financing.in - buckets.financing.out)],
            ],
          },
          {
            kind: "kv",
            title: "NET MOVEMENT IN CASH",
            rows: [
              ["Opening cash and bank balance", inr(opening)],
              ["Net increase / (decrease) in cash", inr(closing - opening)],
              ["Closing cash and bank balance", inr(closing)],
            ],
          },
          {
            kind: "table",
            title: "MONTH-WISE CASH MOVEMENT",
            headers: ["Month", "Opening", "Inflows", "Outflows", "Net", "Closing"],
            widths: [92, 82, 82, 82, 82, 79],
            aligns: ["l", "r", "r", "r", "r", "r"],
            rows: mRows,
            totals: [
              "Total",
              "",
              inr(months.reduce((s, [, v]) => s + v.in, 0)),
              inr(months.reduce((s, [, v]) => s + v.out, 0)),
              inr(months.reduce((s, [, v]) => s + v.in - v.out, 0)),
              "",
            ],
          },
        ]);
        break;
      }

      case "gst_summary": {
        title = "GST SUMMARY";
        const totTaxable = gstFilings.reduce((s: number, g: any) => s + num(g.taxable_sales), 0);
        const totOutput = gstFilings.reduce((s: number, g: any) => s + num(g.output_tax), 0);
        const totItc = itc.reduce((s: number, r: any) => s + num(r.total_itc), 0) ||
          gstFilings.reduce((s: number, g: any) => s + num(g.input_tax_credit), 0);
        const totPayable = gstFilings.reduce((s: number, g: any) => s + num(g.tax_payable), 0);

        if (format === "json") {
          const retPeriod = period.end.slice(5, 7) + period.end.slice(0, 4);
          bytes = jsonFile({
            gstin: biz?.gstin ?? gstFilings[0]?.gstin ?? "",
            ret_period: retPeriod,
            inward_sup: { isup_details: [{ ty: "GST", inter: 0, intra: 0 }] },
            sup_details: {
              osup_det: {
                txval: Math.round(totTaxable),
                iamt: Math.round(totOutput),
                camt: 0,
                samt: 0,
                csamt: 0,
              },
            },
            itc_elg: {
              itc_avl: [{
                ty: "IMPG",
                iamt: Math.round(itc.reduce((s: number, r: any) => s + num(r.igst_amount), 0)),
                camt: Math.round(itc.reduce((s: number, r: any) => s + num(r.cgst_amount), 0)),
                samt: Math.round(itc.reduce((s: number, r: any) => s + num(r.sgst_amount), 0)),
                csamt: 0,
              }],
            },
            intr_ltfee: { intr_details: { iamt: 0, camt: 0, samt: 0 } },
          });
          break;
        }

        bytes = await makePdf(title, [
          {
            kind: "table",
            title: "GST RETURN REGISTER",
            headers: ["Return", "Period", "Due date", "Filed", "Taxable value", "Output tax", "ITC", "Net payable", "Status"],
            widths: [46, 56, 56, 56, 68, 58, 52, 58, 49],
            aligns: ["l", "l", "l", "l", "r", "r", "r", "r", "l"],
            rows: gstFilings.map((g: any) => [
              String(g.return_type ?? "—"),
              String(g.filing_period ?? "—"),
              String(g.due_date ?? "—").slice(0, 10),
              String(g.filed_date ?? "—").slice(0, 10),
              inr(num(g.taxable_sales)),
              inr(num(g.output_tax)),
              inr(num(g.input_tax_credit)),
              inr(num(g.tax_payable)),
              String(g.status ?? "—"),
            ]),
            totals: ["Total", "", "", "", inr(totTaxable), inr(totOutput), inr(totItc), inr(totPayable), ""],
          },
          {
            kind: "kv",
            title: "ITC RECONCILIATION (GSTR-2B)",
            rows: [
              ["ITC records on file", String(itc.length)],
              ["Total ITC claimed", inr(itc.reduce((s: number, r: any) => s + num(r.total_itc), 0))],
              ["Matched with 2B", String(itc.filter((r: any) => r.match_status === "matched").length)],
              ["Mismatched value", inr(itc.reduce((s: number, r: any) => s + num(r.mismatch_amount), 0))],
              ["Invoices in period", String(invPeriod.length)],
            ],
          },
        ]);
        break;
      }

      case "gstr1": {
        title = "GSTR-1";
        const fp = period.end.slice(5, 7) + period.end.slice(0, 4);
        const b2bMap = new Map<string, any[]>();
        const b2cs: any[] = [];
        let gt = 0;
        for (const i of invPeriod) {
          const total = num(i.total_amount);
          const taxable = num(i.taxable_value) || Math.round((total / 1.18) * 100) / 100;
          const rate = num(i.gst_rate) || 18;
          const taxAmt = Math.round((total - taxable) * 100) / 100;
          gt += taxable;
          const ctin = custGstin(i.customer_id);
          const idt = String(i.invoice_date ?? "").slice(0, 10).split("-").reverse().join("-");
          if (ctin) {
            const arr = b2bMap.get(ctin) ?? [];
            arr.push({
              inum: String(i.invoice_number ?? i.id ?? ""),
              idt,
              val: total,
              pos: String(i.place_of_supply ?? "29"),
              rchrg: "N",
              itms: [{
                num: 1,
                itm_det: { txval: taxable, rt: rate, iamt: taxAmt, camt: 0, samt: 0, csamt: 0 },
              }],
            });
            b2bMap.set(ctin, arr);
          } else {
            b2cs.push({
              sply_ty: "INTRA",
              typ: "OE",
              pos: String(i.place_of_supply ?? "29"),
              rt: rate,
              txval: taxable,
              iamt: 0,
              camt: Math.round((taxAmt / 2) * 100) / 100,
              samt: Math.round((taxAmt / 2) * 100) / 100,
              csamt: 0,
            });
          }
        }
        bytes = jsonFile({
          gstin: biz?.gstin ?? "",
          fp,
          gt: Math.round(gt),
          cur_gt: Math.round(gt),
          b2b: [...b2bMap.entries()].map(([ctin, inv]) => ({ ctin, inv })),
          b2cs,
        });
        break;
      }

      case "tds_return": {
        title = "TDS RETURN (FORM 26Q)";
        const totalDeducted = tds.reduce((s: number, r: any) => s + num(r.tds_amount), 0);
        const totalDeposited = tds.reduce((s: number, r: any) => s + num(r.deposited_amount), 0);
        const quarters = [...new Set(tds.map((r: any) => String(r.quarter ?? "—")))].sort();
        bytes = await makePdf(title, [
          {
            kind: "kv",
            title: "DEDUCTOR DETAILS",
            rows: [
              ["Deductor name", businessName],
              ["GSTIN", String(biz?.gstin ?? "—")],
              ["State", String(biz?.state ?? "—")],
              ["Quarters covered", quarters.join(", ") || "—"],
              ["Form", "26Q — TDS on payments other than salary"],
            ],
          },
          {
            kind: "table",
            title: "DEDUCTEE-WISE STATEMENT",
            headers: ["Deductee", "PAN", "Sec", "Qtr", "Payment", "Rate", "TDS", "Deposited", "Challan"],
            widths: [86, 62, 34, 34, 62, 32, 58, 58, 73],
            aligns: ["l", "l", "l", "l", "r", "r", "r", "r", "l"],
            rows: tds.map((r: any) => [
              String(r.deductee_name ?? "—"),
              String(r.deductee_pan ?? "—"),
              String(r.section_code ?? "—"),
              String(r.quarter ?? "—"),
              inr(num(r.payment_amount)),
              `${num(r.tds_rate)}%`,
              inr(num(r.tds_amount)),
              inr(num(r.deposited_amount)),
              String(r.challan_number ?? "—"),
            ]),
            totals: ["Total", "", "", "", "", "", inr(totalDeducted), inr(totalDeposited), ""],
          },
          {
            kind: "kv",
            title: "SUMMARY",
            rows: [
              ["Total deductees", String(tds.length)],
              ["Total tax deducted", inr(totalDeducted)],
              ["Total deposited", inr(totalDeposited)],
              ["Outstanding", inr(totalDeducted - totalDeposited)],
              ["Returns filed", String(tds.filter((r: any) => r.return_filed).length)],
            ],
          },
        ]);
        break;
      }

      case "balance_sheet_sch3": {
        title = "BALANCE SHEET (Schedule III, Division I)";
        const cumulativeNet = txnsAll.reduce((s: number, t: any) => s + signed(t), 0);
        const cash = liquidity ? num(liquidity.cash_position) : cumulativeNet;
        const receivables = invoices.reduce(
          (s: number, i: any) => s + (num(i.outstanding_amount) || Math.max(0, num(i.total_amount) - num(i.paid_amount))),
          0,
        );
        const payables = vendorPayments.reduce(
          (s: number, v: any) => s + (num(v.outstanding_amount) || Math.max(0, num(v.amount) - num(v.paid_amount))),
          0,
        );
        const capex = txnsAll.reduce((s: number, t: any) => {
          const v = signed(t);
          return v < 0 && cashflowBucket(String(t.category ?? "")) === "investing" ? s + Math.abs(v) : s;
        }, 0);
        const fixedAssets = Math.round(capex * 0.85);
        const reserves = cumulativeNet;
        const shareCapital = 100000;
        const totalEq = shareCapital + reserves + payables;
        const totalAssets = fixedAssets + cash + receivables;
        bytes = await makePdf(title, [
          {
            kind: "table",
            title: "I. EQUITY AND LIABILITIES",
            headers: ["Particulars", "Note", "Current year", "Previous year"],
            widths: [230, 40, 115, 114],
            aligns: ["l", "l", "r", "r"],
            rows: [
              ["Shareholders' funds", "", "", ""],
              ["  Share capital", "1", inr(shareCapital), "—"],
              ["  Reserves and surplus (retained earnings)", "2", inr(reserves), "—"],
              ["Current liabilities", "", "", ""],
              ["  Trade payables", "3", inr(payables), "—"],
              ["  Other current liabilities", "4", inr(0), "—"],
            ],
            totals: ["TOTAL", "", inr(totalEq), "—"],
          },
          {
            kind: "table",
            title: "II. ASSETS",
            headers: ["Particulars", "Note", "Current year", "Previous year"],
            widths: [230, 40, 115, 114],
            aligns: ["l", "l", "r", "r"],
            rows: [
              ["Non-current assets", "", "", ""],
              ["  Property, plant and equipment (net)", "5", inr(fixedAssets), "—"],
              ["Current assets", "", "", ""],
              ["  Inventories", "6", inr(0), "—"],
              ["  Trade receivables", "7", inr(receivables), "—"],
              ["  Cash and cash equivalents", "8", inr(cash), "—"],
            ],
            totals: ["TOTAL", "", inr(totalAssets), "—"],
          },
          {
            kind: "kv",
            title: "NOTES TO ACCOUNTS",
            rows: [
              ["1. Share capital", "Placeholder — no cap table imported"],
              ["2. Reserves and surplus", "Cumulative net cash flow from imported transactions"],
              ["3. Trade payables", `${vendorPayments.length} vendor payment records`],
              ["5. Fixed assets", "Estimated from capital expenditure, net of 15% depreciation"],
              ["7. Trade receivables", `${invoices.length} invoices on record`],
              ["8. Cash", liquidity ? "From latest liquidity snapshot" : "Derived from bank transactions"],
            ],
          },
          {
            kind: "para",
            text:
              "Prepared from imported financial data. To be reviewed by qualified CA before statutory filing. Balance sheet does not necessarily tally where the imported dataset is incomplete.",
          },
        ]);
        break;
      }

      case "payroll_register": {
        title = "PAYROLL REGISTER";
        const { data: staff } = await admin
          .from("profiles")
          .select("full_name, display_name, role")
          .eq("business_id", business_id);
        const people = staff ?? [];
        const salaryTxns = txns.filter((t: any) =>
          signed(t) < 0 && hit(String(t.category ?? "").toLowerCase(), EMPLOYEE));
        const monthlyPayroll = salaryTxns.reduce((s: number, t: any) => s + Math.abs(signed(t)), 0);
        const perHead = people.length ? monthlyPayroll / people.length : 0;

        const rows = people.map((p: any) => {
          const gross = Math.round(perHead);
          const basic = Math.round(gross * 0.5);
          const hra = Math.round(gross * 0.2);
          const special = gross - basic - hra;
          const pf = Math.round(basic * 0.12);
          const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
          const pt = profTax(gross);
          const tdsAmt = 0;
          const net = gross - pf - esi - pt - tdsAmt;
          return {
            name: p.display_name || p.full_name || "Unnamed",
            role: p.role || "Employee",
            basic, hra, special, gross, pf, esi, pt, tdsAmt, net,
          };
        });

        if (format === "excel" || format === "xlsx") {
          ext_name = "xlsx";
          contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          const aoa: (string | number)[][] = [
            ["Employee", "Designation", "Basic", "HRA", "Special Allowance", "Gross", "PF", "ESI", "Prof. Tax", "TDS", "Net Pay"],
            ...rows.map((r) => [r.name, r.role, r.basic, r.hra, r.special, r.gross, r.pf, r.esi, r.pt, r.tdsAmt, r.net]),
          ];
          if (rows.length) {
            aoa.push([
              "TOTAL", "",
              rows.reduce((s, r) => s + r.basic, 0),
              rows.reduce((s, r) => s + r.hra, 0),
              rows.reduce((s, r) => s + r.special, 0),
              rows.reduce((s, r) => s + r.gross, 0),
              rows.reduce((s, r) => s + r.pf, 0),
              rows.reduce((s, r) => s + r.esi, 0),
              rows.reduce((s, r) => s + r.pt, 0),
              0,
              rows.reduce((s, r) => s + r.net, 0),
            ]);
          } else {
            aoa.push(["Import employee data to generate payroll register."]);
          }
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          ws["!cols"] = [{ wch: 26 }, { wch: 18 }, ...Array(9).fill({ wch: 14 })];
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Payroll");
          bytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
          break;
        }

        bytes = await makePdf(title, [
          {
            kind: "table",
            title: `PAYROLL REGISTER — ${period.label}`,
            headers: ["Employee", "Designation", "Basic", "HRA", "Special", "Gross", "PF", "ESI", "PT", "Net pay"],
            widths: [82, 58, 48, 44, 48, 50, 42, 34, 30, 63],
            aligns: ["l", "l", "r", "r", "r", "r", "r", "r", "r", "r"],
            rows: rows.map((r) => [
              r.name, r.role, inr(r.basic), inr(r.hra), inr(r.special), inr(r.gross),
              inr(r.pf), inr(r.esi), inr(r.pt), inr(r.net),
            ]),
            totals: rows.length
              ? [
                "TOTAL", "",
                inr(rows.reduce((s, r) => s + r.basic, 0)),
                inr(rows.reduce((s, r) => s + r.hra, 0)),
                inr(rows.reduce((s, r) => s + r.special, 0)),
                inr(rows.reduce((s, r) => s + r.gross, 0)),
                inr(rows.reduce((s, r) => s + r.pf, 0)),
                inr(rows.reduce((s, r) => s + r.esi, 0)),
                inr(rows.reduce((s, r) => s + r.pt, 0)),
                inr(rows.reduce((s, r) => s + r.net, 0)),
              ]
              : undefined,
          },
          {
            kind: "para",
            text: people.length
              ? "Salary components are apportioned from payroll bank outflows across recorded team members. PF at 12% of basic, ESI at 0.75% where gross is Rs. 21,000 or below, professional tax on slab."
              : "Import employee data to generate payroll register.",
          },
        ]);
        break;
      }

      case "burn_rate": {
        title = "BURN RATE AND RUNWAY";
        const months = monthsOf(txnsAll).slice(-12);
        const burnRows = months.map(([k, v], idx) => {
          const prevOut = idx > 0 ? months[idx - 1][1].out : 0;
          const mom = prevOut ? ((v.out - prevOut) / prevOut) * 100 : 0;
          return [monthLabel(k), inr(v.out), idx > 0 && prevOut ? pct(mom) : "—"];
        });
        const outs = months.map(([, v]) => v.out);
        const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
        const avg3 = avg(outs.slice(-3));
        const avg6 = avg(outs.slice(-6));
        const currentBurn = liquidity ? num(liquidity.burn_rate_current) || avg3 : avg3;
        const cash = liquidity ? num(liquidity.cash_position) : txnsAll.reduce((s: number, t: any) => s + signed(t), 0);
        const runway = (burn: number) => (burn > 0 ? `${(cash / burn).toFixed(1)} months` : "—");
        bytes = await makePdf(title, [
          {
            kind: "kv",
            title: "CURRENT POSITION",
            rows: [
              ["Cash position", inr(cash)],
              ["Current monthly burn", inr(currentBurn)],
              ["3-month average burn", inr(avg3)],
              ["6-month average burn", inr(avg6)],
              ["Runway at current burn", liquidity && num(liquidity.runway_months) ? `${num(liquidity.runway_months).toFixed(1)} months` : runway(currentBurn)],
              ["Health status", String(liquidity?.health_status ?? "—")],
            ],
          },
          {
            kind: "table",
            title: "MONTHLY BURN TREND",
            headers: ["Month", "Total outflow", "MoM change"],
            widths: [180, 160, 159],
            aligns: ["l", "r", "r"],
            rows: burnRows,
          },
          {
            kind: "kv",
            title: "COST REDUCTION SCENARIOS",
            rows: [
              ["Runway at current burn", runway(currentBurn)],
              ["Runway with 10% cost reduction", runway(currentBurn * 0.9)],
              ["Runway with 20% cost reduction", runway(currentBurn * 0.8)],
              ["Cash saved per month at 10%", inr(currentBurn * 0.1)],
              ["Cash saved per month at 20%", inr(currentBurn * 0.2)],
            ],
          },
        ]);
        break;
      }

      case "receivables": {
        title = "ACCOUNTS RECEIVABLE AGEING";
        const today = ymd(new Date());
        const open = invoices.filter((i: any) => {
          const outstanding = num(i.outstanding_amount) || Math.max(0, num(i.total_amount) - num(i.paid_amount));
          return String(i.status ?? "").toLowerCase() !== "paid" && outstanding > 0;
        });
        const bucketOf = (d: number) => (d <= 30 ? "0-30 days" : d <= 60 ? "31-60 days" : d <= 90 ? "61-90 days" : "90+ days");
        const enriched = open.map((i: any) => {
          const due = String(i.due_date ?? i.invoice_date ?? today).slice(0, 10);
          const overdue = Math.max(0, daysBetween(due, today));
          const outstanding = num(i.outstanding_amount) || Math.max(0, num(i.total_amount) - num(i.paid_amount));
          return { i, due, overdue, outstanding, bucket: bucketOf(overdue) };
        }).sort((a, b) => b.overdue - a.overdue);
        const buckets = ["0-30 days", "31-60 days", "61-90 days", "90+ days"];
        bytes = await makePdf(title, [
          {
            kind: "table",
            title: "AGEING SUMMARY",
            headers: ["Ageing bucket", "Invoices", "Outstanding"],
            widths: [180, 160, 159],
            aligns: ["l", "r", "r"],
            rows: buckets.map((b) => [
              b,
              String(enriched.filter((e) => e.bucket === b).length),
              inr(enriched.filter((e) => e.bucket === b).reduce((s, e) => s + e.outstanding, 0)),
            ]),
            totals: ["Total", String(enriched.length), inr(enriched.reduce((s, e) => s + e.outstanding, 0))],
          },
          {
            kind: "table",
            title: "OUTSTANDING INVOICES",
            headers: ["Customer", "Invoice", "Date", "Due", "Total", "Paid", "Outstanding", "Overdue", "Bucket"],
            widths: [78, 58, 52, 52, 56, 50, 60, 42, 51],
            aligns: ["l", "l", "l", "l", "r", "r", "r", "r", "l"],
            rows: enriched.slice(0, 200).map((e) => [
              custName(e.i.customer_id),
              String(e.i.invoice_number ?? "—"),
              String(e.i.invoice_date ?? "—").slice(0, 10),
              e.due,
              inr(num(e.i.total_amount)),
              inr(num(e.i.paid_amount)),
              inr(e.outstanding),
              `${e.overdue}d`,
              e.bucket,
            ]),
          },
        ]);
        break;
      }

      case "board_pack":
      case "investor_update": {
        title = report_type === "board_pack" ? "BOARD PACK" : "INVESTOR UPDATE";
        const months = monthsOf(txnsAll).slice(-12);
        const topMonths = [...months].sort((a, b) => b[1].in - a[1].in).slice(0, 3);
        const criticalAnoms = anomalies.filter((a: any) =>
          ["critical", "high"].includes(String(a.severity ?? "").toLowerCase()));
        const mrr = revenue ? num(revenue.mrr) : 0;
        const cash = liquidity ? num(liquidity.cash_position) : 0;
        bytes = await makePdf(title, [
          {
            kind: "para",
            title: "EXECUTIVE SUMMARY",
            text:
              `${businessName} closed ${period.label} with revenue of ${inr(cur.totalRevenue)} against total expenses of ${inr(cur.totalExpenses)}, ` +
              `producing a ${cur.pbt >= 0 ? "profit" : "loss"} before tax of ${inr(Math.abs(cur.pbt))}. ` +
              `Cash on hand stands at ${inr(cash)} with a monthly burn of ${inr(liquidity ? num(liquidity.burn_rate_current) : 0)}, ` +
              `giving a runway of ${liquidity && num(liquidity.runway_months) ? `${num(liquidity.runway_months).toFixed(1)} months` : "an indeterminate period"}. ` +
              `${criticalAnoms.length} cost anomal${criticalAnoms.length === 1 ? "y is" : "ies are"} flagged for attention.`,
          },
          {
            kind: "kv",
            title: "KEY METRICS",
            rows: [
              ["MRR", revenue ? inr(mrr) : "—"],
              ["ARR", revenue ? inr(num(revenue.arr)) : "—"],
              ["MoM revenue growth", revenue && revenue.revenue_growth_rate != null ? pct(num(revenue.revenue_growth_rate)) : "—"],
              ["Customers", revenue ? String(revenue.customer_count ?? "—") : String(customers.length)],
              ["Churn rate", revenue && revenue.churn_rate != null ? pct(num(revenue.churn_rate)) : "—"],
              ["LTV", revenue && revenue.ltv != null ? inr(num(revenue.ltv)) : "—"],
              ["Cash", inr(cash)],
              ["Monthly burn", liquidity ? inr(num(liquidity.burn_rate_current)) : "—"],
              ["Runway", liquidity && num(liquidity.runway_months) ? `${num(liquidity.runway_months).toFixed(1)} months` : "—"],
            ],
          },
          {
            kind: "table",
            title: "HIGHLIGHTS — TOP REVENUE MONTHS",
            headers: ["Month", "Inflows", "Outflows", "Net"],
            widths: [140, 120, 120, 119],
            aligns: ["l", "r", "r", "r"],
            rows: topMonths.map(([k, v]) => [monthLabel(k), inr(v.in), inr(v.out), inr(v.in - v.out)]),
          },
          {
            kind: "table",
            title: "RISKS — FLAGGED COST ANOMALIES",
            headers: ["Category", "Expected", "Actual", "Deviation", "Severity"],
            widths: [160, 90, 90, 80, 79],
            aligns: ["l", "r", "r", "r", "l"],
            rows: criticalAnoms.slice(0, 20).map((a: any) => [
              String(a.category ?? "—"),
              inr(num(a.expected_amount)),
              inr(num(a.actual_amount)),
              pct(num(a.deviation_pct)),
              String(a.severity ?? "—"),
            ]),
          },
          {
            kind: "para",
            title: "THE ASK",
            text:
              "Add your funding, hiring or strategic asks here before circulating this pack. FynHelp populates the numbers; the narrative is yours.",
          },
        ]);
        break;
      }

      case "mis_report": {
        title = "MIS REPORT";
        const totalIn = txns.reduce((s: number, t: any) => (signed(t) > 0 ? s + signed(t) : s), 0);
        const totalOut = txns.reduce((s: number, t: any) => (signed(t) < 0 ? s + Math.abs(signed(t)) : s), 0);
        const invoiced = invPeriod.reduce((s: number, i: any) => s + num(i.total_amount), 0);
        const collected = invPeriod.reduce((s: number, i: any) => s + num(i.paid_amount), 0);
        const receivable = invoices.reduce(
          (s: number, i: any) => s + (num(i.outstanding_amount) || Math.max(0, num(i.total_amount) - num(i.paid_amount))), 0);
        const overdue = compliance.filter((e: any) =>
          e.status !== "filed" && e.due_date && new Date(e.due_date) < new Date());
        bytes = await makePdf(title, [
          {
            kind: "kv",
            title: "1. EXECUTIVE SUMMARY",
            rows: [
              ["Net cash flow", inr(totalIn - totalOut)],
              ["Cash position", liquidity ? inr(num(liquidity.cash_position)) : "—"],
              ["Outstanding receivables", inr(receivable)],
              ["Overdue compliance events", String(overdue.length)],
              ["Health status", String(liquidity?.health_status ?? "—")],
            ],
          },
          {
            kind: "kv",
            title: "2. CASH FLOW",
            rows: [
              ["Total inflows", inr(totalIn)],
              ["Total outflows", inr(totalOut)],
              ["Net cash flow", inr(totalIn - totalOut)],
              ["Transactions in period", String(txns.length)],
            ],
          },
          {
            kind: "kv",
            title: "3. REVENUE",
            rows: [
              ["Total invoiced", inr(invoiced)],
              ["Total collected", inr(collected)],
              ["Outstanding receivables", inr(receivable)],
              ["MRR", revenue ? inr(num(revenue.mrr)) : "—"],
              ["ARR", revenue ? inr(num(revenue.arr)) : "—"],
            ],
          },
          {
            kind: "kv",
            title: "4. GST AND TDS",
            rows: [
              ["GST filings on record", String(gstFilings.length)],
              ["Output tax", inr(gstFilings.reduce((s: number, g: any) => s + num(g.output_tax), 0))],
              ["Input tax credit", inr(gstFilings.reduce((s: number, g: any) => s + num(g.input_tax_credit), 0))],
              ["TDS deducted", inr(tds.reduce((s: number, r: any) => s + num(r.tds_amount), 0))],
              ["TDS deposited", inr(tds.reduce((s: number, r: any) => s + num(r.deposited_amount), 0))],
            ],
          },
          {
            kind: "table",
            title: "5. COMPLIANCE REGISTER",
            headers: ["Event", "Period", "Due date", "Status"],
            widths: [150, 120, 110, 119],
            aligns: ["l", "l", "l", "l"],
            rows: compliance.slice(0, 40).map((e: any) => [
              String(e.event_type ?? "—"),
              String(e.filing_period ?? "—"),
              String(e.due_date ?? "—").slice(0, 10),
              String(e.status ?? "—"),
            ]),
          },
        ]);
        break;
      }

      default: {
        // Structured fallback — never returns an empty file.
        title = report_type.replace(/_/g, " ").toUpperCase();
        bytes = await makePdf(title, [
          {
            kind: "kv",
            title: "BUSINESS DETAILS",
            rows: [
              ["Business", businessName],
              ["GSTIN", String(biz?.gstin ?? "—")],
              ["State", String(biz?.state ?? "—")],
              ["Business type", String(biz?.business_type ?? "—")],
              ["Report type", report_type],
              ["Period", period.label],
            ],
          },
          {
            kind: "kv",
            title: "FINANCIAL POSITION",
            rows: [
              ["Transactions in period", String(txns.length)],
              ["Total inflows", inr(txns.reduce((s: number, t: any) => (signed(t) > 0 ? s + signed(t) : s), 0))],
              ["Total outflows", inr(txns.reduce((s: number, t: any) => (signed(t) < 0 ? s + Math.abs(signed(t)) : s), 0))],
              ["Invoices on record", String(invoices.length)],
              ["Customers", String(customers.length)],
              ["Vendors", String(vendors.length)],
              ["GST filings", String(gstFilings.length)],
              ["ITC records", String(itc.length)],
              ["TDS records", String(tds.length)],
              ["Compliance events", String(compliance.length)],
              ["Cash position", liquidity ? inr(num(liquidity.cash_position)) : "—"],
              ["MRR", revenue ? inr(num(revenue.mrr)) : "—"],
            ],
          },
          {
            kind: "table",
            title: "TRANSACTION REGISTER",
            headers: ["Date", "Description", "Category", "Amount"],
            widths: [70, 220, 100, 109],
            aligns: ["l", "l", "l", "r"],
            rows: txns.slice(0, 150).map((t: any) => [
              String(t.date ?? "—").slice(0, 10),
              String(t.description ?? "—"),
              String(t.category ?? "—"),
              inr(signed(t)),
            ]),
          },
        ]);
      }
    }

    // ---- upload
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    const filePath = `${business_id}/${report_type}/${stamp}.${ext_name}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(filePath, bytes, { contentType, upsert: true });
    if (upErr) {
      console.error("[report] upload failed", upErr);
      if (reportRowId) await admin.from("generated_reports").update({ status: "failed" }).eq("id", reportRowId);
      return json({ success: false, error: `Upload failed: ${upErr.message}` }, 500);
    }

    const { data: signedData, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);
    if (signErr || !signedData?.signedUrl) {
      console.error("[report] signed url failed", signErr);
      if (reportRowId) await admin.from("generated_reports").update({ status: "failed" }).eq("id", reportRowId);
      return json({ success: false, error: "Could not create a download link" }, 500);
    }
    const file_url = signedData.signedUrl;

    if (reportRowId) {
      const { error: updErr } = await admin
        .from("generated_reports")
        .update({ status: "completed", file_url, file_size: bytes.length })
        .eq("id", reportRowId);
      if (updErr) console.warn("[report] row update", updErr);
    }

    return json({
      success: true,
      file_url,
      file_size: bytes.length,
      report_type,
      format: ext_name,
      period: period.label,
    });
  } catch (e) {
    console.error("[report] unhandled", e);
    if (reportRowId) {
      try {
        await admin.from("generated_reports").update({ status: "failed" }).eq("id", reportRowId);
      } catch (_) { /* ignore */ }
    }
    return json({ success: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
