import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, PauseCircle, RotateCcw, Loader2, RefreshCw,
  Clock, X, Search, AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Firm = {
  id: string;
  firm_name: string | null;
  ca_name: string | null;
  icai_membership_number: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  verification_status: string | null;
  verification_submitted_at: string | null;
  verification_reviewed_at: string | null;
  verification_rejected_reason: string | null;
  created_at: string | null;
};

type AuditEntry = {
  id: string;
  ca_firm_id: string;
  reviewed_by_email: string;
  action: string;
  reason: string | null;
  created_at: string;
};

type ActionKey = "approve" | "reject" | "suspend" | "reactivate";

type TabKey = "pending" | "approved" | "rejected";
const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const TEAL = "#A93838";
const INK = "#171208";
const BORDER = "rgba(26,26,26,0.10)";
const PAGE_SIZE = 10;

const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FDF3DC", fg: "#8A6100", label: "Pending" },
  approved: { bg: "rgba(169,56,56,0.10)", fg: "#A93838", label: "Approved" },
  rejected: { bg: "#FCE8E8", fg: "#A93838", label: "Rejected" },
};

const LOG_BADGE: Record<string, { bg: string; fg: string }> = {
  approved: { bg: "rgba(169,56,56,0.10)", fg: "#A93838" },
  approve: { bg: "rgba(169,56,56,0.10)", fg: "#A93838" },
  rejected: { bg: "#FCE8E8", fg: "#A93838" },
  reject: { bg: "#FCE8E8", fg: "#A93838" },
  suspended: { bg: "#FDF3DC", fg: "#8A6100" },
  suspend: { bg: "#FDF3DC", fg: "#8A6100" },
  reactivated: { bg: "rgba(169,56,56,0.10)", fg: "#A93838" },
  reactivate: { bg: "rgba(169,56,56,0.10)", fg: "#A93838" },
};

const ACTION_COLOR: Record<ActionKey, string> = {
  approve: TEAL,
  reject: "#A93838",
  suspend: "#B8860B",
  reactivate: TEAL,
};

