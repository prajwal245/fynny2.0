import { useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, UploadCloud } from "lucide-react";
import { Badge, Card, Drawer, EmptyState, PageHeader, Tabs, Tone, V, formatDate, formatINR } from "../ui";
import { AgentStatusBadge, ProcessingCard, RowSkeleton } from "../agents";
import { Doc, useV2 } from "../store";

const TONE: Record<Doc["status"], Tone> = { Processing: "info", Parsed: "good", Failed: "bad" };

export default function DocumentsPage() {
  const { docs, clients, clientName, addDoc, runs } = useV2();
  const [tab, setTab] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [drag, setDrag] = useState(false);
  const [source, setSource] = useState<Doc["source"]>("Manual");
  const fileRef = useRef<HTMLInputElement>(null);

  const active = docs.find((d) => d.id === open) ?? null;
  const extractRuns = runs.filter((r) => r.agent === "extract");

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!clientId) { toast.error("Add a client before uploading"); return; }
    Array.from(files).forEach((f) => addDoc(f.name, clientId, source, f));
    toast.success(`Extract agent is reading your ${source === "Manual" ? "upload" : source + " document"}`);
  };

  const list = docs.filter((d) => tab === "All" || d.status === tab);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Extract agent. Upload once, we classify the file and pull every row."
        action={<AgentStatusBadge agent="extract" active={extractRuns.length > 0} label={extractRuns.length ? "Extracting" : "Extract"} />}
      />

      <Card
        style={{ padding: 0, marginBottom: 20, borderStyle: "dashed", borderColor: drag ? V.ink : V.line, background: drag ? V.gray : V.card }}
        onClick={() => fileRef.current?.click()}
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          style={{ padding: "40px 22px", textAlign: "center", cursor: "pointer" }}
        >
          <div style={{ width: 48, height: 48, borderRadius: 15, background: V.blue, display: "grid", placeItems: "center", margin: "0 auto 14px", color: "#1B4763" }}>
            <UploadCloud size={22} />
          </div>
          <h3 style={{ fontSize: 16 }}>Drop files here or click to upload</h3>
          <p style={{ fontSize: 13, color: V.body, marginTop: 6 }}>Bank statements, Tally exports and bills. CSV, Excel, Tally XML, PDF and photos.</p>
          <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.txt,.xml,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </Card>

      {clients.length > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: V.muted }}>Upload for</span>
          <select className="v2-input" style={{ width: "auto", minWidth: 220 }} value={clientId} onChange={(e) => setClientId(e.target.value)} onClick={(e) => e.stopPropagation()}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span style={{ fontSize: 12.5, color: V.muted }}>arrived through</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["Manual", "Gmail", "WhatsApp"] as const).map((s) => (
              <button
                key={s}
                className={`v2-btn ${source === s ? "v2-btn-primary" : "v2-btn-ghost"}`}
                onClick={() => setSource(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginBottom: extractRuns.length ? 18 : 0 }}>
        <AnimatePresence>
          {extractRuns.map((r) => (
            <ProcessingCard key={r.id} agent="extract" title={r.title} steps={r.steps} current={r.current} />
          ))}
        </AnimatePresence>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "All", label: "All", count: docs.length },
          { value: "Processing", label: "Processing", count: docs.filter((d) => d.status === "Processing").length },
          { value: "Parsed", label: "Parsed", count: docs.filter((d) => d.status === "Parsed").length },
          { value: "Failed", label: "Failed", count: docs.filter((d) => d.status === "Failed").length },
        ]}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<FileText size={22} />}
          title="No documents here yet"
          description="Upload a bank statement or a set of bills and the extract agent will classify and read them for you."
        />
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead><tr><th>File</th><th>Client</th><th>Source</th><th>Status</th><th>Rows</th><th>Date</th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map((d) => (
                  <motion.tr
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28 }}
                    className="clickable"
                    onClick={() => setOpen(d.id)}
                  >
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ color: V.body }}>{clientName(d.clientId)}</td>
                    <td style={{ color: V.body }}>{d.source}</td>
                    <td>
                      {d.status === "Processing"
                        ? <AgentStatusBadge agent="extract" active label="Extracting" />
                        : <Badge tone={TONE[d.status]}>{d.status}</Badge>}
                    </td>
                    <td className="num" style={{ color: V.body }}>{d.rows.length}</td>
                    <td className="num" style={{ color: V.body }}>{formatDate(d.date)}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <Drawer open={!!active} onClose={() => setOpen(null)} title={active?.name ?? ""}>
        {active && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Badge tone={TONE[active.status]}>{active.status}</Badge>
              <Badge>{clientName(active.clientId)}</Badge>
              <Badge>{active.source}</Badge>
            </div>
            {active.status === "Processing" ? (
              <RowSkeleton rows={4} />
            ) : active.rows.length === 0 ? (
              <p style={{ fontSize: 13.5, color: V.body }}>No rows were extracted from this file.</p>
            ) : (
              <motion.table className="v2-table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
                <thead><tr><th>Date</th><th>Particulars</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {active.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{formatDate(r.date)}</td>
                      <td>{r.particulars}</td>
                      <td className="num" style={{ textAlign: "right", color: r.amount < 0 ? V.maroon : V.green }}>{formatINR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </motion.table>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
