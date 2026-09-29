import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { PageWrap, PageHeader, Card } from "@/components/ca/ui";
import { toast } from "sonner";
import { Archive, Download, Eye, RefreshCw, Filter } from "lucide-react";

type VaultFile = {
  name: string;
  path: string;
  size: number;
  created_at: string;
  client_name: string;
  business_id: string;
  period: string;
};

type ClientOption = {
  business_id: string;
  client_name: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "csv") return "CSV";
  if (ext === "xml") return "XML";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "IMG";
  if (["xlsx", "xls"].includes(ext)) return "XLS";
  return "DOC";
}

function fileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "#A93838";
  if (ext === "csv") return "#1F5A46";
  if (ext === "xml") return "#8B6914";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "#5B5BD6";
  return "rgba(23,18,8,0.45)";
}

export default function CAVaultPage() {
  const { caFirm } = useCAAuth();
  const firmId = caFirm?.id;
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filterClient, setFilterClient] = useState<string>("");
  const [filterPeriod, setFilterPeriod] = useState<string>("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [totalSize, setTotalSize] = useState(0);

  const loadVault = useCallback(async () => {
    if (!firmId) return;
    setLoading(true);
    try {
      const { data: clientData } = await supabase
        .from("ca_clients")
        .select("business_id, client_name")
        .eq("ca_firm_id", firmId)
        .order("client_name");
      const clientList = ((clientData ?? []) as ClientOption[]).filter((c) => !!c.business_id);
      setClients(clientList);
      const clientMap = new Map(clientList.map((c) => [c.business_id, c.client_name]));

      const allFiles: VaultFile[] = [];
      let total = 0;

      for (const client of clientList) {
        const prefix = `${firmId}/${client.business_id}`;
        const { data: periodFolders } = await supabase.storage
          .from("ca-client-documents")
          .list(prefix, { limit: 100 });

        for (const folder of periodFolders ?? []) {
          if (folder.id) continue; // skip files at this level — only process folders
          const periodPath = `${prefix}/${folder.name}`;
          const { data: periodFiles } = await supabase.storage
            .from("ca-client-documents")
            .list(periodPath, { limit: 200, sortBy: { column: "created_at", order: "desc" } });

          for (const f of periodFiles ?? []) {
            if (!f.id || f.name === ".emptyFolderPlaceholder") continue;
            const size = (f.metadata as { size?: number } | null)?.size ?? 0;
            total += size;
            allFiles.push({
              name: f.name,
              path: `${periodPath}/${f.name}`,
              size,
              created_at: f.created_at ?? "",
              client_name: clientMap.get(client.business_id) ?? client.business_id,
              business_id: client.business_id,
              period: folder.name,
            });
          }
        }
      }

      allFiles.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setFiles(allFiles);
      setTotalSize(total);
    } catch (err) {
      console.error("[fyn:vault] load error:", err);
      toast.error("Could not load vault documents");
    } finally {
      setLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    console.log("[fyn:vault] evidence vault loaded");
    loadVault();
  }, [loadVault]);

  const openFile = async (path: string) => {
    setOpeningId(path);
    try {
      const { data, error } = await supabase.storage
        .from("ca-client-documents")
        .createSignedUrl(path, 300);
      if (error || !data?.signedUrl) {
        toast.error("Could not generate secure link. Please try again.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open file");
    } finally {
      setOpeningId(null);
    }
  };

  const downloadFile = async (path: string, filename: string) => {
    setOpeningId(path + "_dl");
    try {
      const { data, error } = await supabase.storage
        .from("ca-client-documents")
        .createSignedUrl(path, 60);
      if (error || !data?.signedUrl) { toast.error("Could not generate download link"); return; }
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = filename;
      a.click();
    } catch {
      toast.error("Download failed");
    } finally {
      setOpeningId(null);
    }
  };

  const filteredFiles = files.filter((f) => {
    if (filterClient && f.business_id !== filterClient) return false;
    if (filterPeriod && f.period !== filterPeriod) return false;
    return true;
  });

  const periods = Array.from(new Set(files.map((f) => f.period))).sort().reverse();

  const caTh: CSSProperties = {
    padding: "8px 12px",
    fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(23,18,8,0.4)",
    textAlign: "left",
    borderBottom: "1px solid rgba(23,18,8,0.07)",
    whiteSpace: "nowrap",
    background: "#FFFDF9",
  };
  const caTd: CSSProperties = {
    padding: "10px 12px",
    fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif",
    fontSize: 13,
    color: "rgba(23,18,8,0.75)",
    borderBottom: "1px solid rgba(23,18,8,0.05)",
    verticalAlign: "middle",
  };

  if (!caFirm) return null;

  return (
    <PageWrap>
      <PageHeader
        title="Evidence vault"
        sub="All uploaded documents for your firm — secured with time-limited signed access"
        right={
          <button
            onClick={loadVault}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, padding: "8px 14px", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.75)", cursor: "pointer" }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#FFFDF9", border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11, color: "rgba(23,18,8,0.4)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total documents</div>
          <div style={{ fontFamily: "'Georgia',serif", fontSize: 32, fontWeight: 700, color: "#171208" }}>{loading ? "—" : files.length}</div>
        </div>
        <div style={{ background: "#FFFDF9", border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11, color: "rgba(23,18,8,0.4)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total storage used</div>
          <div style={{ fontFamily: "'Georgia',serif", fontSize: 32, fontWeight: 700, color: "#171208" }}>{loading ? "—" : formatBytes(totalSize)}</div>
        </div>
        <div style={{ background: "#FFFDF9", border: "1px solid rgba(23,18,8,0.09)", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11, color: "rgba(23,18,8,0.4)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Clients with documents</div>
          <div style={{ fontFamily: "'Georgia',serif", fontSize: 32, fontWeight: 700, color: "#171208" }}>{loading ? "—" : new Set(files.map((f) => f.business_id)).size}</div>
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <Filter size={13} style={{ color: "rgba(23,18,8,0.35)" }} />
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            style={{ height: 34, padding: "0 10px", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, background: "#FFFDF9", color: "#171208", cursor: "pointer" }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>{c.client_name}</option>
            ))}
          </select>
          <select
            value={filterPeriod}
            onChange={(e) => setFilterPeriod(e.target.value)}
            style={{ height: 34, padding: "0 10px", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, background: "#FFFDF9", color: "#171208", cursor: "pointer" }}
          >
            <option value="">All periods</option>
            {periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {(filterClient || filterPeriod) && (
            <button
              onClick={() => { setFilterClient(""); setFilterPeriod(""); }}
              style={{ fontSize: 12, color: "#A93838", background: "none", border: "none", cursor: "pointer", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif" }}
            >
              Clear filters
            </button>
          )}
          <span style={{ marginLeft: "auto", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "rgba(23,18,8,0.4)" }}>
            {loading ? "Loading…" : `${filteredFiles.length} document${filteredFiles.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.38)" }}>
            Loading vault…
          </div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(23,18,8,0.05)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Archive size={24} style={{ color: "rgba(23,18,8,0.3)" }} />
            </div>
            <div style={{ fontFamily: "'Georgia',serif", fontSize: 18, fontWeight: 700, color: "#171208", marginBottom: 8 }}>
              {files.length === 0 ? "No documents in the vault yet" : "No documents match your filters"}
            </div>
            <p style={{ fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 13, color: "rgba(23,18,8,0.5)", maxWidth: 400, margin: "0 auto" }}>
              {files.length === 0
                ? "Documents uploaded through the Intake inbox are automatically stored here. Upload your first client bank statement to get started."
                : "Try clearing the filters to see all documents."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={caTh}>File</th>
                  <th style={caTh}>Client</th>
                  <th style={caTh}>Period</th>
                  <th style={caTh}>Size</th>
                  <th style={caTh}>Uploaded</th>
                  <th style={{ ...caTh, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((f) => (
                  <tr key={f.path} style={{ background: "transparent" }}>
                    <td style={caTd}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 6,
                          background: "rgba(23,18,8,0.05)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, color: fileIconColor(f.name) }}>
                            {fileIcon(f.name)}
                          </span>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "#171208", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
                            {f.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...caTd, fontWeight: 600, color: "#171208" }}>{f.client_name}</td>
                    <td style={caTd}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{f.period}</span>
                    </td>
                    <td style={{ ...caTd, fontSize: 12, color: "rgba(23,18,8,0.45)" }}>{formatBytes(f.size)}</td>
                    <td style={{ ...caTd, fontSize: 12, color: "rgba(23,18,8,0.45)" }}>
                      {f.created_at ? new Date(f.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ ...caTd, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openFile(f.path)}
                          disabled={openingId === f.path}
                          title="View file"
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(23,18,8,0.12)", background: "none", cursor: openingId === f.path ? "wait" : "pointer", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "#171208" }}
                        >
                          <Eye size={12} />
                          {openingId === f.path ? "Opening…" : "View"}
                        </button>
                        <button
                          onClick={() => downloadFile(f.path, f.name)}
                          disabled={openingId === f.path + "_dl"}
                          title="Download file"
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, border: "none", background: "#A93838", cursor: openingId === f.path + "_dl" ? "wait" : "pointer", fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 12, color: "#F7F1E6", fontWeight: 600 }}
                        >
                          <Download size={12} />
                          {openingId === f.path + "_dl" ? "…" : "Download"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 12, fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif", fontSize: 11.5, color: "rgba(23,18,8,0.35)", lineHeight: 1.6 }}>
        All documents are stored in a private Supabase Storage bucket. Access requires a time-limited signed URL (5 minutes) generated by the server. Files are never publicly accessible.
      </div>
    </PageWrap>
  );
}
