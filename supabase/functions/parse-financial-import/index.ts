// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ~15MB base64 ≈ ~10MB decoded file. Cap before decode to prevent OOM.
const MAX_FILE_BASE64_LEN = 20_000_000;

const BodySchema = z.object({
  documentId: z.string().uuid(),
  businessId: z.string().uuid(),
  fileBase64: z.string().min(1).max(MAX_FILE_BASE64_LEN),
  fileName: z.string().min(1).max(500),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isLikelyDateHeader(h: string) {
  const s = h.toLowerCase();
  return /(^|[_\s])date($|[_\s])|txn.*date|transaction.*date|value.*date|posting.*date/i.test(s);
}
function isAmountHeader(h: string) {
  const s = h.toLowerCase();
  return /^amount|transaction amount|txn amount|net amount|amount$/.test(s.trim()) && !/balance/.test(s);
}
function isDebitHeader(h: string) {
  return /debit amount|debit amt|^debit$|withdrawal amt|withdrawal amount|^withdrawal$|dr amount|dr amt|paid out|money out/i.test(h.trim());
}
function isCreditHeader(h: string) {
  return /credit amount|credit amt|^credit$|deposit amt|deposit amount|^deposit$|cr amount|cr amt|paid in|money in/i.test(h.trim());
}
function isBalanceHeader(h: string) {
  return /balance|bal\b/i.test(h);
}

function isDescriptionHeader(h: string) {
  return /description|narration|particulars|details|remarks|memo/i.test(h);
}

function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) {
      const dt = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
      return dt.toISOString().slice(0, 10);
    }
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [_, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseNum(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  let sign = 0;
  // DR / CR suffix or prefix inside the amount cell (Pattern 5)
  const suffix = s.match(/(^|[\s(])(dr|cr|debit|credit)\.?\s*$/i);
  if (suffix) { sign = /^c/i.test(suffix[2]) ? 1 : -1; s = s.slice(suffix.index).length ? s.slice(0, suffix.index).trim() : s; }
  else {
    const prefix = s.match(/^(dr|cr|debit|credit)\.?[\s:]+/i);
    if (prefix) { sign = /^c/i.test(prefix[1]) ? 1 : -1; s = s.slice(prefix[0].length).trim(); }
  }
  const neg = /^\(.*\)$/.test(s);
  if (neg) s = s.slice(1, -1).trim();
  if (/-\s*$/.test(s)) { sign = -1; s = s.replace(/-\s*$/, "").trim(); }
  s = s.replace(/(?:^|\s)(rs\.?|inr|usd|eur|gbp)(?=[\s\d.]|$)/gi, " ").replace(/[₹$€£¥]/g, "").replace(/[, ']/g, "").trim();
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  if (isNaN(n)) return null;
  if (neg) return -Math.abs(n);
  if (sign !== 0) return sign * Math.abs(n);
  return n;
}

type ParsedRow = {
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  balance: number | null;
  category: string | null;
};


function rowsFromAOA(aoa: any[][]): { rows: ParsedRow[]; reason?: string } {
  if (!aoa.length) return { rows: [], reason: "File is empty" };
  // Find header row: pick the first row that has a date-like header AND an amount/debit/credit header.
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const r = (aoa[i] || []).map((c) => (c == null ? "" : String(c).trim()));
    const hasDate = r.some(isLikelyDateHeader);
    const hasAmt = r.some((h) => isAmountHeader(h) || isDebitHeader(h) || isCreditHeader(h));
    if (hasDate && hasAmt) {
      headerIdx = i;
      headers = r;
      break;
    }
  }
  if (headerIdx === -1) {
    return { rows: [], reason: "Could not detect a Date column and Amount/Debit/Credit column in the file" };
  }

  const dateIdx = headers.findIndex(isLikelyDateHeader);
  const debitIdx = headers.findIndex(isDebitHeader);
  const creditIdx = headers.findIndex(isCreditHeader);
  const amountIdx = headers.findIndex(isAmountHeader);
  const balanceIdx = headers.findIndex(isBalanceHeader);
  const descIdx = headers.findIndex(isDescriptionHeader);
  const typeIdx = headers.findIndex((h) => /^type$|transaction type|txn type|dr\/cr|cr\/dr|dr.cr|^mode$/i.test(h));

  // Pattern detection (1-5) purely for observability in the function logs.
  const pattern =
    debitIdx !== -1 && creditIdx !== -1
      ? (/(withdraw|deposit|paid (in|out)|money (in|out))/i.test(headers[debitIdx] + headers[creditIdx]) ? 4 : 2)
      : amountIdx !== -1
        ? (aoa.slice(headerIdx + 1, headerIdx + 21).some((r) => /\b(dr|cr)\.?\s*$/i.test(String(r?.[amountIdx] ?? "")))
            ? 5
            : typeIdx !== -1 ? 1 : 3)
        : null;
  console.log(`[parse-financial-import] detected pattern ${pattern}`, { dateIdx, debitIdx, creditIdx, amountIdx, typeIdx });

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const date = parseDate(r[dateIdx]);
    if (!date) continue;

    // Signed amount: negative = debit / money out, positive = credit / money in
    let signed = 0;

    const d = debitIdx !== -1 ? parseNum(r[debitIdx]) : null;
    const c = creditIdx !== -1 ? parseNum(r[creditIdx]) : null;
    if (d != null && d !== 0 && (c == null || c === 0)) signed = -Math.abs(d);
    else if (c != null && c !== 0 && (d == null || d === 0)) signed = Math.abs(c);
    else if (d != null && d !== 0 && c != null && c !== 0) {
      signed = Math.abs(d) >= Math.abs(c) ? -Math.abs(d) : Math.abs(c);
    } else if (amountIdx !== -1) {
      const n = parseNum(r[amountIdx]);
      if (n != null && n !== 0) {
        if (typeIdx !== -1) {
          const t = String(r[typeIdx] || "").toLowerCase();
          const isCredit = /\bcr\b|credit|deposit|money in|paid in|inflow|receipt/.test(t);
          const isDebit = /\bdr\b|debit|withdraw|money out|paid out|outflow|payment/.test(t);
          signed = isCredit ? Math.abs(n) : isDebit ? -Math.abs(n) : n;
        } else {
          signed = n;
        }
      }
    }

    if (signed === 0) continue;

    const balance = balanceIdx !== -1 ? parseNum(r[balanceIdx]) : null;
    const description = descIdx !== -1 ? String(r[descIdx] ?? "").trim() : "";

    out.push({
      date,
      description: description.slice(0, 500),
      amount: signed,
      type: signed < 0 ? "debit" : "credit",
      balance,
      category: null,
    });
  }
  if (!out.length) return { rows: [], reason: "No valid transaction rows found" };
  console.log("[parse-financial-import] first 5 parsed rows:", out.slice(0, 5));
  return { rows: out };
}


function csvToAOA(text: string): any[][] {
  // Minimal RFC4180-ish CSV parser supporting quoted fields and commas/semicolons.
  // Detect delimiter
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const out: any[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); out.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* ignore */ }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); out.push(cur); }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, reason: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ success: false, reason: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: authErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !userData?.user) return json({ success: false, reason: "Unauthorized" }, 401);

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ success: false, reason: "Invalid request body" }, 400);
  const { documentId, businessId, fileBase64, fileName } = parsed.data;

  // Verify caller owns the business this doc belongs to
  const { data: profile } = await admin
    .from("profiles").select("business_id").eq("user_id", userData.user.id).maybeSingle();
  if (!profile?.business_id || profile.business_id !== businessId) {
    return json({ success: false, reason: "Forbidden" }, 403);
  }

  await admin.from("business_documents")
    .update({ parse_status: "processing", parse_error: null })
    .eq("id", documentId);

  try {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") {
      await admin.from("business_documents").update({
        parse_status: "not_applicable",
        parse_error: "PDF parsing is not yet supported. Please export CSV or Excel from your bank.",
      }).eq("id", documentId);
      return json({ success: false, reason: "PDF parsing not yet supported — export CSV or Excel from your bank" });
    }

    const bytes = base64ToBytes(fileBase64);
    let aoa: any[][];
    if (ext === "csv" || ext === "txt") {
      const text = new TextDecoder("utf-8").decode(bytes);
      aoa = csvToAOA(text);
    } else if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(bytes, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as any[][];
    } else {
      await admin.from("business_documents").update({
        parse_status: "failed", parse_error: `Unsupported file type: .${ext}`,
      }).eq("id", documentId);
      return json({ success: false, reason: `Unsupported file type: .${ext}` });
    }

    const { rows, reason } = rowsFromAOA(aoa);
    if (!rows.length) {
      await admin.from("business_documents").update({
        parse_status: "failed", parse_error: reason || "No rows parsed",
      }).eq("id", documentId);
      return json({ success: false, reason: reason || "No rows parsed" });
    }

    const insertRows = rows.map((r) => ({
      business_id: businessId,
      source_document_id: documentId,
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type,
      balance: r.balance,
      category: r.category,
      reconciled: false,
    }));

    // Insert in chunks
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += 500) {
      const chunk = insertRows.slice(i, i + 500);
      const { error } = await admin.from("bank_transactions").insert(chunk);
      if (error) {
        await admin.from("business_documents").update({
          parse_status: "failed",
          parse_error: `DB insert failed: ${error.message}`,
          rows_imported: inserted,
        }).eq("id", documentId);
        return json({ success: false, reason: `Database insert failed: ${error.message}` });
      }
      inserted += chunk.length;
    }

    await admin.from("business_documents").update({
      parse_status: "completed", rows_imported: inserted, parse_error: null,
    }).eq("id", documentId);

    return json({ success: true, rowsImported: inserted });
  } catch (e) {
    const msg = (e as Error).message || "Unknown error";
    await admin.from("business_documents").update({
      parse_status: "failed", parse_error: msg,
    }).eq("id", documentId);
    return json({ success: false, reason: msg });
  }
});
