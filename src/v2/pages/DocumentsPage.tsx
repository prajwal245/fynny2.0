import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
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
import { AgentStatusBadge, RowSkeleton } from "../agents";
import { IntakePanel } from "../components/IntakePanel";
import { SourceIcon } from "../components/BrandIcons";
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
  if (d.register)
    return (
      <span title={d.register.note}>
        <Badge tone="good">Register</Badge>
        <div style={{ fontSize: 11.5, color: V.muted, marginTop: 3 }}>{d.register.label}</div>
      </span>
    );
  // Every row was already in the books from an earlier file: say so, not "0".
  if (d.status === "Parsed" && !d.txnCount && d.duplicateCount)
    return (
      <span>
        <Badge tone="neutral">Already received</Badge>
        <div style={{ fontSize: 11.5, color: V.muted, marginTop: 3 }}>{d.duplicateCount} duplicate{d.duplicateCount === 1 ? "" : "s"} skipped</div>
      </span>
    );
  return <Badge tone={TONE[d.status]}>{d.status}</Badge>;
}
const SOURCES = ["All sources", "Manual", "Gmail", "WhatsApp", "Zoho Books"] as const;
const ACCEPT = ".csv,.tsv,.txt,.xml,.pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp";

/**
 * Documents. Firm-wide inbox when used as a page; the client's Documents tab
 * when given a clientId. Unassigned Gmail / WhatsApp arrivals are filed here.
 */
