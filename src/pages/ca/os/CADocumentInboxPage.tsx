import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { useNavigate } from "@/lib/router-compat";
import { CA, CACard, CAButton, CABadge, caInputStyle, caTh, caTd, dateIN } from "@/components/ca/portalUi";
import { ConfidenceChip, ModuleHeader, PermissionNotice, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { DOC_CLASS_LABELS, guessClassification, intakeDocument, type CADocClass } from "@/lib/caIntake";

function cleanErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
      .replace(/\b[0-9]{5}\b/g, "") // strip Postgres error codes
      .replace(/relation "[^"]*"/g, "database table") // hide table names
      .replace(/column "[^"]*"/g, "field") // hide column names
      .trim();
  }
  return "An unexpected error occurred";
}

interface GmailRow {
  id: string;
  original_filename: string | null;
  gmail_sender_email: string | null;
  gmail_subject: string | null;
  gmail_match_method: string | null;
  gmail_match_confidence: number | null;
  business_id: string | null;
  confidence: number;
  review_state: string;
  created_at: string;
}

interface Row {
  id: string;
  business_id: string;
  original_filename: string | null;
  classification: string;
  confidence: number;
  review_state: string;
  created_at: string;
  error_message: string | null;
}

const CLASSES: CADocClass[] = ["bank", "invoice", "expense", "challan", "other"];

function flashClientSelect() {
  const clientSelect = document.getElementById("client-select-dropdown");
  if (clientSelect) {
    clientSelect.style.transition = "box-shadow 0.2s, border-color 0.2s";
    clientSelect.style.boxShadow = "0 0 0 3px rgba(169,56,56,0.35)";
    clientSelect.style.borderColor = "#A93838";
    clientSelect.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      clientSelect.style.boxShadow = "";
      clientSelect.style.borderColor = "";
    }, 2500);
  }
}

function UploadZone({
  busy,
  businessId,
  onFiles,
}: {
  busy: boolean;
  businessId: string;
  onFiles: (files: FileList) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!businessId) {
      toast.error("Please select a client before uploading", { duration: 5000 });
      flashClientSelect();
      return;
    }
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!busy) fileRef.current?.click();
      }}
      style={{
        border: `2px dashed ${dragging ? "#A93838" : "rgba(23,18,8,0.18)"}`,
        borderRadius: 14,
        padding: "32px 24px",
        textAlign: "center",
        background: dragging ? "rgba(169,56,56,0.04)" : "rgba(23,18,8,0.015)",
        cursor: busy ? "not-allowed" : "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,application/pdf,text/csv,.csv,.xml,application/vnd.ms-excel,text/xml,application/xml"
        style={{ display: "none" }}
        disabled={busy}
        onChange={(e) => {
          if (e.target.files?.length && businessId) onFiles(e.target.files);
          else if (!businessId) {
            toast.error("Please select a client before uploading", { duration: 5000 });
            flashClientSelect();
          }
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
      {busy ? (
        <div style={{ fontFamily: CA.sans, fontSize: 14, color: CA.teal, fontWeight: 600 }}>Reading documents…</div>
      ) : (
        <>
          <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink, marginBottom: 8 }}>
            {!businessId ? "Select a client above, then drag files here" : dragging ? "Drop to upload" : "Drag and drop or click to upload"}
          </div>
          {!businessId && (
            <p style={{ fontFamily: CA.sans, fontSize: 13, color: "#A93838", fontWeight: 600, marginTop: 10 }}>
              Select a client from the dropdown above to begin uploading
            </p>
          )}
          <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, maxWidth: 420, margin: "0 auto 12px" }}>
            Bank statements, invoices, expense bills, tax challans. CSV files go through the bank parser directly. Images and PDFs go
            through AI extraction.
          </p>
          <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.faint }}>
            HDFC, ICICI, SBI, Axis, Kotak CSV · Tally XML · Generic CSV · PDF · JPEG · PNG · WebP
          </div>
        </>
      )}
      <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 12 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!busy) fileRef.current?.click();
          }}
          disabled={busy}
          style={{
            background: "none",
            border: `1.5px solid rgba(23,18,8,0.2)`,
            borderRadius: 8,
            padding: "8px 20px",
            fontFamily: CA.sans,
            fontSize: 13,
            fontWeight: 600,
            color: CA.ink,
            cursor: busy ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Browse files
        </button>
      </div>
    </div>
  );
}

