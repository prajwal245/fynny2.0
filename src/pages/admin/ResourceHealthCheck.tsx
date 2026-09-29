import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Upload, Link2Off, EyeOff, Trash2, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "./AdminDashboardPage";
import { logResourceAction, ResourceAuditAction } from "@/lib/resourceAudit";

const INK = "#171208";
const RED = "#C41E1E";
const BORDER = "rgba(23,18,8,0.12)";
const BODY = "Arial, Helvetica, sans-serif";
const GREEN = "#0B7A5A";
const AMBER = "#8B6914";

const BUCKET = "resources";

type Row = {
  id: string;
  title: string;
  file_path: string | null;
  file_url: string | null;
  external_url: string | null;
  is_published: boolean;
};

type Severity = "ok" | "warn" | "error";

type Issue = {
  row: Row;
  severity: Severity;
  code: string;
  message: string;
  objectPath: string | null;
};

/** Derive the storage object path a row points at (file_path wins, else tail of file_url). */
function objectPathOf(row: Row): string | null {
  if (row.file_path && row.file_path.trim()) return row.file_path.trim().replace(/^\/+/, "");
  if (row.file_url && row.file_url.includes(`/${BUCKET}/`)) {
    const tail = row.file_url.split(`/${BUCKET}/`)[1];
    if (tail) return decodeURIComponent(tail.split("?")[0]);
  }
  return null;
}

async function listAllObjects(): Promise<Set<string>> {
  const found = new Set<string>();
  const walk = async (prefix: string, depth: number) => {
    if (depth > 3) return;
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // Folders come back with a null id in Supabase storage listings.
      if ((item as { id: string | null }).id === null) await walk(full, depth + 1);
      else found.add(full);
    }
  };
  await walk("", 0);
  return found;
}