const ACTION_VERB: Record<ActionKey, string> = {
  approve: "approve",
  reject: "reject",
  suspend: "suspend",
  reactivate: "reactivate",
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "—";

const isExpiredSession = (error: unknown, data: unknown) => {
  const status = (error as { status?: number; context?: { status?: number } } | null)?.status
    ?? (error as { context?: { status?: number } } | null)?.context?.status;
  const msg = String((error as { message?: string } | null)?.message ?? (data as { error?: string } | null)?.error ?? "");
  return status === 401 || /jwt|unauthor/i.test(msg);
};

async function handleExpiredSession() {
  toast.error("Your session has expired. Please sign in again.");
  await supabase.auth.signOut();
  window.location.assign("/");
}

export default function CAApprovalsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("pending");
  const [reasonFor, setReasonFor] = useState<{ id: string; action: "reject" | "suspend" } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Feature 1
  const [confirmModal, setConfirmModal] = useState<{ firm: Firm; action: ActionKey; reason: string } | null>(null);
  // Feature 2
  const [drawerFirm, setDrawerFirm] = useState<Firm | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  // Feature 3
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Feature 4
  const [emailResults, setEmailResults] = useState<
    Map<string, { sent: boolean; error: string | null; action: string; timestamp: string }>
  >(new Map());

  const load = useCallback(async (announce = true) => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("ca-admin-review", { body: { op: "list" } });
    setLoading(false);
    if (isExpiredSession(error, data)) { await handleExpiredSession(); return; }
    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? "Could not load CA firms");
      setFirms([]);
      return;
    }
    const rows: Firm[] = data.firms ?? [];
    setFirms(rows);
    if (announce) {
      const count = (s: TabKey) => rows.filter((f) => (f.verification_status ?? "pending") === s).length;
      // Verification: confirms DB reads are working.
      console.log("[CA Approvals] pending:", count("pending"), "approved:", count("approved"), "rejected:", count("rejected"));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const g: Record<TabKey, Firm[]> = { pending: [], approved: [], rejected: [] };
    for (const f of firms) {
      const s = (f.verification_status ?? "pending") as TabKey;
      if (g[s]) g[s].push(f);
    }
    return g;
  }, [firms]);

  const run = async (firm: Firm, action: ActionKey) => {
    if ((action === "reject" || action === "suspend") && !reason.trim()) {
      setReasonError("A reason is required.");
      return;
    }
    setBusyId(firm.id);
    const { data, error } = await supabase.functions.invoke("ca-admin-review", {
      body: { op: "review", firm_id: firm.id, action, reason: reason.trim() || undefined },
    });
    setBusyId(null);
    if (isExpiredSession(error, data)) { await handleExpiredSession(); return; }
    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? "Action failed");
      return;
    }
    setReasonFor(null);
    setReason("");
    setReasonError("");
    const name = firm.firm_name ?? "Firm";
    const verb =
      action === "approve" ? "approved"
      : action === "reject" ? "rejected"
      : action === "suspend" ? "suspended"
      : "reactivated";
    setEmailResults((prev) => {
      const next = new Map(prev);
      next.set(firm.id, {
        sent: !!data.email_sent,
        error: data.email_error ?? null,
        action: verb,
        timestamp: new Date().toISOString(),
      });
      return next;
    });
    toast.success(
      data.email_sent
        ? `${name} ${verb}. Notification email sent to ${firm.email}`
        : `${name} ${verb}. Email not sent${data.email_error ? `: ${data.email_error}` : ""}`,
    );
    await load(false);
  };

  const openHistory = async (firm: Firm) => {
    setDrawerFirm(firm);
    setAuditLog([]);
    setAuditLoading(true);
    const { data, error } = await supabase.functions.invoke("ca-admin-review", {
      body: { op: "audit", firm_id: firm.id },
    });
    setAuditLoading(false);
    if (isExpiredSession(error, data)) { await handleExpiredSession(); return; }
    if (error || !data?.success) {
      toast.error(data?.error ?? error?.message ?? "Could not load audit history");
      return;
    }
    setAuditLog(data.log ?? []);
  };

  const closeConfirm = () => {
    setConfirmModal(null);
    setReasonFor(null);
    setReason("");
    setReasonError("");
  };

  const askConfirm = (firm: Firm, action: ActionKey) => {
    if ((action === "reject" || action === "suspend") && !reason.trim()) {
      setReasonError("A reason is required.");
      return;
    }
    setConfirmModal({ firm, action, reason: reason.trim() });
  };

  const btn = (bg: string): React.CSSProperties => ({
    background: bg, color: "#fff", border: "none", borderRadius: 9,
    padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'Instrument Sans', Inter, sans-serif",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = grouped[tab];
    if (!q) return src;
    return src.filter((f) =>
      [f.firm_name, f.ca_name, f.email, f.icai_membership_number]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [grouped, tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const list = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [tab, search]);

  return (
    <div style={{ fontFamily: "'Instrument Sans', Inter, sans-serif", color: INK }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, color: INK, margin: 0 }}>
            CA Approvals
          </h1>
          <p style={{ fontSize: 13.5, color: "rgba(26,26,26,0.6)", marginTop: 6 }}>
            Review and action CA firm verification requests.
          </p>
        </div>
        <button
          onClick={() => load()}
          style={{ ...btn("#FFFFFF"), color: INK, border: `1px solid ${BORDER}` }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginTop: 22 }}>
        <Search
          size={16}
          color="rgba(26,26,26,0.45)"
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by firm name, CA name, email, or ICAI number"
          style={{
            width: "100%", height: 40, border: "1px solid rgba(26,26,26,0.15)", borderRadius: 9,
            fontFamily: "'Instrument Sans', Inter, sans-serif", fontSize: 14, padding: "0 14px 0 36px",
            background: "#FFFFFF", color: INK, outline: "none",
          }}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-6 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setReasonFor(null); setReason(""); setReasonError(""); }}
              style={{
                background: active ? TEAL : "#FFFFFF",
                color: active ? "#FFFFFF" : "rgba(26,26,26,0.7)",
                border: `1px solid ${active ? TEAL : BORDER}`,
                borderRadius: 999, padding: "8px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              {t.label} ({grouped[t.key].length})
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="mt-6 grid gap-4">
        {loading && (
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, fontSize: 14 }}>
            Loading CA firms…
          </div>
        )}

        {!loading && list.length === 0 && (
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28, fontSize: 14, color: "rgba(26,26,26,0.6)" }}>
            {search.trim() ? `No ${tab} CA firms match “${search.trim()}”.` : `No ${tab} CA firms.`}
          </div>
        )}

        {!loading && list.map((f) => {
          const badge = BADGE[(f.verification_status ?? "pending")] ?? BADGE.pending;
          const showReason = reasonFor?.id === f.id;
          const busy = busyId === f.id;
          const emailResult = emailResults.get(f.id);
          return (
            <div key={f.id} style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEAL }}>{f.firm_name ?? "Unnamed firm"}</div>
                  <div style={{ fontSize: 13.5, color: "rgba(26,26,26,0.72)", marginTop: 6, lineHeight: 1.7 }}>
                    <div>{f.ca_name ?? "—"} · ICAI {f.icai_membership_number ?? "—"}</div>
                    <div>{f.email ?? "—"} · {f.phone ?? "—"}</div>
                    <div>{[f.city, f.state].filter(Boolean).join(", ") || "—"}</div>
                    <div style={{ color: "rgba(26,26,26,0.5)", fontSize: 12.5, marginTop: 4 }}>
                      Submitted {fmtDate(f.verification_submitted_at ?? f.created_at)}
                      {f.verification_reviewed_at ? ` · Reviewed ${fmtDate(f.verification_reviewed_at)}` : ""}
                    </div>
                    {f.verification_rejected_reason && (
                      <div style={{ color: "#A93838", fontSize: 12.5, marginTop: 4 }}>
                        Reason: {f.verification_rejected_reason}
                      </div>
                    )}
                  </div>
                </div>
                <span style={{
                  background: badge.bg, color: badge.fg, fontSize: 11.5, fontWeight: 700,
                  padding: "5px 12px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.6,
                }}>
                  {badge.label}
                </span>
              </div>

              {showReason && (
                <div className="mt-4">
                  <input
                    autoFocus
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(""); }}
                    placeholder={reasonFor?.action === "reject" ? "Reason for rejection (required)" : "Reason for suspension (required)"}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 9,
                      border: `1px solid ${reasonError ? "#A93838" : BORDER}`,
                      fontSize: 13.5, fontFamily: "'Instrument Sans', Inter, sans-serif", color: INK, background: "#FCFBF9",
                    }}
                  />
                  {reasonError && <div style={{ color: "#A93838", fontSize: 12, marginTop: 6 }}>{reasonError}</div>}
                </div>
              )}

              <div className="flex items-center gap-3 mt-4 flex-wrap">
                {busy && <Loader2 size={16} className="animate-spin" color={TEAL} />}
                {tab === "pending" && (
                  <>
                    {(!showReason || reasonFor?.action !== "reject") && (
                      <button disabled={busy} style={btn(TEAL)} onClick={() => askConfirm(f, "approve")}>
                        <CheckCircle2 size={15} /> Approve
                      </button>
                    )}
                    {showReason && reasonFor?.action === "reject" ? (
                      <>
                        <button disabled={busy} style={btn("#A93838")} onClick={() => askConfirm(f, "reject")}>
                          <XCircle size={15} /> Confirm reject
                        </button>
                        <button
                          disabled={busy}
                          style={{ ...btn("#FFFFFF"), color: INK, border: `1px solid ${BORDER}` }}
                          onClick={() => { setReasonFor(null); setReason(""); setReasonError(""); }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button disabled={busy} style={btn("#A93838")} onClick={() => { setReasonFor({ id: f.id, action: "reject" }); setReason(""); setReasonError(""); }}>
                        <XCircle size={15} /> Reject
                      </button>
                    )}
                  </>
                )}

                {tab === "approved" && (
                  showReason ? (
                    <>
                      <button disabled={busy} style={btn("#B8860B")} onClick={() => askConfirm(f, "suspend")}>
                        <PauseCircle size={15} /> Confirm suspend
                      </button>
                      <button
                        disabled={busy}
                        style={{ ...btn("#FFFFFF"), color: INK, border: `1px solid ${BORDER}` }}
                        onClick={() => { setReasonFor(null); setReason(""); setReasonError(""); }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button disabled={busy} style={btn("#B8860B")} onClick={() => { setReasonFor({ id: f.id, action: "suspend" }); setReason(""); setReasonError(""); }}>
                      <PauseCircle size={15} /> Suspend
                    </button>
                  )
                )}

                {tab === "rejected" && (
                  <button disabled={busy} style={btn(TEAL)} onClick={() => askConfirm(f, "reactivate")}>
                    <RotateCcw size={15} /> Reactivate
                  </button>
                )}

                <button
                  onClick={() => openHistory(f)}
                  style={{
                    background: "transparent", color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 9,
                    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Instrument Sans', Inter, sans-serif",
                  }}
                >
                  <Clock size={14} /> History
                </button>
              </div>

              {emailResult && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                  {emailResult.sent ? (
                    <>
                      <CheckCircle2 size={14} color="#A93838" />
                      <span style={{ fontSize: 12, color: "#A93838" }}>Email sent to {f.email}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} color="#A93838" />
                      <span style={{ fontSize: 12, color: "#A93838" }}>
                        Email not sent{emailResult.error ? `: ${emailResult.error}` : ""}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 22 }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              ...btn("#FFFFFF"), color: currentPage <= 1 ? "rgba(26,26,26,0.35)" : INK,
              border: `1px solid ${BORDER}`, cursor: currentPage <= 1 ? "not-allowed" : "pointer",
            }}
          >
            <ChevronLeft size={15} /> Previous
          </button>
          <span style={{ fontSize: 13, color: "rgba(26,26,26,0.6)" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              ...btn("#FFFFFF"), color: currentPage >= totalPages ? "rgba(26,26,26,0.35)" : INK,
              border: `1px solid ${BORDER}`, cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div
          onClick={closeConfirm}
          style={{
            position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FFFFFF", maxWidth: 480, width: "100%", borderRadius: 12, padding: 28,
              fontFamily: "'Instrument Sans', Inter, sans-serif", color: INK,
            }}
          >
            <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: TEAL }}>
              Confirm {ACTION_VERB[confirmModal.action]}
            </div>
            <p style={{ fontSize: 13.5, color: "rgba(26,26,26,0.72)", lineHeight: 1.7, marginTop: 12 }}>
              You are about to {ACTION_VERB[confirmModal.action]}{" "}
              <strong>{confirmModal.firm.firm_name ?? "this firm"}</strong>. This will update their
              verification status and send an email notification to the CA. This action cannot be undone.
            </p>
            {(confirmModal.action === "reject" || confirmModal.action === "suspend") && confirmModal.reason && (
              <div style={{
                background: "#FDF3DC", borderLeft: "3px solid #8A6100", padding: "10px 14px",
                borderRadius: 9, marginTop: 14, fontSize: 13, color: "#8A6100", lineHeight: 1.6,
              }}>
                {confirmModal.reason}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <button
                onClick={closeConfirm}
                style={{ ...btn("#FFFFFF"), color: INK, border: `1px solid ${BORDER}` }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { firm, action } = confirmModal;
                  setConfirmModal(null);
                  void run(firm, action);
                }}
                style={btn(ACTION_COLOR[confirmModal.action])}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit history drawer */}
      {drawerFirm && (
        <div
          onClick={() => setDrawerFirm(null)}
          style={{ position: "fixed", inset: 0, zIndex: 39, background: "rgba(0,0,0,0.18)" }}
        />
      )}
      <div
        style={{
          position: "fixed", right: 0, top: 0, height: "100%", width: 420, maxWidth: "100vw",
          background: "#FFFFFF", zIndex: 40, boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          transform: drawerFirm ? "translateX(0)" : "translateX(100%)",
          transition: "transform 240ms ease", overflowY: "auto",
          fontFamily: "'Instrument Sans', Inter, sans-serif", color: INK,
          visibility: drawerFirm ? "visible" : "hidden",
        }}
      >
        <div style={{ padding: 24, borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: TEAL }}>
              {drawerFirm?.firm_name ?? "Firm"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(26,26,26,0.55)", marginTop: 4 }}>Audit history</div>
          </div>
          <button
            onClick={() => setDrawerFirm(null)}
            aria-label="Close audit history"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: INK, padding: 4, height: 28 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {auditLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "28px 0" }}>
              <Loader2 size={20} className="animate-spin" color={TEAL} />
            </div>
          )}

          {!auditLoading && auditLog.length === 0 && (
            <div style={{ fontSize: 13, color: "rgba(26,26,26,0.55)", textAlign: "center", padding: "28px 0" }}>
              No review history yet.
            </div>
          )}

          {!auditLoading && auditLog.map((e) => {
            const lb = LOG_BADGE[e.action] ?? { bg: "#F2F1EE", fg: "rgba(26,26,26,0.7)" };
            return (
              <div key={e.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <span style={{
                  background: lb.bg, color: lb.fg, fontSize: 11, fontWeight: 700,
                  padding: "4px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.6,
                }}>
                  {e.action}
                </span>
                <div style={{ fontSize: 12, color: "rgba(26,26,26,0.6)", marginTop: 8 }}>{e.reviewed_by_email}</div>
                <div style={{ fontSize: 12, color: "rgba(26,26,26,0.45)", marginTop: 2 }}>{fmtDateTime(e.created_at)}</div>
                {e.reason && (
                  <div style={{ fontSize: 12, fontStyle: "italic", color: "#8A6100", marginTop: 6, lineHeight: 1.6 }}>
                    {e.reason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