export default function CADocumentInboxPage() {
  const { firmId } = useCAPortal();
  const { can, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const [rows, setRows] = useState<Row[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [period, setPeriod] = useState("");
  const [classification, setClassification] = useState<CADocClass | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [reclassify, setReclassify] = useState<Record<string, CADocClass>>({});
  const [viewBusy, setViewBusy] = useState<string | null>(null);
  const navigate = useNavigate();
  const [inboxTab, setInboxTab] = useState<"upload" | "gmail">("upload");
  const [gmailItems, setGmailItems] = useState<GmailRow[]>([]);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [verifyItem, setVerifyItem] = useState<GmailRow | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [uploadLog, setUploadLog] = useState<Array<{ filename: string; status: "ok" | "error" | "review"; message: string }>>([]);
  const [vaultFiles, setVaultFiles] = useState<Array<{ name: string; path: string; created_at: string }>>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultLoading, setVaultLoading] = useState(false);

  const load = useCallback(async () => {
    if (!firmId) return;
    const { data } = await supabase
      .from("ca_document_extractions")
      .select("id, business_id, original_filename, classification, confidence, review_state, created_at, error_message")
      .eq("ca_firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as Row[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadGmailItems = useCallback(async () => {
    if (!firmId) return;
    setLoadingGmail(true);
    const { data } = await supabase
      .from("ca_document_extractions")
      .select("id, original_filename, gmail_sender_email, gmail_subject, gmail_match_method, gmail_match_confidence, business_id, confidence, review_state, created_at")
      .eq("ca_firm_id", firmId)
      .eq("source_type", "gmail")
      .order("created_at", { ascending: false })
      .limit(100);
    setGmailItems((data ?? []) as unknown as GmailRow[]);
    setLoadingGmail(false);
  }, [firmId]);

  useEffect(() => {
    if (inboxTab === "gmail") void loadGmailItems();
  }, [inboxTab, loadGmailItems]);

  useEffect(() => {
    if (vaultOpen && businessId) void loadVaultFiles();
  }, [vaultOpen, businessId]);

  const assignGmailClient = async (extractionId: string, businessId: string, senderEmail: string | null) => {
    if (!firmId) return;
    setAssignBusy(extractionId);
    const { error } = await supabase
      .from("ca_document_extractions")
      .update({ business_id: businessId, review_state: "needs_review", error_message: null })
      .eq("id", extractionId);
    if (error) {
      toast.error(error.message);
      setAssignBusy(null);
      return;
    }

    if (senderEmail) {
      const { data: userRes } = await supabase.auth.getUser();
      await supabase
        .from("ca_email_sender_mappings")
        .upsert(
          {
            ca_firm_id: firmId,
            business_id: businessId,
            sender_email: senderEmail,
            sender_domain: senderEmail.split("@")[1] ?? null,
            match_method: "manual",
            confidence: 0.95,
            confirmed_by_user_id: userRes?.user?.id ?? null,
            confirmed_at: new Date().toISOString(),
          },
          { onConflict: "ca_firm_id,sender_email" },
        );
      try {
        await supabase.from("ca_brain_events").insert({
          ca_firm_id: firmId,
          business_id: businessId,
          event_type: "gmail_client_mapped",
          payload: { sender_domain: senderEmail.split("@")[1] ?? null, match_method: "manual" },
        });
      } catch { /* fire and forget */ }
    }

    toast.success("Client assigned. Future emails from this sender route here automatically.");
    setAssignBusy(null);
    void loadGmailItems();
  };

  const confirmGmailMatch = async (
    item: GmailRow,
    confirmedBusinessId: string,
    action: "confirm" | "reassign" | "reject",
  ) => {
    if (!firmId) return;
    setVerifyItem(item);
    setVerifyBusy(true);
    try {
      if (action === "reject") {
        const { error } = await supabase
          .from("ca_document_extractions")
          .update({ review_state: "rejected", error_message: "Rejected by CA during Gmail verification." })
          .eq("ca_firm_id", firmId)
          .eq("id", item.id);
        if (error) throw error;
        void supabase.from("ca_brain_events").insert({
          ca_firm_id: firmId,
          business_id: item.business_id,
          event_type: "gmail_match_rejected",
          payload: { sender_email: item.gmail_sender_email, original_match_method: item.gmail_match_method },
        }).then(undefined, () => undefined);
        toast.success("Document rejected and will not be posted.");
      } else {
        const newState = item.confidence >= 0.85 ? "auto_accepted" : "needs_review";
        const { error } = await supabase
          .from("ca_document_extractions")
          .update({ business_id: confirmedBusinessId, review_state: newState, error_message: null })
          .eq("ca_firm_id", firmId)
          .eq("id", item.id);
        if (error) throw error;

        const { data: userRes } = await supabase.auth.getUser();
        const { error: mappingError } = await supabase.from("ca_email_sender_mappings").upsert({
          ca_firm_id: firmId,
          business_id: confirmedBusinessId,
          sender_email: item.gmail_sender_email ?? "",
          sender_domain: item.gmail_sender_email?.split("@")[1] ?? null,
          match_method: "manual",
          confidence: 0.95,
          confirmed_by_user_id: userRes.user?.id ?? null,
          confirmed_at: new Date().toISOString(),
        }, { onConflict: "ca_firm_id,sender_email" });
        if (mappingError) throw mappingError;

        void supabase.from("ca_brain_events").insert({
          ca_firm_id: firmId,
          business_id: confirmedBusinessId,
          event_type: "gmail_client_mapped",
          payload: {
            sender_email: item.gmail_sender_email,
            match_method: "manual",
            original_method: item.gmail_match_method,
            original_confidence: item.gmail_match_confidence,
            action,
          },
        }).then(undefined, () => undefined);
        toast.success(
          newState === "auto_accepted"
            ? "Client confirmed. The extraction is ready for automatic processing."
            : "Client confirmed and moved to the Review Queue for an extraction check.",
        );
      }
      setVerifyItem(null);
      await loadGmailItems();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete verification");
    } finally {
      setVerifyBusy(false);
    }
  };

  const nameFor = (id: string) => clients.find((c) => c.business_id === id)?.client_name ?? "Unknown client";

  const handleFileList = async (files: FileList) => {
    if (!firmId) return;
    if (!businessId) {
      toast.error("Please select a client before uploading", { duration: 5000 });
      flashClientSelect();
      return;
    }
    setBusy(true);
    const UPLOAD_TIMEOUT_MS = 30000;
    for (const file of Array.from(files)) {
      const cls = classification === "auto" ? guessClassification(file.name) : classification;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Upload timed out after 30 seconds. Check your connection and try again.")),
          UPLOAD_TIMEOUT_MS,
        );
      });
      let res: Awaited<ReturnType<typeof intakeDocument>>;
      try {
        res = await Promise.race([
          intakeDocument({
            file,
            firmId,
            businessId,
            clientId: clients.find((c) => c.business_id === businessId)?.id ?? null,
            clientReferenceCode: businessId.slice(0, 8).toUpperCase(),
            period: period || null,
            classification: cls,
          }),
          timeoutPromise,
        ]);
      } catch (err) {
        console.error("[fyn:intake] upload failed for", file.name, err);
        res = { ok: false, error: cleanErrorMessage(err) };
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) {
        const clean = cleanErrorMessage(new Error(res.error ?? "Upload failed"));
        console.error("[fyn:intake] upload rejected for", file.name, res.error);
        toast.error(`Upload failed for ${file.name}: ${clean || "An unexpected error occurred"}`, { duration: 8000 });
      } else if (res.reviewState === "auto_accepted") {
        toast.success(`${file.name}: ${res.rowCount} rows extracted, high confidence`);
      } else if (res.reviewState === "failed") {
        toast.warning(`${file.name}: needs manual classification — check browser console for details`, { duration: 8000 });
      } else {
        toast.info(`${file.name}: sent to review queue`);
      }

      setUploadLog((prev) => [...prev, {
        filename: file.name,
        status: !res.ok ? "error" : res.reviewState === "auto_accepted" ? "ok" : "review",
        message: !res.ok
          ? (cleanErrorMessage(new Error(res.error ?? "")) || "An unexpected error occurred")
          : res.reviewState === "auto_accepted"
          ? `${res.rowCount ?? 0} rows extracted with high confidence`
          : "Sent to review queue — confidence below threshold",
      }]);
    }
    setBusy(false);
    void load();
  };

  const loadVaultFiles = async () => {
    if (!firmId || !businessId) return;
    setVaultLoading(true);
    const { data, error } = await supabase.storage
      .from("ca-client-documents")
      .list(`${firmId}/${businessId}`, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    if (!error && data) {
      setVaultFiles(data.filter((f) => f.name !== ".emptyFolderPlaceholder").map((f) => ({
        name: f.name,
        path: `${firmId}/${businessId}/${f.name}`,
        created_at: f.created_at ?? "",
      })));
    }
    setVaultLoading(false);
  };

  const handleReclassify = async (rowId: string, newClass: CADocClass) => {
    const { error } = await supabase
      .from("ca_document_extractions")
      .update({ classification: newClass, review_state: "needs_review", error_message: null })
      .eq("id", rowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reclassified and routed to review queue");
    void load();
  };

  const handleView = async (rowId: string) => {
    setViewBusy(rowId);
    const { data: rec } = await supabase
      .from("ca_document_extractions")
      .select("storage_path")
      .eq("id", rowId)
      .maybeSingle();
    const path = (rec as { storage_path: string | null } | null)?.storage_path ?? null;
    if (!path) {
      toast.error("No file stored for this extraction");
      setViewBusy(null);
      return;
    }
    const { data } = await supabase.storage.from("ca-client-documents").createSignedUrl(path, 300);
    setViewBusy(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("Could not generate view link");
  };

  if (roleLoading) return null;
  if (!can("upload")) {
    return (
      <div>
        <ModuleHeader title="Intake inbox" subtitle="Documents collected from clients." />
        <PermissionNotice permission="upload" />
      </div>
    );
  }

  const needsReview = rows.filter((r) => r.review_state === "needs_review").length;
  const posted = rows.filter((r) => r.review_state === "posted").length;
  const pendingVerification = gmailItems.filter((item) => item.review_state === "pending_verification");
  const otherGmailItems = gmailItems.filter((item) => item.review_state !== "pending_verification");

  return (
    <div>
      <ModuleHeader
        title="Intake inbox"
        subtitle="Drop a photo, PDF, CSV or Tally XML. It is stored against the client, read, classified, scored for confidence, and routed to review or straight through."
      />

      <StatStrip
        items={[
          { label: "Documents", value: String(rows.length) },
          { label: "Awaiting review", value: String(needsReview) },
          { label: "Posted", value: String(posted) },
        ]}
      />

      <div style={{ display: "flex", marginBottom: 16, borderBottom: `0.5px solid ${CA.line}` }}>
        {(["upload", "gmail"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setInboxTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: inboxTab === tab ? `2px solid ${CA.teal}` : "2px solid transparent",
              padding: "10px 18px",
              fontFamily: CA.sans,
              fontSize: 13,
              fontWeight: inboxTab === tab ? 700 : 400,
              color: inboxTab === tab ? CA.ink : CA.muted,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {tab === "upload" ? "Upload" : "From Gmail"}
          </button>
        ))}
      </div>

      {inboxTab === "gmail" ? (
        <CACard style={{ padding: 20 }}>
          {loadingGmail ? (
            <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.faint, padding: 20 }}>Loading Gmail documents…</div>
          ) : gmailItems.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", border: `2px dashed ${CA.line}`, borderRadius: 14 }}>
              <div style={{ fontFamily: CA.serif, fontSize: 17, fontWeight: 700, color: CA.ink, marginBottom: 8 }}>No Gmail documents yet</div>
              <p style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted, maxWidth: 420, margin: "0 auto" }}>
                Connect your Gmail on the Integrations page. Attachments your clients email you appear here on their own, every 15 minutes.
              </p>
              <CAButton onClick={() => navigate("/ca/integrations")} style={{ marginTop: 16 }}>
                Go to Integrations
              </CAButton>
            </div>
          ) : (
            <>
            {pendingVerification.length > 0 && (
              <div style={{ background: "rgba(139,105,20,0.06)", border: "1px solid rgba(139,105,20,0.22)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: CA.gold }} />
                  <div style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 700, color: CA.gold }}>
                    {pendingVerification.length} document{pendingVerification.length > 1 ? "s" : ""} need confirmation before posting
                  </div>
                </div>
                <p style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted, marginBottom: 12, lineHeight: 1.55 }}>
                  Confirm the correct client before these documents can post to a ledger. The confirmed sender mapping is remembered for future emails.
                </p>
                {pendingVerification.map((item) => {
                  const suggestedClient = clients.find((client) => client.business_id === item.business_id);
                  return (
                    <div key={item.id} style={{ background: CA.card, border: `1px solid ${CA.line}`, borderRadius: 10, padding: "14px 16px", marginBottom: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 12 }}>
                        {[
                          ["From", item.gmail_sender_email ?? "Not available"],
                          ["Subject", item.gmail_subject ?? "Not available"],
                          ["File", item.original_filename ?? "Not available"],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div style={{ fontFamily: CA.sans, fontSize: 11, color: CA.faint, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontFamily: label === "From" ? CA.mono : CA.sans, fontSize: 12.5, color: CA.ink, fontWeight: label === "File" ? 600 : 400 }}>{value}</div>
                          </div>
                        ))}
                        <div>
                          <div style={{ fontFamily: CA.sans, fontSize: 11, color: CA.faint, marginBottom: 2 }}>System suggested</div>
                          <div style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.gold, fontWeight: 600 }}>
                            {suggestedClient?.client_name ?? "No suggestion"}
                            <span style={{ fontWeight: 400, color: CA.faint, fontSize: 11, marginLeft: 6 }}>
                              {Math.round((item.gmail_match_confidence ?? 0) * 100)} percent confidence via {item.gmail_match_method ?? "matching"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ fontFamily: CA.sans, fontSize: 11.5, color: CA.muted, marginBottom: 10, padding: "8px 10px", background: "rgba(139,105,20,0.05)", borderRadius: 6, borderLeft: `3px solid ${CA.gold}` }}>
                        This document has not been posted to any ledger. Confirm the client before it is processed.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <select defaultValue={item.business_id ?? ""} id={`verify-client-${item.id}`} style={{ ...caInputStyle, flex: 1, minWidth: 200 }}>
                          <option value="">Select the correct client</option>
                          {clients.map((client) => <option key={client.business_id} value={client.business_id}>{client.client_name}</option>)}
                        </select>
                        <CAButton
                          disabled={verifyBusy}
                          onClick={async () => {
                            const selected = document.getElementById(`verify-client-${item.id}`);
                            const selectedBusinessId = selected instanceof HTMLSelectElement ? selected.value : "";
                            if (!selectedBusinessId) return toast.error("Select a client before confirming");
                            await confirmGmailMatch(item, selectedBusinessId, selectedBusinessId === item.business_id ? "confirm" : "reassign");
                          }}
                        >
                          {verifyBusy && verifyItem?.id === item.id ? "Processing" : "Confirm and process"}
                        </CAButton>
                        <CAButton variant="danger" disabled={verifyBusy} onClick={() => void confirmGmailMatch(item, "", "reject")}>
                          Reject as non-client document
                        </CAButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {otherGmailItems.length > 0 && <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={caTh}>Received</th>
                  <th style={caTh}>From</th>
                  <th style={caTh}>Subject</th>
                  <th style={caTh}>File</th>
                  <th style={caTh}>Matched client</th>
                  <th style={caTh}>Confidence</th>
                  <th style={caTh}>State</th>
                  <th style={caTh}>Action</th>
                </tr></thead>
                <tbody>
                  {otherGmailItems.map((item) => {
                    const conf = Number(item.gmail_match_confidence ?? 0);
                    const confColor = conf >= 0.75 ? CA.green : conf >= 0.5 ? CA.gold : CA.red;
                    return (
                      <tr key={item.id}>
                        <td style={caTd}>{dateIN(item.created_at)}</td>
                        <td style={{ ...caTd, fontFamily: CA.mono, fontSize: 12 }}>{item.gmail_sender_email ?? "—"}</td>
                        <td style={caTd}>{item.gmail_subject ?? "—"}</td>
                        <td style={caTd}>{item.original_filename ?? "—"}</td>
                        <td style={caTd}>
                          {item.business_id ? (
                            <span style={{ fontWeight: 600 }}>{nameFor(item.business_id)}</span>
                          ) : (
                            <select
                              defaultValue=""
                              disabled={assignBusy === item.id}
                              onChange={(e) => {
                                if (e.target.value) void assignGmailClient(item.id, e.target.value, item.gmail_sender_email);
                              }}
                              style={{ ...caInputStyle, height: 30, fontSize: 12, padding: "0 8px", width: "auto" }}
                            >
                              <option value="">Assign client…</option>
                              {clients.map((c) => (
                                <option key={c.business_id} value={c.business_id}>{c.client_name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={caTd}>
                          <span style={{ fontFamily: CA.mono, fontSize: 12, color: confColor, fontWeight: 600 }}>
                            {conf >= 0.75 ? "Auto matched" : conf >= 0.5 ? `${Math.round(conf * 100)} percent, confirm` : "Unmatched"}
                          </span>
                        </td>
                        <td style={caTd}>
                          <CABadge tone={item.review_state === "posted" ? "green" : item.review_state === "needs_review" ? "amber" : "grey"}>
                            {item.review_state.replace(/_/g, " ")}
                          </CABadge>
                        </td>
                        <td style={caTd}>
                          {item.review_state === "needs_review" && item.business_id && (
                            <CAButton variant="ghost" onClick={() => navigate("/ca/intake/review")} style={{ fontSize: 12, padding: "4px 10px" }}>
                              Review
                            </CAButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
            </>
          )}
          <div style={{ marginTop: 14 }}>
            <CAButton variant="ghost" onClick={() => void loadGmailItems()}>Refresh</CAButton>
          </div>
        </CACard>
      ) : (
      <>
      <CACard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
          <select id="client-select-dropdown" style={caInputStyle} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <select style={caInputStyle} value={classification} onChange={(e) => setClassification(e.target.value as CADocClass | "auto")}>
            <option value="auto">Classify automatically</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {DOC_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
          <input style={caInputStyle} placeholder="Period e.g. 2026-07" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <UploadZone busy={busy} businessId={businessId} onFiles={handleFileList} />
        {uploadLog.length > 0 && (
          <div style={{ marginTop: 12, marginBottom: 4 }}>
            {uploadLog.map((entry, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 12px",
                marginBottom: 6,
                borderRadius: 8,
                background: entry.status === "error" ? "rgba(169,56,56,0.06)" : entry.status === "ok" ? "rgba(31,90,70,0.06)" : "rgba(139,105,20,0.06)",
                border: `1px solid ${entry.status === "error" ? "rgba(169,56,56,0.18)" : entry.status === "ok" ? "rgba(31,90,70,0.15)" : "rgba(139,105,20,0.15)"}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: entry.status === "error" ? CA.red : entry.status === "ok" ? CA.green : CA.gold, flexShrink: 0 }}>
                  {entry.status === "error" ? "Error" : entry.status === "ok" ? "Posted" : "Review"}
                </span>
                <div>
                  <div style={{ fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, color: CA.ink }}>{entry.filename}</div>
                  <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.muted, marginTop: 2 }}>{entry.message}</div>
                </div>
              </div>
            ))}
            <button
              onClick={() => setUploadLog([])}
              style={{ background: "none", border: "none", fontFamily: CA.sans, fontSize: 12, color: CA.faint, cursor: "pointer", padding: 0, marginTop: 4 }}
            >
              Clear log
            </button>
          </div>
        )}
      </CACard>

      {businessId && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setVaultOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              fontFamily: CA.sans,
              fontSize: 13,
              color: CA.teal,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 0",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M9 21V9"/>
            </svg>
            {vaultOpen ? "Hide vault" : "Or pick from vault — previously uploaded files for this client"}
          </button>
          {vaultOpen && (
            <div style={{ background: CA.card, border: `1px solid ${CA.line}`, borderRadius: 12, padding: 16, marginTop: 8 }}>
              {vaultLoading ? (
                <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.faint }}>Loading vault files…</div>
              ) : vaultFiles.length === 0 ? (
                <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.faint }}>No files in vault for this client yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={caTh}>Filename</th>
                      <th style={caTh}>Uploaded</th>
                      <th style={caTh}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultFiles.map((f) => (
                      <tr key={f.path}>
                        <td style={caTd}>
                          <span style={{ fontFamily: CA.sans, fontSize: 13, fontWeight: 600, color: CA.ink }}>{f.name}</span>
                        </td>
                        <td style={caTd}>
                          <span style={{ fontFamily: CA.sans, fontSize: 12.5, color: CA.muted }}>
                            {f.created_at ? new Date(f.created_at).toLocaleDateString("en-IN") : "—"}
                          </span>
                        </td>
                        <td style={caTd}>
                          <button
                            onClick={async () => {
                              const { data } = await supabase.storage.from("ca-client-documents").createSignedUrl(f.path, 300);
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
                              else toast.error("Could not open file");
                            }}
                            style={{ background: "none", border: "none", color: CA.teal, fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 12 }}>
                <CAButton variant="ghost" onClick={loadVaultFiles} style={{ fontSize: 12 }}>Refresh vault</CAButton>
              </div>
            </div>
          )}
        </div>
      )}

      <CACard style={{ padding: 20 }}>
        {rows.length === 0 ? (
          <div style={{
            padding: "32px 24px", textAlign: "center",
            border: "2px dashed rgba(169,56,56,0.20)", borderRadius: 14,
            background: "rgba(169,56,56,0.02)",
          }}>
            <div style={{ fontFamily: CA.serif, fontSize: 18, fontWeight: 700, color: CA.ink, marginBottom: 8 }}>
              Upload your first document
            </div>
            <p style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, lineHeight: 1.65, maxWidth: 440, margin: "0 auto 20px" }}>
              Upload a bank statement in CSV or PDF, an invoice, or an expense bill for this client. The system reads it automatically. High confidence extractions post to the ledger immediately. Low confidence items come to the Review queue for a quick check.
            </p>
            <div style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint }}>
              Supported formats: HDFC, ICICI, SBI, Axis and Kotak bank CSVs, Tally XML, generic CSV, PDF invoices and bills
            </div>
          </div>
        ) : (
          <QueueTable
            columns={["Received", "Client", "Document", "Class", "Confidence", "State", "", ""]}
            empty="No documents yet"
            emptyHint="Upload a file above, or raise a request so the client can send it themselves."
            rows={rows.map((r) => [
              dateIN(r.created_at),
              nameFor(r.business_id),
              <div key="f">
                <div style={{ fontWeight: 600 }}>{r.original_filename ?? "—"}</div>
                {r.error_message && <div style={{ fontSize: 11.5, color: CA.red }}>{r.error_message}</div>}
              </div>,
              DOC_CLASS_LABELS[r.classification as CADocClass] ?? r.classification,
              <ConfidenceChip key="c" value={r.confidence} />,
              <StateChip key="s" value={r.review_state} />,
              <button
                key="v"
                onClick={() => void handleView(r.id)}
                disabled={viewBusy === r.id}
                style={{ background: "none", border: "none", padding: 0, color: CA.teal, fontFamily: CA.sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                {viewBusy === r.id ? "…" : "View"}
              </button>,
              r.review_state === "needs_review" || r.review_state === "failed" ? (
                <div key="rc" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={reclassify[r.id] ?? r.classification}
                    onChange={(e) => setReclassify((prev) => ({ ...prev, [r.id]: e.target.value as CADocClass }))}
                    style={{ ...caInputStyle, padding: "3px 8px", height: 28, fontSize: 12 }}
                  >
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {DOC_CLASS_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => void handleReclassify(r.id, reclassify[r.id] ?? (r.classification as CADocClass))}
                    style={{ background: "#A93838", color: "#F7F1E6", border: "none", borderRadius: 6, padding: "3px 10px", fontFamily: CA.sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Re-route
                  </button>
                </div>
              ) : (
                <span key="rc" />
              ),
            ])}
          />
        )}
      </CACard>

      <div style={{ marginTop: 14 }}>
        <CAButton variant="ghost" onClick={() => void load()}>
          Refresh
        </CAButton>
      </div>
      </>
      )}
    </div>
  );
}
