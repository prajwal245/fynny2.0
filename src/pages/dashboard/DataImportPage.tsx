import type { JSX } from "react";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { normaliseAmount, directionFromSigned, detectAmountPattern, logParsePattern } from "@/lib/bankAmount";
import { recomputeIntelligence } from "@/lib/postImportCompute";

import { Upload, FileText, X, Building, Receipt, Wallet, AlertTriangle, RotateCw, Sparkles, Camera } from "lucide-react";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

type ImportType = "bank" | "invoice" | "expense";

// --- minimal CSV parser handling quoted fields ---
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r/g, "").trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur); cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, rows };
}

const num = (s: string) => {
  const n = parseFloat((s || "").replace(/[,₹\s]/g, ""));
  return isNaN(n) ? 0 : n;
};

const pick = (row: Record<string, string>, keys: string[]) => {
  const headers = Object.keys(row);
  // 1) exact case-insensitive match
  for (const k of keys) {
    const found = headers.find(h => h.toLowerCase() === k.toLowerCase());
    if (found && row[found]) return row[found];
  }
  // 2) fuzzy: header contains candidate, or candidate contains header (normalized)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const k of keys) {
    const nk = norm(k);
    if (!nk) continue;
    const found = headers.find(h => {
      const nh = norm(h);
      return nh && (nh.includes(nk) || nk.includes(nh));
    });
    if (found && row[found]) return row[found];
  }
  return "";
};

const TYPE_META: Record<ImportType, { title: string; description: string; icon: JSX.Element; sample: string }> = {
  bank: {
    title: "Bank Statements",
    description: "CSV/XLSX with columns: Date, Description, Debit, Credit (or Amount)",
    icon: <Building className="w-6 h-6" />,
    sample: "Date, Description, Debit, Credit",
  },
  invoice: {
    title: "Invoices (Receivables)",
    description: "CSV/XLSX with: Customer, Invoice Number, Date, Due Date, Amount",
    icon: <Receipt className="w-6 h-6" />,
    sample: "Customer, Invoice Number, Date, Due Date, Amount",
  },
  expense: {
    title: "Expenses (Payables)",
    description: "CSV/XLSX with: Vendor, Invoice Number, Date, Due Date, Amount",
    icon: <Wallet className="w-6 h-6" />,
    sample: "Vendor, Invoice Number, Date, Due Date, Amount",
  },
};

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseCSV(text).rows;
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
    return rows.map(r => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(r)) out[k.trim()] = String(r[k] ?? "").trim();
      return out;
    });
  }
  throw new Error("Unsupported file type. Upload CSV or XLSX.");
}

interface UploadZoneProps {
  type: ImportType;
  businessId: string | null;
  onSuccess: () => void;
}

