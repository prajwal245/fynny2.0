import { useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink,
  FileText,
  Inbox,
  RotateCw,
  Search,
  UploadCloud,
} from "lucide-react";
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  PageHeader,
  Tabs,
  Tone,
  V,
  formatDate,
  formatINR,
} from "../ui";
import { AgentStatusBadge, ProcessingCard, RowSkeleton } from "../agents";
import { Doc, useV2 } from "../store";

const TONE: Record<Doc["status"], Tone> = {
  Uploading: "info",
  Queued: "neutral",
  Processing: "info",
  Parsed: "good",
  "Needs review": "warn",
  Failed: "bad",
};
const STATUS_TABS = ["Queued", "Processing", "Parsed", "Needs review", "Failed"] as const;

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

/** The status cell: what the Extract agent is doing with this file, honestly. */
function DocStatus({ d }: { d: Doc }) {
  if (d.status === "Uploading")
    return <AgentStatusBadge agent="extract" active label="Uploading" />;
  if (d.status === "Processing")
    return <AgentStatusBadge agent="extract" active label="Reading" />;
  if (d.status === "Queued")
    return (
      <span title="Arrived by email or WhatsApp. The Extract agent reads it on the next sync.">
        <Badge tone="neutral">Queued</Badge>
        <div style={{ fontSize: 11.5, color: V.muted, marginTop: 3 }}>Reads on next sync</div>
      </span>
    );
  if (d.status === "Failed")
    return (
      <span>
        <Badge tone="bad">Failed</Badge>
        <div style={{ fontSize: 11.5, color: d.retryAt ? V.muted : V.maroon, marginTop: 3 }}>
          {d.retryAt ? `Retrying automatically at ${clock(d.retryAt)}` : "Needs your action"}
        </div>
      </span>
    );
  return <Badge tone={TONE[d.status]}>{d.status}</Badge>;
}
const SOURCES = ["All sources", "Manual", "Gmail", "WhatsApp"] as const;
const ACCEPT = ".csv,.tsv,.txt,.xml,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp";

/**
 * Documents. Firm-wide inbox when used as a page; the client's Documents tab
 * when given a clientId. Unassigned Gmail / WhatsApp arrivals are filed here.
 */
