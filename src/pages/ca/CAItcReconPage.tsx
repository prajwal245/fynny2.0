/**
 * ITC reconciliation — GSTR-2B against the books.
 *
 * Real data only: the uploaded 2B file is parsed by the `parse-gstr2b` edge
 * function into `ca_itc_records`, and this page classifies every resulting row
 * with a 1% amount tolerance, logs exceptions and exports the working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { logReconRun } from "@/lib/caReconRuns";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import {
  CA, CACard, CAButton, CABadge, CAEmpty, caInputStyle, inr, dateIN, caTd, caTh, caNum,
} from "@/components/ca/portalUi";
import { ModuleHeader, StatStrip } from "@/components/ca/os/primitives";
import { GspLimitationBanner } from "@/components/ca/GspLimitationBanner";
import { ICAIGate } from "@/components/ca/ICAIGate";
import { useCARole } from "@/hooks/useCARole";
import { logCAAudit } from "@/lib/caAudit";
import { Upload } from "lucide-react";

type Verdict = "matched" | "mismatch" | "missing_in_books" | "missing_in_portal";

interface ItcRecord {
  id: string;
  gstin_supplier: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  filing_period: string;
  taxable_value: number | null;
  igst_amount: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  total_itc: number | null;
  gstr2b_igst: number | null;
  gstr2b_cgst: number | null;
  gstr2b_sgst: number | null;
  gstr2b_taxable_value: number | null;
  gstr2b_matched: boolean | null;
  match_status: string;
  source: string;
}

interface Line extends ItcRecord {
  book_itc: number;
  portal_itc: number;
  variance: number;
  verdict: Verdict;
}

interface UploadRow {
  id: string;
  file_name: string;
  filing_period: string;
  processing_status: string;
  records_parsed: number;
  records_matched: number;
  records_mismatched: number;
  records_new: number;
  error_message: string | null;
  created_at: string;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  matched: "Matched",
  mismatch: "Amount mismatch",
  missing_in_books: "Missing in books",
  missing_in_portal: "Missing in portal",
};
const VERDICT_TONE: Record<Verdict, "green" | "amber" | "red"> = {
  matched: "green",
  mismatch: "amber",
  missing_in_books: "red",
  missing_in_portal: "amber",
};

const TOLERANCE = 0.01; // 1%

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function periodLabel(monthValue: string): string {
  const m = monthValue.match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export function classify(r: ItcRecord): Line {
  const book_itc = num(r.total_itc) || num(r.igst_amount) + num(r.cgst_amount) + num(r.sgst_amount);
  const portal_itc = num(r.gstr2b_igst) + num(r.gstr2b_cgst) + num(r.gstr2b_sgst);
  const variance = Math.round((book_itc - portal_itc) * 100) / 100;

  let verdict: Verdict;
  if (r.match_status === "extra_in_2b" || r.source === "gstr2b_upload") {
    verdict = "missing_in_books";
  } else if (!r.gstr2b_matched) {
    verdict = "missing_in_portal";
  } else {
    const base = Math.max(book_itc, portal_itc, 1);
    verdict = Math.abs(variance) / base <= TOLERANCE ? "matched" : "mismatch";
  }
  return { ...r, book_itc, portal_itc, variance, verdict };
}

export default function CAItcReconPage() {
  const { firmId } = useCAPortal();
  const { clients } = useCAClientOptions();
  const [businessId, setBusinessId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<Line[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [filter, setFilter] = useState<"all" | Verdict>("all");
  const { hasICAI, setHasICAI } = useCARole();
  const [icaiGateOpen, setIcaiGateOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const period = periodLabel(month);
  const clientName = clients.find((c) => c.business_id === businessId)?.client_name ?? "";

  const load = useCallback(async () => {
    if (!firmId || !businessId || !period) { setRecords([]); setUploads([]); return; }
    setLoading(true);
    const [recRes, upRes] = await Promise.all([
      supabase
        .from("ca_itc_records")
        .select("*")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .eq("filing_period", period)
        .eq("is_demo", false)
        .order("invoice_date", { ascending: false })
        .limit(5000),
      supabase
        .from("ca_gstr2b_uploads")
        .select("id, file_name, filing_period, processing_status, records_parsed, records_matched, records_mismatched, records_new, error_message, created_at")
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (recRes.error) toast.error(recRes.error.message);
    setRecords(((recRes.data ?? []) as unknown as ItcRecord[]).map(classify));
    setUploads((upRes.data ?? []) as UploadRow[]);
    setLoading(false);
  }, [firmId, businessId, period]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const portal = records.reduce((s, r) => s + r.portal_itc, 0);
    const books = records.reduce((s, r) => s + r.book_itc, 0);
    const matched = records.filter((r) => r.verdict === "matched").reduce((s, r) => s + r.book_itc, 0);
    const atRisk = records
      .filter((r) => r.verdict !== "matched")
      .reduce((s, r) => s + Math.abs(r.variance || r.book_itc || r.portal_itc), 0);
    return { portal, books, matched, variance: books - portal, atRisk };
  }, [records]);

  const visible = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.verdict === filter)),
    [records, filter],
  );

  const counts = useMemo(() => ({
    matched: records.filter((r) => r.verdict === "matched").length,
    mismatch: records.filter((r) => r.verdict === "mismatch").length,
    missing_in_books: records.filter((r) => r.verdict === "missing_in_books").length,
    missing_in_portal: records.filter((r) => r.verdict === "missing_in_portal").length,
  }), [records]);

  // ---- actions ----
  const upload = async (file: File) => {
    if (!firmId || !businessId) return toast.error("Pick a client first");
    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) return toast.error("Pick a filing period first");

    setUploading(true);
    const toastId = toast.loading("Parsing GSTR-2B…");
    const form = new FormData();
    form.append("file", file);
    form.append("ca_firm_id", firmId);
    form.append("business_id", businessId);
    form.append("filing_period", `${m[2]}${m[1]}`); // MMYYYY

    const { data, error } = await supabase.functions.invoke("parse-gstr2b", { body: form });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";

    if (error || !data?.success) {
      return toast.error(data?.error ?? error?.message ?? "GSTR-2B processing failed", { id: toastId });
    }
    toast.success(
      `${data.records_parsed} records parsed — ${data.records_matched} matched, ${data.records_new} only in 2B, ${data.records_mismatched} only in books.`,
      { id: toastId },
    );
    await logCAAudit({
      firmId, businessId, entityType: "gstr2b_upload", action: "gstr2b_uploaded",
      detail: { period, file_name: file.name, ...data },
    });
    await logReconRun({
      firmId,
      businessId,
      reconType: "itc",
      period,
      totalItems: Number(data.records_parsed ?? 0),
      matched: Number(data.records_matched ?? 0),
      mismatched: Number(data.records_mismatched ?? 0),
      unmatched: Number(data.records_new ?? 0),
      totalMatchedValue: Number(data.matched_value ?? 0),
      totalAtRisk: Number(data.at_risk_value ?? 0),
      snapshot: {
        file_name: file.name,
        records_parsed: data.records_parsed ?? 0,
        records_matched: data.records_matched ?? 0,
        records_mismatched: data.records_mismatched ?? 0,
        records_new: data.records_new ?? 0,
      },
    });
    void load();
  };

  const logExceptions = async () => {
    if (!firmId || !businessId) return;
    const flagged = records.filter((r) => r.verdict === "mismatch" || r.verdict === "missing_in_books");
    if (!flagged.length) return toast.info("Nothing to log — every line reconciles");

    setLogging(true);
    const rows = flagged.map((r) => ({
      ca_firm_id: firmId,
      business_id: businessId,
      source: "ITC_RECON",
      reason_code: r.verdict === "mismatch" ? "ITC_MISMATCH" : "ITC_MISSING",
      description:
        r.verdict === "mismatch"
          ? `${period} · ${r.invoice_number ?? "no invoice no."} (${r.gstin_supplier}) — books ${inr(r.book_itc)} vs 2B ${inr(r.portal_itc)}`
          : `${period} · ${r.invoice_number ?? "no invoice no."} (${r.gstin_supplier}) — in GSTR-2B but not in books (${inr(r.portal_itc)})`,
      amount: Math.abs(r.variance || r.portal_itc),
      severity: Math.abs(r.variance || r.portal_itc) > 50000 ? "high" : "medium",
      status: "open",
    }));

    const { error } = await supabase.from("ca_exceptions").insert(rows);
    setLogging(false);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId, businessId, entityType: "itc_recon", action: "exceptions_logged",
      detail: { period, count: rows.length },
    });
    toast.success(`${rows.length} exception${rows.length === 1 ? "" : "s"} added to the queue`);
  };

  const exportCsv = () => {
    if (!visible.length) return toast.info("Nothing to export");
    const headers = [
      "Invoice date", "Supplier GSTIN", "Supplier", "Invoice no",
      "Taxable value (books)", "ITC in books", "ITC in GSTR-2B", "Variance", "Verdict",
    ];
    const csv = [
      headers.join(","),
      ...visible.map((r) =>
        [
          r.invoice_date ?? "",
          r.gstin_supplier,
          `"${(r.supplier_name ?? "").replace(/"/g, '""')}"`,
          r.invoice_number ?? "",
          num(r.taxable_value),
          r.book_itc,
          r.portal_itc,
          r.variance,
          VERDICT_LABEL[r.verdict],
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `itc-recon-${(clientName || "client").replace(/\s+/g, "-").toLowerCase()}-${period.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Reconciliation exported");
  };

  // ---- render ----
  return (
    <div>
      <GspLimitationBanner />
      {icaiGateOpen && (
        <ICAIGate
          actionLabel="Approving ITC reconciliation"
          onUnlocked={() => { setIcaiGateOpen(false); setHasICAI(true); void logExceptions(); }}
          onCancel={() => setIcaiGateOpen(false)}
        />
      )}
      <ModuleHeader
        title="ITC reconciliation"
        subtitle="Upload the GSTR-2B download for a period and match it line by line against the purchase register. Anything that does not reconcile becomes an exception."
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <CAButton variant="ghost" onClick={exportCsv} disabled={!visible.length}>Export CSV</CAButton>
            <CAButton
              onClick={() => { if (!hasICAI) { setIcaiGateOpen(true); return; } void logExceptions(); }}
              disabled={logging || !records.length}
            >
              {logging ? "Logging…" : "Log exceptions"}
            </CAButton>
          </div>
        }
      />

      <CACard style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontFamily: CA.sans, fontSize: 12, fontWeight: 600 }}>
            <span style={{ display: "block", marginBottom: 6 }}>Client</span>
            <select style={{ ...caInputStyle, width: 260 }} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.business_id} value={c.business_id}>{c.client_name}</option>)}
            </select>
          </label>
          <label style={{ fontFamily: CA.sans, fontSize: 12, fontWeight: 600 }}>
            <span style={{ display: "block", marginBottom: 6 }}>Filing period</span>
            <input type="month" style={{ ...caInputStyle, width: 180 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,application/json,text/csv"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
            />
            <CAButton onClick={() => fileRef.current?.click()} disabled={!businessId || uploading}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Upload size={14} aria-hidden="true" />
                {uploading ? "Processing…" : "Upload GSTR-2B (JSON / CSV)"}
              </span>
            </CAButton>
          </div>
        </div>

        {uploads.length > 0 && (
          <div style={{ marginTop: 14, fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
            Last upload: <b style={{ color: CA.ink }}>{uploads[0].file_name}</b> · {uploads[0].filing_period} ·{" "}
            {uploads[0].processing_status}
            {uploads[0].processing_status === "completed" &&
              ` · ${uploads[0].records_parsed} parsed, ${uploads[0].records_matched} matched, ${uploads[0].records_new} new`}
            {uploads[0].error_message && <span style={{ color: CA.red }}> · {uploads[0].error_message}</span>}
            {" · "}{dateIN(uploads[0].created_at)}
          </div>
        )}
      </CACard>

      {!businessId ? (
        <CACard><CAEmpty title="Select a client to reconcile" hint="Pick a client and a filing period, then upload their GSTR-2B." /></CACard>
      ) : (
        <>
          <StatStrip
            items={[
              { label: "ITC in GSTR-2B", value: inr(totals.portal) },
              { label: "ITC in books", value: inr(totals.books) },
              { label: "Matched (claimable)", value: inr(totals.matched) },
              { label: "Variance", value: inr(totals.variance) },
              { label: "ITC at risk", value: inr(totals.atRisk) },
            ]}
          />

          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {([["all", `All (${records.length})`], ["matched", `Matched (${counts.matched})`], ["mismatch", `Mismatch (${counts.mismatch})`], ["missing_in_books", `Missing in books (${counts.missing_in_books})`], ["missing_in_portal", `Missing in portal (${counts.missing_in_portal})`]] as const).map(
              ([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as "all" | Verdict)}
                  style={{
                    fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 8,
                    cursor: "pointer",
                    background: filter === value ? CA.teal : "#fff",
                    color: filter === value ? "#fff" : CA.ink,
                    border: `0.5px solid ${filter === value ? CA.teal : CA.line}`,
                  }}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          <CACard style={{ overflow: "hidden" }}>
            {loading ? (
              <CAEmpty title="Loading reconciliation…" />
            ) : visible.length === 0 ? (
              <CAEmpty title="No ITC lines for this period" hint="Upload the GSTR-2B download for this month to build the reconciliation." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={caTh}>Date</th>
                      <th style={caTh}>Supplier GSTIN</th>
                      <th style={caTh}>Supplier</th>
                      <th style={caTh}>Invoice</th>
                      <th style={{ ...caTh, textAlign: "right" }}>ITC in books</th>
                      <th style={{ ...caTh, textAlign: "right" }}>ITC in 2B</th>
                      <th style={{ ...caTh, textAlign: "right" }}>Variance</th>
                      <th style={caTh}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td style={caTd}>{dateIN(r.invoice_date)}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{r.gstin_supplier}</td>
                        <td style={caTd}>{r.supplier_name ?? "—"}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{r.invoice_number ?? "—"}</td>
                        <td style={caNum}>{inr(r.book_itc)}</td>
                        <td style={caNum}>{inr(r.portal_itc)}</td>
                        <td style={{ ...caNum, color: Math.abs(r.variance) > 0.5 ? CA.red : CA.muted }}>{inr(r.variance)}</td>
                        <td style={caTd}><CABadge tone={VERDICT_TONE[r.verdict]}>{VERDICT_LABEL[r.verdict]}</CABadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CACard>
        </>
      )}
    </div>
  );
}
