import { useCallback, useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { recomputeIntelligence } from "@/lib/postImportCompute";


const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".csv,.xlsx,.xls";

type DocRow = {
  id: string;
  file_name: string;
  file_size: number | null;
  parse_status: string;
  parse_error: string | null;
  rows_imported: number;
  created_at: string;
};

function humanSize(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const r = reader.result as string;
      const idx = r.indexOf(",");
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ row }: { row: DocRow }) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600,
    letterSpacing: "0.02em",
  };
  switch (row.parse_status) {
    case "completed":
      return <span style={{ ...base, background: "#F0FDF4", color: "#166534", border: "1px solid #A7F3D0" }}>
        <CheckCircle2 size={12} /> Imported {row.rows_imported} rows
      </span>;
    case "processing":
      return <span style={{ ...base, background: "#FEF9E7", color: "#8B6914", border: "1px solid #F5E6B8" }}>
        <Loader2 size={12} className="animate-spin" /> Processing…
      </span>;
    case "failed":
      return <span title={row.parse_error || "Failed"} style={{ ...base, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5", cursor: "help" }}>
        <AlertCircle size={12} /> Failed
      </span>;
    case "not_applicable":
      return <span title={row.parse_error || ""} style={{ ...base, background: "#F5F5F4", color: "rgba(23,18,8,0.55)", border: "1px solid #E7E5E4", cursor: "help" }}>
        Not supported
      </span>;
    default:
      return <span style={{ ...base, background: "#F5F5F4", color: "rgba(23,18,8,0.55)", border: "1px solid #E7E5E4" }}>
        Pending
      </span>;
  }
}

export default function BankStatementImport() {
  const { user, businessId } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "parsing">("idle");

  const history = useQuery({
    queryKey: ["bank_statement_imports", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<DocRow[]> => {
      const { data, error } = await supabase
        .from("business_documents" as any)
        .select("id, file_name, file_size, parse_status, parse_error, rows_imported, created_at")
        .eq("business_id", businessId!)
        .eq("document_type", "bank_statement")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as DocRow[];
    },
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as DocRow[];
      return rows.some((r) => r.parse_status === "pending" || r.parse_status === "processing") ? 2500 : false;
    },
  });

  const validate = (f: File): string | null => {
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "PDF import coming soon — please export CSV or Excel from your bank";
    if (!["csv", "xlsx", "xls"].includes(ext)) return "Only CSV, XLSX or XLS files are supported";
    if (f.size > MAX_BYTES) return "File must be under 10MB";
    return null;
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    const err = validate(f);
    if (err) { toast.error(err); return; }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    pickFile(e.dataTransfer.files?.[0] || null);
  }, []);

  const reset = () => {
    setFile(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onImport = async () => {
    if (!file || !user || !businessId) {
      if (!businessId) toast.error("Complete onboarding before importing transactions");
      return;
    }

    try {
      setPhase("uploading");
      const filePath = `${businessId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      const { error: upErr } = await supabase.storage
        .from("financial-imports")
        .upload(filePath, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        toast.error("Upload failed — check your connection and try again");
        setPhase("idle");
        return;
      }

      const { data: doc, error: docErr } = await supabase
        .from("business_documents" as any)
        .insert({
          business_id: businessId,
          document_type: "bank_statement",
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: user.id,
          parse_status: "pending",
        })
        .select()
        .single();
      if (docErr || !doc) {
        toast.error("Could not record upload — please try again");
        setPhase("idle");
        return;
      }

      qc.invalidateQueries({ queryKey: ["bank_statement_imports", businessId] });

      setPhase("parsing");
      const fileBase64 = await fileToBase64(file);

      const { data: result, error } = await supabase.functions.invoke("parse-financial-import", {
        body: { documentId: (doc as any).id, businessId, fileBase64, fileName: file.name },
      });

      if (error) {
        toast.error("Import is taking longer than expected — check Import History below in a moment");
        reset();
        qc.invalidateQueries({ queryKey: ["bank_statement_imports", businessId] });
        return;
      }

      if (result?.success) {
        await recomputeIntelligence(businessId);
        toast.success(
          `Import complete. ${result.rowsImported} transaction${result.rowsImported === 1 ? "" : "s"} imported. Dashboard metrics have been updated.`
        );
        qc.invalidateQueries({ queryKey: ["bank_transactions"] });
        qc.invalidateQueries({ queryKey: ["liquidity"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });

      } else {
        toast.error(result?.reason || "Import failed — please try again");
      }
      reset();
      qc.invalidateQueries({ queryKey: ["bank_statement_imports", businessId] });
    } catch (e) {
      toast.error("Import failed — please try again or contact support");
      reset();
    }
  };

  const busy = phase !== "idle";

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? "#C41E1E" : "#D4C9A8"}`,
          background: drag ? "#FDF2F1" : "#FAF7F0",
          borderRadius: 10, padding: 24, cursor: file ? "default" : "pointer",
          transition: "all 150ms ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => pickFile(e.target.files?.[0] || null)}
        />
        {!file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: "#FFFFFF",
              border: "1px solid #D4C9A8", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Upload size={20} color="#8B6914" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#171208" }}>
                Drop a bank statement here or click to browse
              </div>
              <div style={{ fontWeight: 400, fontSize: 12, color: "rgba(23,18,8,0.55)", marginTop: 2 }}>
                CSV, XLSX or XLS · up to 10MB
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: "#FFFFFF",
              border: "1px solid #D4C9A8", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileSpreadsheet size={20} color="#166534" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#171208", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </div>
              <div style={{ fontWeight: 400, fontSize: 12, color: "rgba(23,18,8,0.55)" }}>
                {humanSize(file.size)}
              </div>
            </div>
            {!busy && (
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
                title="Remove"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  width: 28, height: 28, borderRadius: 6, display: "flex",
                  alignItems: "center", justifyContent: "center", color: "rgba(23,18,8,0.55)",
                }}
              >
                <X size={16} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onImport(); }}
              disabled={busy}
              style={{
                fontWeight: 600, fontSize: 13, color: "#FFFFFF",
                background: "#C41E1E", border: "1px solid #A91818",
                borderRadius: 6, padding: "9px 18px",
                cursor: busy ? "wait" : "pointer", opacity: busy ? 0.85 : 1,
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {phase === "uploading" ? "Uploading…" : phase === "parsing" ? "Parsing…" : "Import Transactions"}
            </button>
          </div>
        )}
      </div>

      {history.data && history.data.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(23,18,8,0.55)", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Recent imports
          </div>
          <div style={{ border: "1px solid #F0EBD8", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAF7F0", color: "rgba(23,18,8,0.55)", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>File</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Uploaded</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #F0EBD8" }}>
                    <td style={{ padding: "10px 12px", color: "#171208", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.file_name}
                    </td>
                    <td style={{ padding: "10px 12px", color: "rgba(23,18,8,0.55)" }}>
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <StatusBadge row={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