// Shared registry so the upload-history "Retry" button can reopen the right picker
const zoneOpeners: Partial<Record<ImportType, () => void>> = {};
const triggerRetry = (type: ImportType) => {
  document
    .querySelector<HTMLElement>(`[data-upload-zone="${type}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => zoneOpeners[type]?.(), 250);
};

interface DupMatch {
  reason: "hash" | "date_overlap";
  rows: Array<{
    file_name: string;
    created_at: string;
    row_count: number;
    min_date: string | null;
    max_date: string | null;
  }>;
}

interface PendingUpload {
  rows: Record<string, string>[];
  hash: string;
  minDate: string | null;
  maxDate: string | null;
}

const UploadZone = ({ type, businessId, onSuccess }: UploadZoneProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dupMatch, setDupMatch] = useState<DupMatch | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const [sourceMode, setSourceMode] = useState<"csv" | "ai_extracted">("csv");

  useEffect(() => {
    zoneOpeners[type] = () => inputRef.current?.click();
    return () => { delete zoneOpeners[type]; };
  }, [type]);
  const meta = TYPE_META[type];

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    const n = f.name.toLowerCase();
    if (!n.endsWith(".csv") && !n.endsWith(".xlsx") && !n.endsWith(".xls")) {
      toast.error("Please upload a CSV or XLSX file");
      return;
    }
    setFile(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!uploading) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    const f = e.dataTransfer.files?.[0];
    acceptFile(f);
  };

  const today = () => new Date().toISOString().slice(0, 10);
  const toDate = (s: string) => {
    if (!s) return today();
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      const [, dd, mm, yy] = m;
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    return today();
  };

  const computeRange = (rows: Record<string, string>[]): { minDate: string | null; maxDate: string | null } => {
    const keys =
      type === "bank" ? ["Date", "Transaction Date"] :
      type === "invoice" ? ["Date", "Invoice Date"] :
      ["Due Date", "Date"];
    let min: string | null = null;
    let max: string | null = null;
    for (const r of rows) {
      const raw = pick(r, keys);
      if (!raw) continue;
      const d = toDate(raw);
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { minDate: min, maxDate: max };
  };

  const performInsert = async (p: PendingUpload) => {
    if (!file || !businessId) return;
    setUploading(true);
    setProgress(10);
    const interval = setInterval(() => setProgress(prev => Math.min(prev + 8, 85)), 200);
    const rows = p.rows;

    track("csv_import_started", { file_type: file.type || file.name.split(".").pop() || "unknown" });
    try {
      if (type === "bank") {
        let skipped = 0;
        const bankHeaders = Object.keys(rows[0] ?? {});
        const bankDetected = detectAmountPattern(
          bankHeaders,
          rows.map(r => bankHeaders.map(h => r[h]))
        );
        const records = rows.map(r => {
          const rawDebit = pick(r, ["Debit", "Withdrawal Amt.", "Withdrawal Amt", "Withdrawal", "Withdrawal Amount", "Dr", "Out", "Paid Out", "Money Out"]);
          const rawCredit = pick(r, ["Credit", "Deposit Amt.", "Deposit Amt", "Deposit", "Deposit Amount", "Cr", "In", "Paid In", "Money In"]);
          const rawAmt = pick(r, ["Amount", "Transaction Amount", "Txn Amount"]);
          const rawType = pick(r, ["Type", "Transaction Type", "Txn Type", "Dr/Cr", "Cr/Dr", "Mode"]);
          // Signed: negative = debit / money out, positive = credit / money in
          const amount = normaliseAmount(rawAmt, rawType, rawDebit, rawCredit);
          if (amount === 0) return null;
          const direction = directionFromSigned(amount);
          return {
            business_id: businessId,
            date: toDate(pick(r, ["Date", "Transaction Date", "Txn Date", "Value Date"])),
            description: pick(r, ["Description", "Narration", "Particulars", "Details"]) || "-",
            counterparty: pick(r, ["Counterparty", "Payee", "Vendor", "Customer"]) || null,
            amount,
            direction,
            category: pick(r, ["Category"]) || null,
          };
        }).filter((x): x is NonNullable<typeof x> => {

          if (x === null) { skipped++; return false; }
          return true;
        });
        logParsePattern("bank-csv", bankDetected, records);
        if (records.length === 0) {
          throw new Error("No parseable rows found. Please check your column headers (Date, Debit/Withdrawal, Credit/Deposit or Amount).");
        }

        const { error } = await supabase.from("transactions").insert(records);
        if (error) throw error;
        if (skipped > 0) {
          toast.warning(`${skipped} row${skipped === 1 ? "" : "s"} could not be parsed and were skipped — please verify your column headers.`);
        }
      } else if (type === "invoice") {
        const records = rows.map(r => {
          const amount = num(pick(r, ["Amount", "Total", "Invoice Amount"]));
          return {
            business_id: businessId,
            customer_name: pick(r, ["Customer", "Customer Name", "Client"]) || "Unknown",
            invoice_number: pick(r, ["Invoice Number", "Invoice", "Invoice No"]) || `INV-${Date.now()}`,
            invoice_date: toDate(pick(r, ["Date", "Invoice Date"])),
            due_date: toDate(pick(r, ["Due Date", "Due"])),
            amount,
            outstanding: amount,
            status: "outstanding",
          };
        });
        const { error } = await supabase.from("receivables").insert(records);
        if (error) throw error;
      } else {
        const records = rows.map(r => {
          const amount = num(pick(r, ["Amount", "Total", "Bill Amount"]));
          return {
            business_id: businessId,
            vendor_name: pick(r, ["Vendor", "Vendor Name", "Supplier"]) || "Unknown",
            invoice_number: pick(r, ["Invoice Number", "Bill Number", "Invoice"]) || null,
            due_date: toDate(pick(r, ["Due Date", "Date"])),
            amount,
            outstanding: amount,
            status: "pending",
          };
        });
        const { error } = await supabase.from("payables").insert(records);
        if (error) throw error;
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("csv_uploads").insert({
        business_id: businessId,
        uploaded_by: user?.id ?? null,
        upload_type: type,
        file_name: file.name,
        file_size: file.size,
        row_count: rows.length,
        status: "success",
        file_hash: p.hash,
        min_date: p.minDate,
        max_date: p.maxDate,
        source_type: sourceMode,
      });

      clearInterval(interval);
      setProgress(100);
      // Refresh pre-computed liquidity + cost metrics so dashboards update now.
      await recomputeIntelligence(businessId);
      track("csv_import_completed", { records_inserted: rows.length });
      toast.success(
        `Import complete. ${rows.length} transaction${rows.length === 1 ? "" : "s"} imported. Dashboard metrics have been updated.`
      );

      onSuccess();
      setTimeout(() => {
        setFile(null);
        setPending(null);
        setUploading(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = "";
      }, 1200);
    } catch (err: any) {
      clearInterval(interval);
      track("csv_import_failed", { error: String(err?.message || err) });
      console.error("Upload error:", err);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("csv_uploads").insert({
          business_id: businessId,
          uploaded_by: user?.id ?? null,
          upload_type: type,
          file_name: file.name,
          file_size: file.size,
          row_count: rows.length,
          status: "failed",
          error_message: String(err?.message || err).slice(0, 500),
          file_hash: p.hash,
          min_date: p.minDate,
          max_date: p.maxDate,
          source_type: sourceMode,
        });
      } catch {}
      toast.error(err?.message || "Upload failed");
      onSuccess();
      setUploading(false);
      setProgress(0);
    }
  };

  const uploadFile = async () => {
    if (!file || !businessId) return;
    setUploading(true);
    setProgress(5);

    try {
      const buf = await file.arrayBuffer();
      const hash = await sha256Hex(buf);

      // Re-parse from buffer so we don't read the file twice
      let rows: Record<string, string>[];
      const lname = file.name.toLowerCase();
      if (lname.endsWith(".csv")) {
        rows = parseCSV(new TextDecoder().decode(buf)).rows;
      } else {
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false }) : [];
        rows = raw.map(r => {
          const out: Record<string, string> = {};
          for (const k of Object.keys(r)) out[k.trim()] = String(r[k] ?? "").trim();
          return out;
        });
      }
      if (rows.length === 0) throw new Error("File has no data rows");

      const { minDate, maxDate } = computeRange(rows);
      const pendingUpload: PendingUpload = { rows, hash, minDate, maxDate };

      // Duplicate check 1: exact file hash for this business
      const { data: hashHits } = await supabase
        .from("csv_uploads")
        .select("file_name, created_at, row_count, min_date, max_date")
        .eq("business_id", businessId)
        .eq("file_hash", hash)
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(5);

      if (hashHits && hashHits.length > 0) {
        setPending(pendingUpload);
        setDupMatch({ reason: "hash", rows: hashHits });
        setUploading(false);
        setProgress(0);
        return;
      }

      // Duplicate check 2: overlapping date range for the same upload type
      if (minDate && maxDate) {
        const { data: rangeHits } = await supabase
          .from("csv_uploads")
          .select("file_name, created_at, row_count, min_date, max_date")
          .eq("business_id", businessId)
          .eq("upload_type", type)
          .eq("status", "success")
          .not("min_date", "is", null)
          .not("max_date", "is", null)
          .lte("min_date", maxDate)
          .gte("max_date", minDate)
          .order("created_at", { ascending: false })
          .limit(5);

        if (rangeHits && rangeHits.length > 0) {
          setPending(pendingUpload);
          setDupMatch({ reason: "date_overlap", rows: rangeHits });
          setUploading(false);
          setProgress(0);
          return;
        }
      }

      await performInsert(pendingUpload);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err?.message || "Upload failed");
      setUploading(false);
      setProgress(0);
    }
  };

  const confirmDuplicate = async () => {
    const p = pending;
    setDupMatch(null);
    setPending(null);
    if (p) await performInsert(p);
  };

  const replaceDuplicate = async () => {
    const p = pending;
    const m = dupMatch;
    setDupMatch(null);
    setPending(null);
    if (!p || !m || !businessId || !file) return;

    // Compute combined date range across conflicting prior uploads (fall back to current file's range)
    let minD: string | null = p.minDate;
    let maxD: string | null = p.maxDate;
    for (const r of m.rows) {
      if (r.min_date && (!minD || r.min_date < minD)) minD = r.min_date;
      if (r.max_date && (!maxD || r.max_date > maxD)) maxD = r.max_date;
    }

    setUploading(true);
    setProgress(5);
    try {
      const tableMap = {
        bank: { table: "transactions", dateCol: "date" },
        invoice: { table: "receivables", dateCol: "invoice_date" },
        expense: { table: "payables", dateCol: "due_date" },
      } as const;
      const { table, dateCol } = tableMap[type];

      if (minD && maxD) {
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq("business_id", businessId)
          .gte(dateCol, minD)
          .lte(dateCol, maxD);
        if (delErr) throw delErr;
      }

      // Mark prior csv_uploads rows as replaced (no DELETE permission, so we can't remove them)
      toast.success(`Cleared previous ${meta.title.toLowerCase()} for ${minD ?? "?"} → ${maxD ?? "?"}`);
      await performInsert(p);
    } catch (err: any) {
      console.error("Replace error:", err);
      toast.error(err?.message || "Replace failed");
      setUploading(false);
      setProgress(0);
    }
  };

  const cancelDuplicate = () => {
    setDupMatch(null);
    setPending(null);
    toast.info("Upload cancelled, no duplicate data inserted");
  };

  // Convert AI-extracted structured rows into the same header-keyed shape the
  // CSV pipeline already handles, so performInsert / pick() work unchanged.
  const aiRowsToCsvShape = (rows: any[]): Record<string, string>[] => {
    if (type === "bank") {
      return rows.map((r) => {
        const amt = Number(r?.amount ?? 0);
        const dir = String(r?.direction ?? "").toLowerCase();
        return {
          Date: String(r?.date ?? ""),
          Description: String(r?.description ?? ""),
          Debit: dir === "debit" || dir === "withdrawal" || dir === "out" ? String(amt) : "",
          Credit: dir === "credit" || dir === "deposit" || dir === "in" ? String(amt) : "",
        };
      });
    }
    if (type === "invoice") {
      return rows.map((r) => ({
        Customer: String(r?.customer ?? ""),
        "Invoice Number": String(r?.invoice_number ?? ""),
        Date: String(r?.date ?? ""),
        "Due Date": String(r?.date ?? ""),
        Amount: String(Number(r?.amount ?? 0)),
      }));
    }
    return rows.map((r) => ({
      Vendor: String(r?.vendor ?? ""),
      Category: String(r?.category ?? ""),
      Date: String(r?.date ?? ""),
      "Due Date": String(r?.date ?? ""),
      Amount: String(Number(r?.amount ?? 0)),
    }));
  };

  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!businessId) { toast.error("No business linked."); return; }
    const n = f.name.toLowerCase();
    const ok = f.type.startsWith("image/") || n.endsWith(".pdf") || n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp");
    if (!ok) { toast.error("Upload a photo (PNG/JPG) or PDF"); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error("File too large (max 8MB)"); return; }

    setFile(f);
    setSourceMode("ai_extracted");
    setAiExtracting(true);
    setUploading(true);
    setProgress(15);
    const progInt = setInterval(() => setProgress((p) => Math.min(p + 5, 70)), 400);
    try {
      const buf = await f.arrayBuffer();
      // base64 encode
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const hash = await sha256Hex(buf);

      const { data, error } = await supabase.functions.invoke("extract-document-ai", {
        body: {
          doc_type: type,
          mime_type: f.type || (n.endsWith(".pdf") ? "application/pdf" : "image/png"),
          file_base64: b64,
        },
      });
      clearInterval(progInt);
      if (error) throw error;
      const aiRows = Array.isArray(data?.rows) ? data.rows : [];
      if (aiRows.length === 0) {
        throw new Error("AI could not find any rows in this document. Try a clearer photo or a different page.");
      }
      const shaped = aiRowsToCsvShape(aiRows);
      const { minDate, maxDate } = computeRange(shaped);
      setProgress(80);
      await performInsert({ rows: shaped, hash, minDate, maxDate });
    } catch (err: any) {
      clearInterval(progInt);
      console.error("AI extract error", err);
      toast.error(err?.message || "AI extraction failed");
      setUploading(false);
      setAiExtracting(false);
      setProgress(0);
      setFile(null);
      setSourceMode("csv");
    } finally {
      setAiExtracting(false);
      if (aiInputRef.current) aiInputRef.current.value = "";
    }
  };


  return (
    <Card data-upload-zone={type} className="p-6 flex flex-col h-full scroll-mt-24">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 flex flex-col items-center justify-center text-center min-h-[260px] rounded-lg transition-colors border-2 border-dashed ${
          isDragging
            ? "border-fyn-red bg-fyn-red/5"
            : "border-transparent"
        }`}
      >
        {!file && !uploading && (
          <>
            <div className="w-12 h-12 rounded-full bg-fyn-beige flex items-center justify-center mb-3 text-fyn-ink">
              {meta.icon}
            </div>
            <h3 className="font-serif text-lg text-fyn-ink mb-1">{meta.title}</h3>
            <p className="text-sm text-fyn-ink/60 mb-1">{meta.description}</p>
            <p className="text-xs text-fyn-ink/50 mb-4">
              {isDragging ? "Drop your file here" : "Drag & drop a CSV or XLSX, or"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              id={`csv-${type}`}
            />
            <label htmlFor={`csv-${type}`}>
              <Button asChild variant="outline" className="cursor-pointer">
                <span><Upload className="w-4 h-4 mr-2" /> Select File</span>
              </Button>
            </label>
            <div className="flex items-center gap-2 my-3 w-full max-w-[220px]">
              <div className="flex-1 h-px bg-fyn-ink/10" />
              <span className="text-[10px] uppercase tracking-wide text-fyn-ink/40">or</span>
              <div className="flex-1 h-px bg-fyn-ink/10" />
            </div>
            <input
              ref={aiInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleAiFileSelect}
              className="hidden"
              id={`ai-${type}`}
            />
            <label htmlFor={`ai-${type}`}>
              <Button asChild variant="ghost" className="cursor-pointer text-fyn-red hover:bg-fyn-red/5">
                <span><Camera className="w-4 h-4 mr-2" /> Upload photo / PDF <Sparkles className="w-3 h-3 ml-1.5 opacity-70" /></span>
              </Button>
            </label>
            <p className="text-xs text-fyn-ink/40 mt-3">Expected: {meta.sample}</p>
            <p className="text-[11px] text-fyn-ink/40 mt-1">Photo/PDF is read by AI — please verify the extracted rows.</p>
          </>
        )}

        {file && (uploading || aiExtracting) && sourceMode === "ai_extracted" && (
          <div className="w-full space-y-2 mt-2">
            <p className="text-xs text-fyn-ink/60 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Reading your document with AI…
            </p>
          </div>
        )}

        {file && !uploading && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between bg-fyn-beige/50 rounded-lg p-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-fyn-ink flex-shrink-0" />
                <span className="text-sm text-fyn-ink truncate">{file.name}</span>
              </div>
              <button onClick={() => setFile(null)} className="text-fyn-ink/50 hover:text-fyn-red flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Button
              onClick={uploadFile}
              className="w-full bg-fyn-red hover:bg-fyn-red/90 text-white"
              disabled={!businessId}
            >
              Upload & Process
            </Button>
            {!businessId && (
              <p className="text-xs text-fyn-red">No business linked. Complete onboarding first.</p>
            )}
          </div>
        )}

        {uploading && (
          <div className="w-full space-y-3">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-fyn-ink/70">Processing file… {progress}%</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!dupMatch} onOpenChange={(o) => { if (!o) cancelDuplicate(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-fyn-red" />
              Possible duplicate {meta.title.toLowerCase()}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {dupMatch?.reason === "hash"
                    ? "An identical file has already been imported for this business."
                    : pending?.minDate && pending?.maxDate
                      ? `This file covers ${pending.minDate} → ${pending.maxDate}, which overlaps with previous uploads of the same type.`
                      : "Date range overlaps with a previous upload."}
                </p>
                <div className="rounded-md border border-fyn-ink/10 divide-y divide-fyn-ink/10">
                  {dupMatch?.rows.map((h, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate" title={h.file_name}>{h.file_name}</span>
                      <span className="text-fyn-ink/60 whitespace-nowrap">
                        {h.row_count} rows · {new Date(h.created_at).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-fyn-ink/60">
                  Importing again will create duplicate records. Continue anyway?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel onClick={cancelDuplicate}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={replaceDuplicate}
              className="border-fyn-ink/20"
            >
              Replace previous data
            </Button>
            <AlertDialogAction
              onClick={confirmDuplicate}
              className="bg-fyn-red hover:bg-fyn-red/90 text-white"
            >
              Import anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const TYPE_LABEL: Record<ImportType, string> = {
  bank: "Bank Statement",
  invoice: "Invoice",
  expense: "Expense",
};

const formatBytes = (b: number) => {
  if (!b) return "-";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

interface UploadRow {
  id: string;
  upload_type: ImportType;
  file_name: string;
  file_size: number;
  row_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
  source_type?: string | null;
}

const UploadHistory = ({ businessId }: { businessId: string | null }) => {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["csv-uploads", businessId],
    queryFn: async () => {
      if (!businessId) return [] as UploadRow[];
      const { data, error } = await supabase
        .from("csv_uploads")
        .select("id, upload_type, file_name, file_size, row_count, status, error_message, created_at, source_type")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as UploadRow[];
    },
    enabled: !!businessId,
  });

  return (
    <Card className="p-6">
      <h3 className="font-serif text-lg text-fyn-ink mb-4">Upload History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-fyn-ink/10 text-left text-xs uppercase text-fyn-ink/50">
              <th className="py-2 font-medium">File</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium text-right">Size</th>
              <th className="py-2 font-medium text-right">Rows</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium text-right">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-fyn-ink/50">
                  {isLoading ? "Loading…" : "No uploads yet. Drop a file above to get started."}
                </td>
              </tr>
            )}
            {history.map(h => (
              <tr key={h.id} className="border-b border-fyn-ink/5">
                <td className="py-3 text-fyn-ink font-medium truncate max-w-[320px]" title={h.file_name}>
                  <span className="inline-flex items-center gap-2">
                    <FileText className="w-4 h-4 text-fyn-ink/50" />
                    <span className="truncate">{h.file_name}</span>
                    {h.source_type === "ai_extracted" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-fyn-red/10 text-fyn-red whitespace-nowrap">
                        <Sparkles className="w-3 h-3" /> AI extracted — verify
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3 text-fyn-ink/70">{TYPE_LABEL[h.upload_type] ?? h.upload_type}</td>
                <td className="py-3 text-right tabular-nums text-fyn-ink/70">{formatBytes(h.file_size)}</td>
                <td className="py-3 text-right tabular-nums">{h.row_count}</td>
                <td className="py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      h.status === "success"
                        ? "bg-green-100 text-green-800"
                        : "bg-fyn-red/10 text-fyn-red"
                    }`}
                    title={h.error_message || undefined}
                  >
                    {h.status}
                  </span>
                </td>
                <td className="py-3 text-right text-fyn-ink/60 whitespace-nowrap">
                  <div className="inline-flex items-center gap-3 justify-end">
                    <span>{new Date(h.created_at).toLocaleString("en-IN")}</span>
                    {h.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.info(`Re-select "${h.file_name}" to retry`);
                          triggerRetry(h.upload_type);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-fyn-red hover:underline"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const DataImportPage = () => {
  const { businessId } = useAuth();
  const qc = useQueryClient();
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["csv-uploads", businessId] });
    qc.invalidateQueries({ queryKey: ["transactions-180", businessId] });
    qc.invalidateQueries({ queryKey: ["receivables-top", businessId] });
    qc.invalidateQueries({ queryKey: ["payables", businessId] });
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-fyn-ink mb-2">Import Your Data</h1>
        <p className="text-fyn-ink/60">
          Upload bank statements, invoices, and expenses as CSV or XLSX. We'll automatically categorize and sync to your dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <UploadZone type="bank" businessId={businessId} onSuccess={refreshAll} />
        <UploadZone type="invoice" businessId={businessId} onSuccess={refreshAll} />
        <UploadZone type="expense" businessId={businessId} onSuccess={refreshAll} />
      </div>

      <UploadHistory businessId={businessId} />
    </DashboardLayout>
  );
};

export default DataImportPage;