export default function DocumentsPage({
  clientId: scopedClient,
}: { clientId?: string } = {}) {
  const {
    docs,
    clients,
    clientName,
    addDoc,
    runs,
    dismissRun,
    reprocessDoc,
    assignDoc,
    openDocument,
  } = useV2();
  const [tab, setTab] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [uploadClient, setUploadClient] = useState(
    scopedClient ?? clients[0]?.id ?? "",
  );
  const [drag, setDrag] = useState(false);
  const [source, setSource] = useState<Doc["source"]>("Manual");
  const [sourceFilter, setSourceFilter] =
    useState<(typeof SOURCES)[number]>("All sources");
  const [query, setQuery] = useState("");
  const [assign, setAssign] = useState<{
    clientId: string;
    side: "bank" | "books" | "";
  }>({ clientId: "", side: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scoped = scopedClient
    ? docs.filter((d) => d.clientId === scopedClient)
    : docs;
  const unassigned = scopedClient ? [] : docs.filter((d) => !d.clientId);
  const active = docs.find((d) => d.id === open) ?? null;
  // Inside a client workspace the workspace itself shows the live cards.
  const extractRuns = scopedClient ? [] : runs.filter((r) => r.agent === "extract");
  const targetClient = scopedClient ?? uploadClient;

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!targetClient) {
      toast.error("Add a client before uploading");
      return;
    }
    Array.from(files).forEach((f) => addDoc(f.name, targetClient, source, f));
    toast.success(
      `Extract agent is reading ${files.length > 1 ? `${files.length} files` : files[0].name}`,
    );
    if (fileRef.current) fileRef.current.value = "";
  };

  const q = query.trim().toLowerCase();
  const base = tab.startsWith("Unassigned")
    ? unassigned
    : scoped.filter((d) => d.clientId || scopedClient);
  const list = base.filter((d) => {
    if (tab === "Unassigned email" && d.source !== "Gmail") return false;
    if (tab === "Unassigned WhatsApp" && d.source !== "WhatsApp") return false;
    if ((STATUS_TABS as readonly string[]).includes(tab)) {
      // "Processing" also covers files still uploading in this browser.
      const st = d.status === "Uploading" ? "Processing" : d.status;
      if (st !== tab) return false;
    }
    if (sourceFilter !== "All sources" && d.source !== sourceFilter)
      return false;
    if (
      q &&
      !`${d.name} ${clientName(d.clientId)} ${d.sender ?? ""} ${d.subject ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  const count = (s: Doc["status"]) =>
    scoped.filter((d) => (d.clientId || scopedClient) && d.status === s).length;

  const openDoc = (d: Doc) => {
    setOpen(d.id);
    // An unassigned arrival may carry a suggestion; it is only pre-selected, never filed.
    setAssign({ clientId: d.clientId || d.suggestedClientId || "", side: d.side ?? "" });
  };

  const fileIt = async () => {
    if (!active || !assign.clientId) {
      toast.error("Choose the client this document belongs to");
      return;
    }
    setBusy(true);
    await assignDoc(active.id, assign.clientId, assign.side || undefined);
    setBusy(false);
  };

  return (
    <>
      {!scopedClient && (
        <PageHeader
          title="Documents"
          subtitle="Extract agent. Everything that arrived, from uploads, Gmail and WhatsApp, in one inbox."
          action={
            <AgentStatusBadge
              agent="extract"
              active={extractRuns.length > 0}
              label={extractRuns.length ? "Extracting" : "Extract"}
            />
          }
        />
      )}

      <Card
        style={{
          padding: 0,
          marginBottom: 20,
          borderStyle: "dashed",
          borderColor: drag ? V.ink : V.line,
          background: drag ? V.gray : V.card,
        }}
        onClick={() => fileRef.current?.click()}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files);
          }}
          style={{
            padding: scopedClient ? "26px 22px" : "40px 22px",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 15,
              background: V.blue,
              display: "grid",
              placeItems: "center",
              margin: "0 auto 14px",
              color: "#1B4763",
            }}
          >
            <UploadCloud size={22} />
          </div>
          <h3 style={{ fontSize: 16 }}>Drop files here or click to upload</h3>
          <p style={{ fontSize: 13, color: V.body, marginTop: 6 }}>
            Bank statements, Tally exports and bills. CSV, Excel, Tally XML, PDF
            and photos.
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      </Card>

      {clients.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          {!scopedClient && (
            <>
              <span style={{ fontSize: 12.5, color: V.muted }}>Upload for</span>
              <select
                className="v2-input"
                style={{ width: "auto", minWidth: 220 }}
                value={uploadClient}
                onChange={(e) => setUploadClient(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span style={{ fontSize: 12.5, color: V.muted }}>
            arrived through
          </span>
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

      <div
        style={{
          display: "grid",
          gap: 12,
          marginBottom: extractRuns.length ? 18 : 0,
        }}
      >
        <AnimatePresence>
          {extractRuns.map((r) => (
            <ProcessingCard key={r.id} run={r} onDismiss={() => dismissRun(r.id)} />
          ))}
        </AnimatePresence>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "All",
            label: "All",
            count: scoped.filter((d) => d.clientId || scopedClient).length,
          },
          ...STATUS_TABS.map((st) => ({
            value: st,
            label: st,
            count:
              st === "Processing"
                ? count("Processing") + count("Uploading")
                : count(st),
          })),
          ...(scopedClient
            ? []
            : [
                {
                  value: "Unassigned email",
                  label: "Unassigned email",
                  count: unassigned.filter((d) => d.source === "Gmail").length,
                },
                {
                  value: "Unassigned WhatsApp",
                  label: "Unassigned WhatsApp",
                  count: unassigned.filter((d) => d.source === "WhatsApp")
                    .length,
                },
              ]),
        ]}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 380 }}>
          <Search
            size={15}
            style={{ position: "absolute", left: 12, top: 12, color: V.muted }}
          />
          <input
            className="v2-input"
            style={{ paddingLeft: 34 }}
            placeholder={
              scopedClient
                ? "Search file name"
                : "Search client, file or sender"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!tab.startsWith("Unassigned") && (
          <select
            className="v2-input"
            style={{ width: "auto", minWidth: 160 }}
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as (typeof SOURCES)[number])
            }
          >
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {list.length === 0 ? (
        tab.startsWith("Unassigned") ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="Nothing waiting to be filed"
            description={`Every ${tab === "Unassigned email" ? "email attachment" : "WhatsApp document"} was matched to a client. Anything from an unknown sender lands here so it is never filed under the wrong client.`}
          />
        ) : (
          <EmptyState
            icon={<FileText size={22} />}
            title={
              q || sourceFilter !== "All sources"
                ? "No documents match"
                : "No documents here yet"
            }
            description={
              q || sourceFilter !== "All sources"
                ? "Clear the search or source filter to see everything."
                : "Upload a bank statement or a Tally export above and the Extract agent will read every row."
            }
          />
        )
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                <th>File</th>
                {!scopedClient && (
                  <th>{tab.startsWith("Unassigned") ? "From" : "Client"}</th>
                )}
                <th>Source</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Received</th>
              </tr>
            </thead>
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
                    onClick={() => openDoc(d)}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {d.name}
                      {d.status === "Failed" && d.error && (
                        <div
                          style={{
                            fontSize: 12,
                            color: V.maroon,
                            fontWeight: 400,
                            marginTop: 3,
                          }}
                        >
                          {d.error}
                        </div>
                      )}
                    </td>
                    {!scopedClient && (
                      <td style={{ color: V.body }}>
                        {d.clientId
                          ? clientName(d.clientId)
                          : (d.sender ?? "Unknown sender")}
                      </td>
                    )}
                    <td style={{ color: V.body }}>{d.source}</td>
                    <td>
                      <DocStatus d={d} />
                    </td>
                    <td className="num" style={{ color: V.body }}>
                      {d.txnCount ?? d.rows.length}
                      {d.reviewCount ? (
                        <span style={{ color: V.muted }}>
                          {" "}
                          +{d.reviewCount} review
                        </span>
                      ) : null}
                    </td>
                    <td className="num" style={{ color: V.body }}>
                      {formatDate(d.date)}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <Drawer
        open={!!active}
        onClose={() => setOpen(null)}
        title={active?.name ?? ""}
      >
        {active && (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={TONE[active.status]}>{active.status}</Badge>
              <Badge>
                {active.clientId ? clientName(active.clientId) : "Unassigned"}
              </Badge>
              <Badge>{active.source}</Badge>
              {active.side && (
                <Badge tone="info">
                  {active.side === "bank" ? "Bank side" : "Books side"}
                </Badge>
              )}
              {active.duplicateCount ? (
                <Badge tone="warn">
                  {active.duplicateCount} duplicate
                  {active.duplicateCount > 1 ? "s" : ""} skipped
                </Badge>
              ) : null}
            </div>

            {(active.sender || active.subject) && (
              <div
                style={{
                  fontSize: 13,
                  color: V.body,
                  background: V.gray,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {active.sender && (
                  <div>
                    From <b>{active.sender}</b>
                  </div>
                )}
                {active.subject && (
                  <div style={{ marginTop: 3 }}>Subject: {active.subject}</div>
                )}
              </div>
            )}

            {active.status === "Failed" && (
              <div
                style={{
                  background: "rgba(169,56,56,.07)",
                  border: "1px solid rgba(169,56,56,.25)",
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 13,
                  color: V.maroon,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Why it failed</div>
                {active.error ?? "This file could not be read."}
                <div style={{ color: V.body, marginTop: 8 }}>
                  {active.retryAt
                    ? `This looks temporary. The Extract agent will try again at ${clock(active.retryAt)} (attempt ${(active.attempts ?? 1) + 1} of 3), or retry it now.`
                    : "Retry it, or upload a clearer copy (a text PDF, CSV or Excel export reads best)."}
                </div>
              </div>
            )}

            {active.status === "Queued" && (
              <div style={{ background: V.gray, borderRadius: 14, padding: 14, fontSize: 13, color: V.body }}>
                Received and waiting for the Extract agent. It reads on the next sync, or you can read it now.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="v2-btn v2-btn-ghost"
                onClick={() => openDocument(active.id)}
              >
                <ExternalLink size={15} /> Open original
              </button>
              {active.status !== "Processing" && active.status !== "Uploading" && (
                <button
                  className="v2-btn v2-btn-ghost"
                  onClick={() => reprocessDoc(active.id)}
                >
                  <RotateCw size={15} />{" "}
                  {active.status === "Failed"
                    ? "Retry now"
                    : active.status === "Queued"
                      ? "Read now"
                      : "Read again"}
                </button>
              )}
            </div>

            <div>
              <label className="v2-label">
                {active.clientId ? "Filed under" : "Assign to client"}
              </label>
              {!active.clientId && active.suggestedClientId && (
                <div
                  data-testid="assign-suggestion"
                  style={{ fontSize: 12.5, color: V.body, background: V.gray, borderRadius: 12, padding: "9px 12px", marginBottom: 10 }}
                >
                  Looks like <b>{clientName(active.suggestedClientId)}</b>
                  {active.suggestedBy ? ` (matched by ${active.suggestedBy === "domain" ? "email domain" : active.suggestedBy === "gstin" ? "GSTIN in the subject" : "sender name"})` : ""}.
                  Only a certain match is filed automatically, so please confirm.
                </div>
              )}
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                }}
              >
                <select
                  className="v2-input"
                  value={assign.clientId}
                  onChange={(e) =>
                    setAssign({ ...assign, clientId: e.target.value })
                  }
                >
                  <option value="">Choose client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="v2-input"
                  value={assign.side}
                  onChange={(e) =>
                    setAssign({
                      ...assign,
                      side: e.target.value as "bank" | "books" | "",
                    })
                  }
                >
                  <option value="">Detect bank or books</option>
                  <option value="bank">Bank statement</option>
                  <option value="books">Books (Tally, ledger, bills)</option>
                </select>
              </div>
              {(assign.clientId !== (active.clientId || "") ||
                (assign.side && assign.side !== active.side)) && (
                <button
                  className="v2-btn v2-btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={fileIt}
                >
                  {busy
                    ? "Filing"
                    : active.clientId
                      ? "Move and read again"
                      : "File under this client"}
                </button>
              )}
              <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>
                Filing re-reads the file under that client, so its rows join the
                right recon.
              </div>
            </div>

            {active.status === "Processing" || active.status === "Uploading" ? (
              <RowSkeleton rows={4} />
            ) : active.rows.length === 0 ? (
              <p style={{ fontSize: 13.5, color: V.body, margin: 0 }}>
                {active.reviewCount
                  ? `All ${active.reviewCount} rows from this file are waiting in the Review Queue.`
                  : "No transactions were extracted from this file."}
              </p>
            ) : (
              <motion.table
                className="v2-table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Particulars</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Recon</th>
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((r, i) => (
                    <tr key={r.id ?? i}>
                      <td className="num">{formatDate(r.date)}</td>
                      <td>{r.particulars}</td>
                      <td
                        className="num"
                        style={{
                          textAlign: "right",
                          color: r.amount < 0 ? V.maroon : V.green,
                        }}
                      >
                        {formatINR(r.amount)}
                      </td>
                      <td>
                        {r.matchStatus ? (
                          <Badge
                            tone={
                              r.matchStatus === "matched"
                                ? "good"
                                : r.matchStatus === "exception"
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {r.matchStatus}
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </motion.table>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