export default function DocumentsPage({
  clientId: scopedClient,
  focusDocId,
}: { clientId?: string; focusDocId?: string } = {}) {
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
  const [sourceFilter, setSourceFilter] =
    useState<(typeof SOURCES)[number]>("All sources");
  const [query, setQuery] = useState("");
  const [assign, setAssign] = useState<{
    clientId: string;
    side: "bank" | "books" | "register" | "";
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
    Array.from(files).forEach((f) => addDoc(f.name, targetClient, "Manual", f));
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
    setAssign({ clientId: d.clientId || d.suggestedClientId || "", side: d.register ? "register" : (d.side ?? "") });
  };

  // Opened from "Fix" in Needs you: show that file among the failed ones, drawer open.
  const focused = useRef(false);
  useEffect(() => {
    if (!focusDocId || focused.current) return;
    const d = docs.find((x) => x.id === focusDocId);
    if (!d) return;
    focused.current = true;
    if (d.status === "Failed") setTab("Failed");
    openDoc(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the file is known
  }, [focusDocId, docs]);

  const fileIt = async () => {
    if (!active || !assign.clientId) {
      toast.error("Choose the client this document belongs to");
      return;
    }
    setBusy(true);
    // A register is recognised from its columns, so it is read with detection on.
    await assignDoc(active.id, assign.clientId, assign.side === "bank" || assign.side === "books" ? assign.side : undefined);
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

      <IntakePanel
        unassignedEmail={unassigned.filter((d) => d.source === "Gmail").length}
        unassignedWhatsApp={unassigned.filter((d) => d.source === "WhatsApp").length}
        onShowUnassigned={(t) => setTab(t)}
        upload={
          <div style={{ padding: scopedClient ? 16 : 20, display: "grid", gap: 14 }}>
            {!scopedClient && clients.length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label htmlFor="upload-client" style={{ fontSize: 13, color: V.body, fontWeight: 600 }}>Client</label>
                <select
                  id="upload-client"
                  className="v2-input"
                  style={{ width: "auto", minWidth: 240 }}
                  value={uploadClient}
                  onChange={(e) => setUploadClient(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload documents"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
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
                padding: scopedClient ? "22px 18px" : "32px 18px",
                textAlign: "center",
                cursor: "pointer",
                border: `1.5px dashed ${drag ? V.ink : "rgba(255,255,255,.25)"}`,
                borderRadius: 14,
                background: drag ? V.gray : "transparent",
                transition: "background .15s ease, border-color .15s ease",
              }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 14, background: V.blue, display: "grid", placeItems: "center", margin: "0 auto 12px", color: V.brandDeep }}>
                <UploadCloud size={22} />
              </div>
              <h3 style={{ fontSize: 16 }}>Drop files here or click to choose</h3>
              <p style={{ fontSize: 13, color: V.body, marginTop: 6 }}>
                Bank statements, Tally exports, bills, GST/TDS registers, payroll and gateway reports. CSV, Excel, Tally XML, PDF and photos, up to 25 MB.
              </p>
              <p style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>
                FynHelp works out what each file is. Registers are summarised and never mixed into bank reconciliation.
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
          </div>
        }
      />

      

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
                : tab !== "All"
                  ? `Nothing in ${tab}`
                  : "No documents here yet"
            }
            description={
              q || sourceFilter !== "All sources"
                ? "Clear the search or source filter to see everything."
                : tab === "Failed"
                  ? "Every file was read. Files that cannot be read show here with the reason and a way to fix it."
                  : tab === "Needs review"
                    ? "No file has rows waiting for a person."
                    : tab === "Processing" || tab === "Queued"
                      ? "Nothing is being read right now."
                      : tab !== "All"
                        ? "Switch to All to see every document."
                        : "Upload a bank statement or a Tally export above and the Extract agent will read every row."
            }
          />
        )
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table v2-table-stack">
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
                    <td style={{ color: V.body }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <SourceIcon source={d.source} />
                        {d.source === "Manual" ? "Upload" : d.source}
                      </span>
                    </td>
                    <td>
                      <DocStatus d={d} />
                    </td>
                    <td className="num" style={{ color: V.body }}>
                      {d.register ? `${d.register.entries} entries` : !d.txnCount && d.duplicateCount ? `0 new, ${d.duplicateCount} dup.` : (d.txnCount ?? d.rows.length)}
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
              {active.register ? (
                <Badge tone="info">{active.register.label} · reference only</Badge>
              ) : active.side && active.status !== "Failed" ? (
                <Badge tone="info">
                  {active.side === "bank" ? "Bank side" : "Books side"}
                </Badge>
              ) : null}
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
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(160px, 100%), 1fr))",
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
                      side: e.target.value as "bank" | "books" | "register" | "",
                    })
                  }
                  aria-label="Document type"
                >
                  <option value="">Detect automatically</option>
                  <option value="bank">Bank statement</option>
                  <option value="books">Books (Tally, ledger, bills)</option>
                  <option value="register">Register or report (GST, TDS, payroll, gateway)</option>
                </select>
              </div>
              {(assign.clientId !== (active.clientId || "") ||
                (assign.side && assign.side !== (active.register ? "register" : active.side))) && (
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
            ) : active.register ? (
              <div style={{ display: "grid", gap: 10 }} data-testid="register-summary">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{active.register.label} · {active.register.entries} entries</div>
                <table className="v2-table">
                  <tbody>
                    {active.register.totals.map((t) => (
                      <tr key={t.label}>
                        <td>{t.label}</td>
                        <td className="num" style={{ textAlign: "right" }}>{formatINR(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {active.register.groups?.length ? (
                  <div style={{ fontSize: 12.5, color: V.body }}>
                    {active.register.groups.slice(0, 12).map((g) => (
                      <div key={g.key}><span className="v2-mono">{g.key}</span>: <span className="num">{formatINR(g.amount)}</span> ({g.count} line{g.count === 1 ? "" : "s"})</div>
                    ))}
                  </div>
                ) : null}
                {active.register.checks?.length ? (
                  <div style={{ display: "grid", gap: 6 }} data-testid="register-checks">
                    <div className="v2-label" style={{ marginBottom: 0 }}>Checked under Indian GST, TDS and payroll rules</div>
                    {active.register.checks.map((c) => (
                      <div key={c.label} style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr)", gap: 8, fontSize: 12.5, alignItems: "start" }}>
                        <span style={{ color: c.ok ? V.green : V.maroon, paddingTop: 1 }}>{c.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
                        <span style={{ color: c.ok ? V.body : V.ink }}><b>{c.label}.</b> {c.detail}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>{active.register.note}</p>
              </div>
            ) : active.rows.length === 0 ? (
              <p style={{ fontSize: 13.5, color: V.body, margin: 0 }}>
                {active.reviewCount
                  ? `All ${active.reviewCount} rows from this file are waiting in the Review Queue.`
                  : active.duplicateCount
                    ? `Every row in this file was already received from an earlier file: ${active.duplicateCount} duplicate${active.duplicateCount === 1 ? "" : "s"} skipped, nothing added twice.`
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