export default function ResourceHealthCheck({ onChanged }: { onChanged?: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [objects, setObjects] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const uploadTarget = useRef<Row | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const { data, error } = await supabase
        .from("resources")
        .select("id, title, file_path, file_url, external_url, is_published")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const objs = await listAllObjects();
      setRows((data ?? []) as Row[]);
      setObjects(objs);
      setRanAt(new Date());
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
    }
    setScanning(false);
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issues: Issue[] = useMemo(() => {
    const out: Issue[] = [];
    for (const row of rows) {
      const objectPath = objectPathOf(row);
      const hasExternal = !!row.external_url?.trim();
      if (!objectPath && !hasExternal) {
        out.push({ row, severity: "error", code: "no_file", message: "No file and no external link — download will fail", objectPath: null });
        continue;
      }
      if (objectPath && !objects.has(objectPath)) {
        out.push({
          row,
          severity: hasExternal ? "warn" : "error",
          code: "missing_object",
          message: `Storage object "${objectPath}" does not exist in the ${BUCKET} bucket`,
          objectPath,
        });
        continue;
      }
      if (!row.file_path && objectPath) {
        out.push({ row, severity: "warn", code: "legacy_url", message: "Uses a legacy file URL instead of file_path", objectPath });
        continue;
      }
      if (!objectPath && hasExternal) {
        out.push({ row, severity: "warn", code: "external_only", message: "External link only — no file stored in the bucket", objectPath: null });
      }
    }
    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  }, [rows, objects]);

  const referenced = useMemo(() => new Set(rows.map(objectPathOf).filter(Boolean) as string[]), [rows]);
  const orphans = useMemo(() => [...objects].filter((o) => !referenced.has(o)).sort(), [objects, referenced]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;

  /* ------------------------------ quick actions ----------------------------- */

  const patch = async (row: Row, values: Record<string, unknown>, msg: string, audit?: { action: ResourceAuditAction; details?: Record<string, unknown> }) => {
    setBusyId(row.id);
    const { error } = await (supabase as never as typeof supabase)
      .from("resources")
      .update({ ...values, updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    if (audit) await logResourceAction(audit.action, row, { previous_file_path: row.file_path, ...audit.details });
    toast.success(msg);
    await scan();
    onChanged?.();
  };

  const pickFile = (row: Row) => {
    uploadTarget.current = row;
    fileRef.current?.click();
  };

  const onFile = async (file: File) => {
    const row = uploadTarget.current;
    uploadTarget.current = null;
    if (fileRef.current) fileRef.current.value = "";
    if (!row) return;
    if (file.size > 50 * 1024 * 1024) return toast.error("File is larger than 50 MB");
    setBusyId(row.id);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (error) {
      setBusyId(null);
      return toast.error(error.message);
    }
    setBusyId(null);
    await patch(row, { file_path: path, file_url: null }, "File uploaded and linked", {
      action: row.file_path ? "resource_file_replace" : "resource_file_upload",
      details: { file_path: path, file_name: file.name, file_size: file.size, content_type: file.type || null, via: "health_check" },
    });
  };

  const attachOrphan = async (row: Row, path: string) => {
    await patch(row, { file_path: path, file_url: null }, "Existing file linked", {
      action: "resource_file_relink",
      details: { file_path: path, via: "health_check" },
    });
  };

  const deleteOrphan = async (path: string) => {
    setBusyId(path);
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    setBusyId(null);
    if (error) return toast.error(error.message);
    await logResourceAction("resource_orphan_delete", { id: null, title: path }, { file_path: path });
    toast.success("Orphan file deleted");
    scan();
  };

  const statusColor = errorCount > 0 ? RED : warnCount > 0 ? AMBER : GREEN;

  return (
    <Card>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {errorCount > 0 ? <AlertTriangle size={16} color={RED} /> : warnCount > 0 ? <FileWarning size={16} color={AMBER} /> : <CheckCircle2 size={16} color={GREEN} />}
          <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: INK }}>File health check</span>
        </div>
        <span style={{ fontFamily: BODY, fontSize: 12, color: statusColor, fontWeight: 700 }}>
          {scanning
            ? "Scanning…"
            : scanError
            ? "Scan failed"
            : `${errorCount} broken · ${warnCount} warnings · ${orphans.length} orphan files`}
        </span>
        {ranAt && !scanning && (
          <span style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.45)" }}>Last scan {ranAt.toLocaleTimeString()}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3"
            style={{ height: 30, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}
          >
            {open ? "Hide report" : "View report"}
          </button>
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-3"
            style={{ height: 30, borderRadius: 8, background: INK, color: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 700, opacity: scanning ? 0.6 : 1 }}
          >
            <RefreshCw size={13} /> Re-scan
          </button>
        </div>
      </div>

      {scanError && (
        <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 12, color: RED }}>{scanError}</div>
      )}

      {open && !scanError && (
        <div className="mt-4 flex flex-col gap-4">
          {issues.length === 0 && (
            <div style={{ fontFamily: BODY, fontSize: 12, color: GREEN, fontWeight: 600 }}>
              Every resource points at a file that exists in storage.
            </div>
          )}

          {issues.map((issue) => (
            <div
              key={`${issue.row.id}-${issue.code}`}
              style={{ border: `0.5px solid ${BORDER}`, borderLeft: `3px solid ${issue.severity === "error" ? RED : AMBER}`, borderRadius: 8, padding: 12 }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: INK }}>{issue.row.title}</span>
                <span
                  style={{
                    fontFamily: BODY,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: issue.severity === "error" ? RED : AMBER,
                  }}
                >
                  {issue.severity === "error" ? "Broken" : "Warning"}
                </span>
                {issue.row.is_published && (
                  <span style={{ fontFamily: BODY, fontSize: 10, color: "rgba(23,18,8,0.5)" }}>live on /resources</span>
                )}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 12, color: "rgba(23,18,8,0.7)", marginTop: 4 }}>{issue.message}</div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <QuickBtn disabled={busyId === issue.row.id} onClick={() => pickFile(issue.row)}>
                  <Upload size={12} /> Upload file
                </QuickBtn>
                {issue.code === "missing_object" && (
                  <QuickBtn disabled={busyId === issue.row.id} onClick={() => patch(issue.row, { file_path: null, file_url: null }, "Broken path cleared", { action: "resource_file_unlink", details: { via: "health_check" } })}>
                    <Link2Off size={12} /> Clear broken path
                  </QuickBtn>
                )}
                {issue.code === "legacy_url" && issue.objectPath && (
                  <QuickBtn disabled={busyId === issue.row.id} onClick={() => patch(issue.row, { file_path: issue.objectPath, file_url: null }, "Migrated to file_path", { action: "resource_file_relink", details: { file_path: issue.objectPath, via: "health_check" } })}>
                    <CheckCircle2 size={12} /> Convert to file_path
                  </QuickBtn>
                )}
                {issue.severity === "error" && issue.row.is_published && (
                  <QuickBtn disabled={busyId === issue.row.id} onClick={() => patch(issue.row, { is_published: false }, "Unpublished", { action: "resource_unpublish", details: { via: "health_check", reason: issue.code } })}>
                    <EyeOff size={12} /> Unpublish
                  </QuickBtn>
                )}
                {orphans.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) attachOrphan(issue.row, e.target.value);
                      e.target.value = "";
                    }}
                    style={{ height: 28, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 11, color: INK, padding: "0 8px", maxWidth: 260 }}
                  >
                    <option value="">Link an existing file…</option>
                    {orphans.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ))}

          {orphans.length > 0 && (
            <div>
              <div style={{ fontFamily: BODY, fontSize: 12, fontWeight: 700, color: INK, marginBottom: 6 }}>
                Orphan files in storage ({orphans.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {orphans.map((o) => (
                  <div key={o} className="flex items-center gap-2" style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(23,18,8,0.7)" }}>
                    <span className="truncate">{o}</span>
                    <QuickBtn disabled={busyId === o} onClick={() => deleteOrphan(o)}>
                      <Trash2 size={12} /> Delete
                    </QuickBtn>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function QuickBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2.5"
      style={{
        height: 28,
        borderRadius: 8,
        border: `0.5px solid ${BORDER}`,
        background: "#FFFFFF",
        fontFamily: BODY,
        fontSize: 11,
        fontWeight: 600,
        color: INK,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
