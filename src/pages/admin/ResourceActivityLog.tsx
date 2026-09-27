import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Download, Upload, Eye, EyeOff, Trash2, FileText, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./AdminDashboardPage";
import { exportToCsv } from "@/utils/csvExport";

const INK = "#171208";
const RED = "#C41E1E";
const BORDER = "rgba(23,18,8,0.12)";
const BODY = "Arial, Helvetica, sans-serif";
const GREEN = "#0B7A5A";
const AMBER = "#8B6914";

type Entry = {
  id: string;
  at: string;
  kind: "admin" | "download";
  action: string;
  resourceId: string | null;
  resourceTitle: string | null;
  filePath: string | null;
  actor: string;
  meta: Record<string, unknown>;
};

const ICONS: Record<string, JSX.Element> = {
  download: <Download size={12} />,
  resource_file_upload: <Upload size={12} />,
  resource_file_replace: <Upload size={12} />,
  resource_file_relink: <Link2 size={12} />,
  resource_file_unlink: <Link2 size={12} />,
  resource_publish: <Eye size={12} />,
  resource_unpublish: <EyeOff size={12} />,
  resource_delete: <Trash2 size={12} />,
  resource_orphan_delete: <Trash2 size={12} />,
};

function labelFor(action: string) {
  if (action === "download") return "Download";
  return action.replace(/^resource_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function colorFor(e: Entry) {
  if (e.kind === "download") return e.meta.outcome === "success" ? GREEN : RED;
  if (e.action.includes("delete") || e.action.includes("unlink") || e.action === "resource_unpublish") return RED;
  if (e.action.includes("upload") || e.action.includes("replace") || e.action === "resource_publish") return GREEN;
  return AMBER;
}

export default function ResourceActivityLog({ resources }: { resources: { id: string; title: string }[] }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterResource, setFilterResource] = useState("all");
  const [filterKind, setFilterKind] = useState<"all" | "admin" | "download">("all");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminRes, dlRes] = await Promise.all([
        supabase
          .from("admin_audit_logs")
          .select("id, admin_user_id, action, details, created_at")
          .eq("target_type", "resource")
          .order("created_at", { ascending: false })
          .limit(300),
        (supabase as never as typeof supabase)
          .from("resource_access_logs")
          .select("id, resource_id, resource_title, file_path, user_id, outcome, ip_address, user_agent, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
      if (adminRes.error) throw adminRes.error;
      if (dlRes.error) throw dlRes.error;

      const adminRows = (adminRes.data ?? []) as {
        id: string; admin_user_id: string; action: string; details: Record<string, unknown>; created_at: string;
      }[];
      const dlRows = (dlRes.data ?? []) as unknown as {
        id: string; resource_id: string; resource_title: string | null; file_path: string | null;
        user_id: string | null; outcome: string; ip_address: string | null; user_agent: string | null; created_at: string;
      }[];

      const userIds = Array.from(
        new Set([...adminRows.map((r) => r.admin_user_id), ...dlRows.map((r) => r.user_id)].filter(Boolean) as string[]),
      );
      const names = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, display_name")
          .in("user_id", userIds);
        for (const p of (profs ?? []) as { user_id: string; full_name: string | null; display_name: string | null }[]) {
          names.set(p.user_id, p.display_name || p.full_name || "");
        }
      }
      const nameOf = (uid: string | null) => {
        if (!uid) return "Anonymous visitor";
        return names.get(uid) || `User ${uid.slice(0, 8)}`;
      };

      const merged: Entry[] = [
        ...adminRows.map((r) => ({
          id: `a-${r.id}`,
          at: r.created_at,
          kind: "admin" as const,
          action: r.action,
          resourceId: (r.details?.resource_id as string) ?? null,
          resourceTitle: (r.details?.resource_title as string) ?? null,
          filePath: (r.details?.file_path as string) ?? null,
          actor: nameOf(r.admin_user_id),
          meta: r.details ?? {},
        })),
        ...dlRows.map((r) => ({
          id: `d-${r.id}`,
          at: r.created_at,
          kind: "download" as const,
          action: "download",
          resourceId: r.resource_id,
          resourceTitle: r.resource_title,
          filePath: r.file_path,
          actor: nameOf(r.user_id),
          meta: { outcome: r.outcome, ip_address: r.ip_address, user_agent: r.user_agent },
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : -1));

      setEntries(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (filterKind === "all" || e.kind === filterKind) &&
          (filterResource === "all" || e.resourceId === filterResource),
      ),
    [entries, filterKind, filterResource],
  );

  const downloads = entries.filter((e) => e.kind === "download").length;
  const uploads = entries.filter((e) => e.action.includes("upload") || e.action.includes("replace")).length;

  const exportCsv = () =>
    exportToCsv(
      visible.map((e) => ({
        timestamp: new Date(e.at).toLocaleString("en-IN"),
        type: e.kind,
        action: labelFor(e.action),
        resource_id: e.resourceId ?? "",
        resource: e.resourceTitle ?? "",
        file_path: e.filePath ?? "",
        user: e.actor,
        outcome: String(e.meta.outcome ?? ""),
        ip: String(e.meta.ip_address ?? ""),
      })),
      "resource-activity",
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FileText size={16} color={INK} />
          <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 700, color: INK }}>File activity log</span>
        </div>
        <span style={{ fontFamily: BODY, fontSize: 12, color: "rgba(23,18,8,0.6)" }}>
          {loading ? "Loading…" : `${entries.length} events · ${downloads} downloads · ${uploads} uploads`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3"
            style={{ height: 30, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}
          >
            {open ? "Hide log" : "View log"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3"
            style={{ height: 30, borderRadius: 8, background: INK, color: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 700, opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 12, color: RED }}>{error}</div>}

      {open && !error && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterResource}
              onChange={(e) => setFilterResource(e.target.value)}
              style={{ height: 30, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, color: INK, padding: "0 8px", maxWidth: 280 }}
            >
              <option value="all">All resources</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as "all" | "admin" | "download")}
              style={{ height: 30, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, color: INK, padding: "0 8px" }}
            >
              <option value="all">All activity</option>
              <option value="admin">Admin changes</option>
              <option value="download">Downloads</option>
            </select>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 px-3 ml-auto"
              style={{ height: 30, borderRadius: 8, border: `0.5px solid ${BORDER}`, background: "#FFFFFF", fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}
            >
              <Download size={13} /> Export CSV
            </button>
          </div>

          {visible.length === 0 && (
            <div style={{ fontFamily: BODY, fontSize: 12, color: "rgba(23,18,8,0.5)" }}>No activity recorded yet.</div>
          )}

          <div className="flex flex-col" style={{ maxHeight: 420, overflowY: "auto" }}>
            {visible.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 py-2" style={{ borderBottom: "1px solid rgba(23,18,8,0.05)" }}>
                <span
                  className="inline-flex items-center gap-1.5 px-2"
                  style={{ height: 22, borderRadius: 6, background: "rgba(23,18,8,0.05)", color: colorFor(e), fontFamily: BODY, fontSize: 11, fontWeight: 700 }}
                >
                  {ICONS[e.action] ?? <FileText size={12} />} {labelFor(e.action)}
                </span>
                <span style={{ fontFamily: BODY, fontSize: 12, fontWeight: 600, color: INK }}>
                  {e.resourceTitle ?? e.resourceId ?? "—"}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "rgba(23,18,8,0.55)" }} className="truncate">
                  {e.filePath ?? ""}
                </span>
                <span className="ml-auto" style={{ fontFamily: BODY, fontSize: 11, color: "rgba(23,18,8,0.7)" }}>
                  {e.actor}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "rgba(23,18,8,0.5)", whiteSpace: "nowrap" }}>
                  {new Date(e.at).toLocaleString("en-IN")}
                </span>
                {Boolean(e.meta.outcome) && e.meta.outcome !== "success" && (
                  <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 700, color: RED }}>{String(e.meta.outcome)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
