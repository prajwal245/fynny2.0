import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Status = "pending" | "approved" | "rejected";

type CAFirm = {
  id: string;
  firm_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  icai_membership_number: string | null;
  icai_membership_type: string | null;
  years_of_practice: number | null;
  verification_status: Status | string | null;
  verification_submitted_at: string | null;
  verification_rejected_reason: string | null;
  onboarding_step: number | null;
  created_at: string | null;
};

const caName = (r: { firm_name: string | null; email: string | null }) =>
  r.firm_name ?? r.email ?? "—";

type VDoc = {
  id: string;
  document_type: string | null;
  original_filename: string | null;
  uploaded_at: string | null;
  storage_path?: string | null;
  file_path?: string | null;
};

const INK = "#171208";
const BEIGE = "#F4EDDA";
const RED = "#C41E1E";
const GOLD = "#8B6914";
const GREEN = "#1F5A46";
const AMBER = "#B45309";
const CARD_BORDER = "1px solid rgba(23,18,8,0.08)";

const fontHead = "Georgia, serif";
const fontBody = "Inter, sans-serif";
const fontMono = "'JetBrains Mono', ui-monospace, monospace";

function fmtDate(v: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function CAVerificationPage() {
  const [tab, setTab] = useState<Status>("pending");
  const [rows, setRows] = useState<CAFirm[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [rejectFirm, setRejectFirm] = useState<CAFirm | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [docsFirm, setDocsFirm] = useState<CAFirm | null>(null);
  const [docs, setDocs] = useState<VDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ca_firms")
      .select("id, firm_name, email, phone, city, state, icai_membership_number, icai_membership_type, years_of_practice, verification_status, verification_submitted_at, verification_rejected_reason, onboarding_step, created_at")
      .order("verification_submitted_at", { ascending: false });
    if (error) {
      toast.error("Failed to load CA firms: " + error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as CAFirm[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const g: Record<Status, CAFirm[]> = { pending: [], approved: [], rejected: [] };
    for (const r of rows) {
      const s = (r.verification_status ?? "pending") as Status;
      if (s === "approved" || s === "rejected") g[s].push(r);
      else g.pending.push(r);
    }
    return g;
  }, [rows]);

  const approve = async (id: string) => {
    setBusyId(id);
    const firm = rows.find((r) => r.id === id);
    const { error } = await supabase
      .from("ca_firms")
      .update({ verification_status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("Approve failed: " + error.message); setBusyId(null); return; }
    const { error: fnErr } = await supabase.functions.invoke("send-ca-notification", {
      body: { ca_firm_id: id, type: "approved" },
    });
    if (fnErr) toast.warning("Approved, but email failed: " + fnErr.message);
    else toast.success(`Approved ${firm?.firm_name ?? "CA firm"}. Notification email sent.`);
    setConfirmApproveId(null);
    setBusyId(null);
    load();
  };

  const reject = async () => {
    if (!rejectFirm) return;
    if (rejectReason.trim().length < 20) { toast.error("Reason must be at least 20 characters."); return; }
    setBusyId(rejectFirm.id);
    const { error } = await supabase
      .from("ca_firms")
      .update({
        verification_status: "rejected",
        verification_rejected_reason: rejectReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rejectFirm.id);
    if (error) { toast.error("Reject failed: " + error.message); setBusyId(null); return; }
    const { error: fnErr } = await supabase.functions.invoke("send-ca-notification", {
      body: { ca_firm_id: rejectFirm.id, type: "rejected", reason: rejectReason.trim() },
    });
    if (fnErr) toast.warning("Rejected, but email failed: " + fnErr.message);
    else toast.success(`Rejected ${rejectFirm.firm_name ?? "CA firm"}. Notification email sent.`);
    setRejectFirm(null);
    setRejectReason("");
    setBusyId(null);
    load();
  };

  const reinstate = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase
      .from("ca_firms")
      .update({ verification_status: "pending", verification_rejected_reason: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (error) { toast.error("Reinstate failed: " + error.message); return; }
    toast.success("Moved back to pending.");
    load();
  };

  const openDocs = async (firm: CAFirm) => {
    setDocsFirm(firm);
    setDocs([]);
    setDocsLoading(true);
    const { data, error } = await supabase
      .from("ca_verification_documents")
      .select("*")
      .eq("ca_firm_id", firm.id);
    setDocsLoading(false);
    if (error) { toast.error("Failed to load documents: " + error.message); return; }
    setDocs((data ?? []) as VDoc[]);
  };

  const downloadDoc = async (d: VDoc) => {
    const path = d.storage_path || d.file_path;
    if (!path) { toast.error("No storage path for this document."); return; }
    const { data, error } = await supabase.storage
      .from("ca-verification-documents")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { toast.error("Signed URL failed."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const list = grouped[tab];

  return (
    <div style={{ background: BEIGE, minHeight: "100%", padding: 0 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: fontHead, fontSize: 28, color: INK, margin: 0 }}>CA Verification</h1>
        <p style={{ fontFamily: fontBody, fontSize: 14, color: "rgba(23,18,8,0.6)", marginTop: 6 }}>
          Review CA firm applications and approve or reject with email notification.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 32, borderBottom: "1px solid rgba(23,18,8,0.1)", marginBottom: 20 }}>
        {(["pending", "approved", "rejected"] as Status[]).map((t) => {
          const active = tab === t;
          const badgeBg = t === "pending" ? RED : t === "approved" ? GREEN : AMBER;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: fontBody, fontSize: 14, fontWeight: active ? 600 : 500,
                color: active ? INK : "rgba(23,18,8,0.55)",
                padding: "12px 2px",
                borderBottom: active ? `2px solid ${RED}` : "2px solid transparent",
                display: "flex", alignItems: "center", gap: 8, textTransform: "capitalize",
              }}
            >
              {t}
              <span style={{
                background: badgeBg, color: "#fff", fontFamily: fontMono, fontSize: 11,
                padding: "2px 8px", borderRadius: 999, minWidth: 22, textAlign: "center",
              }}>{grouped[t].length}</span>
            </button>
          );
        })}
      </div>

      {/* Card */}
      <div style={{ background: "#fff", border: CARD_BORDER, borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: fontBody, color: "rgba(23,18,8,0.6)" }}>
            Loading…
          </div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: fontBody, color: "rgba(23,18,8,0.55)" }}>
            No {tab} applications.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(23,18,8,0.03)" }}>
                {tab === "pending" && (
                  <>
                    <Th>Firm / CA</Th><Th>ICAI</Th><Th>Location</Th>
                    <Th>Submitted</Th><Th>Documents</Th><Th style={{ textAlign: "right" }}>Actions</Th>
                  </>
                )}
                {tab === "approved" && (<><Th>Firm</Th><Th>CA name</Th><Th>ICAI</Th><Th>Approved</Th><Th></Th></>)}
                {tab === "rejected" && (<><Th>Firm</Th><Th>CA name</Th><Th>Rejected</Th><Th>Reason</Th><Th></Th></>)}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(23,18,8,0.06)" }}>
                  {tab === "pending" && (
                    <>
                      <Td>
                        <div style={{ fontFamily: fontBody, fontWeight: 600, color: INK }}>{r.firm_name ?? "—"}</div>
                        <div style={{ fontFamily: fontBody, fontSize: 12, color: "rgba(23,18,8,0.6)" }}>{caName(r)} · {r.email ?? ""}</div>
                      </Td>
                      <Td>
                        <div style={{ fontFamily: fontMono, fontSize: 13, color: INK }}>{r.icai_membership_number ?? "—"}</div>
                        <div style={{ fontFamily: fontBody, fontSize: 12, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.icai_membership_type ?? ""}</div>
                      </Td>
                      <Td>
                        <div style={{ fontFamily: fontBody, fontSize: 13, color: INK }}>{[r.city, r.state].filter(Boolean).join(", ") || "—"}</div>
                        <div style={{ fontFamily: fontBody, fontSize: 12, color: "rgba(23,18,8,0.55)" }}>{r.years_of_practice ? `${r.years_of_practice} yrs practice` : ""}</div>
                      </Td>
                      <Td><span style={{ fontFamily: fontMono, fontSize: 12 }}>{fmtDate(r.verification_submitted_at ?? r.created_at)}</span></Td>
                      <Td>
                        <SecondaryBtn onClick={() => openDocs(r)}>View</SecondaryBtn>
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        {confirmApproveId === r.id ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontFamily: fontBody, fontSize: 12, color: "rgba(23,18,8,0.7)" }}>
                              Approve {r.firm_name}?
                            </span>
                            <PrimaryBtn bg={GREEN} disabled={busyId === r.id} onClick={() => approve(r.id)}>Confirm</PrimaryBtn>
                            <SecondaryBtn onClick={() => setConfirmApproveId(null)}>Cancel</SecondaryBtn>
                          </div>
                        ) : (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <PrimaryBtn bg={GREEN} onClick={() => setConfirmApproveId(r.id)}>Approve</PrimaryBtn>
                            <PrimaryBtn bg={RED} onClick={() => { setRejectFirm(r); setRejectReason(""); }}>Reject</PrimaryBtn>
                          </div>
                        )}
                      </Td>
                    </>
                  )}
                  {tab === "approved" && (
                    <>
                      <Td><span style={{ fontFamily: fontBody, fontWeight: 600, color: INK }}>{r.firm_name ?? "—"}</span></Td>
                      <Td>{caName(r)}</Td>
                      <Td><span style={{ fontFamily: fontMono, fontSize: 13 }}>{r.icai_membership_number ?? "—"}</span></Td>
                      <Td><span style={{ fontFamily: fontMono, fontSize: 12 }}>{fmtDate(r.verification_submitted_at)}</span></Td>
                      <Td style={{ textAlign: "right" }}>
                        <SecondaryBtn onClick={() => openDocs(r)}>View</SecondaryBtn>
                      </Td>
                    </>
                  )}
                  {tab === "rejected" && (
                    <>
                      <Td><span style={{ fontFamily: fontBody, fontWeight: 600, color: INK }}>{r.firm_name ?? "—"}</span></Td>
                      <Td>{caName(r)}</Td>
                      <Td><span style={{ fontFamily: fontMono, fontSize: 12 }}>{fmtDate(r.verification_submitted_at)}</span></Td>
                      <Td>
                        <div style={{ maxWidth: 320, fontFamily: fontBody, fontSize: 12, color: "rgba(23,18,8,0.7)" }}>
                          {r.verification_rejected_reason ?? "—"}
                        </div>
                      </Td>
                      <Td style={{ textAlign: "right" }}>
                        <SecondaryBtn disabled={busyId === r.id} onClick={() => reinstate(r.id)}>Reinstate</SecondaryBtn>
                      </Td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject modal */}
      {rejectFirm && (
        <Modal onClose={() => { setRejectFirm(null); setRejectReason(""); }} title={`Reject ${rejectFirm.firm_name ?? "CA firm"}`}>
          <label style={{ display: "block", fontFamily: fontBody, fontSize: 12, fontWeight: 600, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Rejection reason (will be sent to the CA)
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={5}
            minLength={20}
            placeholder="Explain why this application cannot be approved. Minimum 20 characters."
            style={{
              width: "100%", fontFamily: fontBody, fontSize: 14, color: INK,
              border: "1px solid rgba(23,18,8,0.15)", borderRadius: 8, padding: 12, resize: "vertical",
            }}
          />
          <div style={{ fontFamily: fontBody, fontSize: 11, color: "rgba(23,18,8,0.5)", marginTop: 4 }}>
            {rejectReason.trim().length}/20 minimum
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <SecondaryBtn onClick={() => { setRejectFirm(null); setRejectReason(""); }}>Cancel</SecondaryBtn>
            <PrimaryBtn bg={RED} disabled={busyId === rejectFirm.id || rejectReason.trim().length < 20} onClick={reject}>
              Send rejection
            </PrimaryBtn>
          </div>
        </Modal>
      )}

      {/* Docs modal */}
      {docsFirm && (
        <Modal onClose={() => { setDocsFirm(null); setDocs([]); }} title={`Documents — ${docsFirm.firm_name ?? "CA firm"}`}>
          {docsLoading ? (
            <div style={{ fontFamily: fontBody, color: "rgba(23,18,8,0.6)" }}>Loading…</div>
          ) : docs.length === 0 ? (
            <div style={{ fontFamily: fontBody, color: "rgba(23,18,8,0.6)" }}>No documents uploaded.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {docs.map((d) => (
                <div key={d.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: 12, border: "1px solid rgba(23,18,8,0.08)", borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {d.document_type ?? "document"}
                    </div>
                    <div style={{ fontFamily: fontBody, fontSize: 14, color: INK }}>{d.original_filename ?? "—"}</div>
                    <div style={{ fontFamily: fontMono, fontSize: 11, color: "rgba(23,18,8,0.5)" }}>{fmtDate(d.uploaded_at)}</div>
                  </div>
                  <SecondaryBtn onClick={() => downloadDoc(d)}>Download</SecondaryBtn>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th style={{
      textAlign: "left", padding: "12px 16px",
      fontFamily: fontBody, fontSize: 11, fontWeight: 600,
      color: GOLD, textTransform: "uppercase", letterSpacing: 0.5,
      ...style,
    }}>{children}</th>
  );
}
function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "14px 16px", fontFamily: fontBody, fontSize: 13, color: INK, verticalAlign: "top", ...style }}>{children}</td>;
}

function PrimaryBtn({ children, onClick, bg, disabled }: { children: React.ReactNode; onClick?: () => void; bg: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, color: "#fff", border: "none",
      padding: "8px 14px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: fontBody, fontSize: 13, fontWeight: 600, opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}
function SecondaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: "#fff", color: INK, border: "1px solid rgba(23,18,8,0.15)",
      padding: "8px 14px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: fontBody, fontSize: 13, fontWeight: 500, opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(23,18,8,0.55)",
      zIndex: 100, display: "grid", placeItems: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, border: CARD_BORDER,
        width: "100%", maxWidth: 560, padding: 24, maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: fontHead, fontSize: 20, color: INK }}>{title}</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: INK }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
