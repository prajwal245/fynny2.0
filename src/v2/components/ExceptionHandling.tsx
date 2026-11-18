import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Badge, V, formatDate } from "../ui";
import { AgentWorking } from "./AgentTrace";
import type { Exception } from "../store";
import { KIND_ACTION, KIND_LABEL, WORK_LABEL, nextStatuses, type WorkStatus } from "@/lib/practice/exceptionKinds";
import { getPracticeOwnTransfers, unpairPracticeOwnTransfer } from "@/lib/practice/practice.functions";
import type { TeamMember, TimelineEvent, useExceptionWork } from "../lib/exceptionWork";

type Work = ReturnType<typeof useExceptionWork>;
const SENIOR = new Set(["owner", "admin", "partner", "manager"]);

const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Why a difference is only timing. The reason goes into the history with the person's own words. */
export const TIMING_REASONS = [
  "Cheque issued, not yet presented",
  "Cheque deposited, not yet cleared",
  "Booked in the next month",
  "Booked in the previous month",
  "Bank charge or interest not yet booked",
  "Rounding difference",
  "Other (explain in the note)",
] as const;

/** Who has it: a small avatar and a name, or a plain "Unassigned". */
export function OwnerChip({ name, you }: { name: string | null; you?: boolean }) {
  if (!name) return <span style={{ color: V.muted, fontSize: 12.5 }}>Unassigned</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: V.ink }} title={name}>
      <span aria-hidden style={{ width: 22, height: 22, borderRadius: 999, background: you ? V.brand : V.gray, color: you ? "#fff" : V.body, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700 }}>{initials(name)}</span>
      <span className="rv-cut">{you ? "You" : name}</span>
    </span>
  );
}

export function KindBadge({ e }: { e: Pick<Exception, "kind" | "kindWhy"> }) {
  if (!e.kind) return null;
  return (
    <span title={e.kindWhy}>
      <Badge tone="warn">{KIND_LABEL[e.kind]}</Badge>
    </span>
  );
}

const TONE: Record<WorkStatus, "neutral" | "info" | "warn" | "good"> = { open: "neutral", query_sent: "info", answered: "warn", resolved: "good", accepted_timing: "good" };
export function WorkBadge({ e }: { e: Pick<Exception, "workStatus" | "reviewState"> }) {
  const s = (e.workStatus ?? "open") as WorkStatus;
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      <Badge tone={TONE[s]}>{WORK_LABEL[s]}</Badge>
      {e.reviewState === "with_senior" && <Badge tone="info">In review</Badge>}
      {e.reviewState === "returned" && <Badge tone="bad">Returned</Badge>}
    </span>
  );
}

/** Due date, red when it has passed. */
export function DueText({ date }: { date: string | null | undefined }) {
  if (!date) return <span style={{ color: V.muted, fontSize: 12.5 }}>No date</span>;
  const late = date < new Date().toISOString().slice(0, 10);
  return <span className="num" style={{ fontSize: 12.5, color: late ? V.maroon : V.body, fontWeight: late ? 600 : 400 }}>{formatDate(date)}{late ? " · late" : ""}</span>;
}

const EVENT_TEXT: Record<string, (e: TimelineEvent) => string> = {
  assigned: (e) => `${e.by} assigned it to ${e.to}`,
  handover: (e) => `${e.by} handed it over from ${e.from} to ${e.to}`,
  status: (e) => `${e.by} changed the status from ${e.from} to ${e.to}`,
  remark: (e) => `${e.by} updated the remark`,
  due: (e) => `${e.by} set the due date to ${e.to ? formatDate(e.to) : "none"}`,
  review_sent: (e) => `${e.by} sent it to ${e.to} for review`,
  review_returned: (e) => `${e.by} returned it to ${e.to}`,
  review_approved: (e) => `${e.by} approved it`,
  resolved: (e) => `${e.by} resolved it`,
  ignored: (e) => `${e.by} ignored it`,
  reopened: (e) => `${e.by} reopened it`,
};

function Timeline({ events }: { events: TimelineEvent[] | null | "error" }) {
  if (events === "error") return <div style={{ fontSize: 13, color: V.maroon }} role="alert">The history could not be loaded just now. Reopen this exception in a moment. Nothing has been lost.</div>;
  if (events === null) return <div style={{ fontSize: 13, color: V.muted }}>Loading history…</div>;
  if (!events.length) return <div style={{ fontSize: 13, color: V.muted }}>No history yet. Every assignment, status change and note will appear here, and cannot be edited.</div>;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }} aria-label="Exception history">
      {events.map((e, i) => (
        <motion.li key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 10, paddingBottom: 12, position: "relative" }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: V.brand, marginTop: 5, justifySelf: "center" }} />
          <span>
            <span style={{ fontSize: 13, color: V.ink }}>{(EVENT_TEXT[e.type] ?? ((x: TimelineEvent) => `${x.by}: ${x.type}`))(e)}</span>
            {e.note && <span style={{ display: "block", fontSize: 12.5, color: V.body, background: V.gray, borderRadius: 10, padding: "6px 10px", marginTop: 4 }}>“{e.note}”</span>}
            <span className="num" style={{ display: "block", fontSize: 11.5, color: V.muted, marginTop: 2 }}>{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

/** Inside an exception: what kind it is, who has it, where it stands, the remark, senior review, and its whole history. */
export function HandlingPanel({ ex, work, role }: { ex: Exception; work: Work; role: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null | "error">(null);
  const [remark, setRemark] = useState(ex.remark ?? "");
  const [note, setNote] = useState("");
  const [timingReason, setTimingReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const status = (ex.workStatus ?? "open") as WorkStatus;
  const senior = SENIOR.has(role);
  const seniors = work.members.filter((m) => SENIOR.has(m.role) && !m.isYou);
  const open = ex.status === "open";

  useEffect(() => {
    setRemark(ex.remark ?? "");
    setNote("");
  }, [ex.id, ex.remark]);
  useEffect(() => {
    let live = true;
    setEvents(null);
    void work.timeline(ex.id).then((e) => live && setEvents(e));
    return () => {
      live = false;
    };
    // The history is read again when something about the exception changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.id, ex.updatedAt, ex.workStatus, ex.ownerId, ex.reviewState, ex.status]);

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    return ok;
  };
  const moves = open ? nextStatuses(status) : [];

  return (
    <div style={{ display: "grid", gap: 14 }} data-testid="exception-handling">
      {ex.kind && (
        <div style={{ borderLeft: `3px solid ${V.brand}`, paddingLeft: 12 }}>
          <div style={{ fontWeight: 600, color: V.ink }}>{KIND_LABEL[ex.kind]}</div>
          {ex.kindWhy && <div style={{ fontSize: 13, color: V.body, marginTop: 2 }}>{ex.kindWhy}</div>}
          <div style={{ fontSize: 12.5, color: V.muted, marginTop: 4 }}>{KIND_ACTION[ex.kind]}</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <div>
          <label className="v2-label" htmlFor="ex-owner">Owner</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select id="ex-owner" className="v2-input" value={ex.ownerId ?? ""} disabled={busy || !open} onChange={(e) => void act(() => work.assign([ex.id], e.target.value || null))}>
              <option value="">Unassigned</option>
              {work.members.map((m: TeamMember) => <option key={m.userId} value={m.userId}>{m.isYou ? `${m.name} (you)` : m.name} · {m.role}</option>)}
            </select>
            {open && work.me && ex.ownerId !== work.me.userId && (
              <button className="bx-btn bx-sm" disabled={busy} onClick={() => void act(() => work.assign([ex.id], work.me!.userId))}>Take</button>
            )}
          </div>
        </div>
        <div>
          <label className="v2-label" htmlFor="ex-due">Due</label>
          <input id="ex-due" type="date" className="v2-input" value={ex.dueDate ?? ""} disabled={busy || !open} onChange={(e) => void act(() => work.saveRemark(ex.id, { dueDate: e.target.value || null }))} />
        </div>
      </div>

      <div>
        <div className="v2-label">Status</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <WorkBadge e={ex} />
          {moves.map((m) => (
            <button key={m} className="bx-btn bx-sm" disabled={busy} onClick={() => {
              if (m === "accepted_timing" && !timingReason) return void toast.info("Pick why it is only a timing difference first.");
              if (m === "accepted_timing" && timingReason.startsWith("Other") && !note.trim()) return void toast.info("Explain it in the note, since you picked Other.");
              const text = m === "accepted_timing" ? `${timingReason}${note.trim() ? `: ${note.trim()}` : ""}` : note.trim() || undefined;
              void act(() => work.setStatus(ex.id, m, text)).then((ok) => { if (ok) { setNote(""); setTimingReason(""); } });
            }}>
              {busy ? "Saving…" : m === "query_sent" ? "Mark query sent" : m === "answered" ? "Mark answered" : m === "accepted_timing" ? "Accept as timing" : "Reopen handling"}
            </button>
          ))}
        </div>
        {moves.includes("accepted_timing") && (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <select className="v2-input" value={timingReason} onChange={(e) => setTimingReason(e.target.value)} aria-label="Why it is only a timing difference">
              <option value="">Why is this only timing?</option>
              {TIMING_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input className="v2-input" placeholder="Note for the history, for example: cheque 4512 clears on 3 Nov" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note for the status change" />
          </div>
        )}
      </div>

      <div>
        <label className="v2-label" htmlFor="ex-remark">Internal remark</label>
        <textarea id="ex-remark" className="v2-input" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What you found, for whoever picks this up next. Clients never see this." disabled={!open} />
        {remark.trim() !== (ex.remark ?? "") && (
          <button className="bx-btn bx-sm bx-primary" style={{ marginTop: 6 }} disabled={busy} onClick={() => void act(() => work.saveRemark(ex.id, { remark }))}>Save remark</button>
        )}
      </div>

      {open && (
        <div>
          <div className="v2-label">Senior review</div>
          {ex.reviewState === "with_senior" ? (
            senior ? (
              <div style={{ display: "grid", gap: 8 }}>
                <input className="v2-input" placeholder="Note (required to return it)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="bx-btn bx-sm bx-primary" disabled={busy} onClick={() => void act(() => work.review(ex.id, "approve", { note: note.trim() || undefined })).then((ok) => { if (ok) setNote(""); })}>Approve</button>
                  <button className="bx-btn bx-sm" disabled={busy || !note.trim()} onClick={() => void act(() => work.review(ex.id, "return", { note: note.trim() })).then((ok) => { if (ok) setNote(""); })}>Return to {work.nameOf(ex.ownerId) ?? "owner"}</button>
                </div>
              </div>
            ) : <div style={{ fontSize: 13, color: V.body }}>Waiting for {work.nameOf(ex.reviewerId) ?? "a senior"} to review it.</div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {ex.reviewState === "returned" && <Badge tone="bad">Returned: see the history for what to change</Badge>}
              <select className="v2-input" style={{ width: "auto", minWidth: 190 }} value={reviewer} onChange={(e) => setReviewer(e.target.value)} aria-label="Reviewer">
                <option value="">Choose a reviewer…</option>
                {seniors.map((m) => <option key={m.userId} value={m.userId}>{m.name} · {m.role}</option>)}
              </select>
              <button className="bx-btn bx-sm" disabled={busy || !reviewer} onClick={() => void act(() => work.review(ex.id, "send", { reviewerId: reviewer }))}>Send for review</button>
              {seniors.length === 0 && <span style={{ fontSize: 12.5, color: V.muted }}>Invite a partner or manager in Settings to use review.</span>}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="v2-label" style={{ display: "flex", justifyContent: "space-between" }}><span>History</span>{busy && <AgentWorking agent="chaser" text="Saving" />}</div>
        <Timeline events={events} />
      </div>
    </div>
  );
}

/** For the bulk bar: give the selected exceptions to one person. */
export function AssignControl({ ids, work, onDone }: { ids: string[]; work: Work; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select className="v2-input" style={{ width: "auto", minHeight: 40 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Assign selected to">
        <option value="">Assign to…</option>
        <option value="__none">Unassign</option>
        {work.members.map((m) => <option key={m.userId} value={m.userId}>{m.isYou ? `${m.name} (you)` : m.name}</option>)}
      </select>
      <button className="bx-btn bx-sm bx-primary" style={{ minHeight: 40 }} disabled={!to || busy} onClick={async () => {
        setBusy(true);
        const ok = await work.assign(ids, to === "__none" ? null : to);
        setBusy(false);
        if (ok) {
          setTo("");
          onDone();
        }
      }}>{busy ? "Assigning…" : "Apply"}</button>
    </span>
  );
}

/** Transfers between the client's own accounts that were paired and set aside, each with its evidence and an Undo. */
export function OwnTransfersPanel({ clientId, refresh }: { clientId?: string; refresh: () => Promise<void> }) {
  const [rows, setRows] = useState<{ kind?: "own_account" | "reversal"; outId: string; inId: string; businessId: string; amount: number; date: string; outNarration: string; inNarration: string }[] | null>(null);
  const [openList, setOpenList] = useState(false);
  const load = () => void getPracticeOwnTransfers({ data: { business_id: clientId } }).then((r) => setRows(r)).catch(() => setRows([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [clientId]);
  if (!rows?.length) return null;
  return (
    <div className="v2-card" style={{ padding: 14, marginBottom: 16 }} data-testid="own-transfers">
      <button className="bx-btn bx-sm" onClick={() => setOpenList((o) => !o)} aria-expanded={openList}>
        {rows.length} pair{rows.length === 1 ? "" : "s"} set aside automatically ({rows.filter((r) => r.kind !== "reversal").length} own-account transfers, {rows.filter((r) => r.kind === "reversal").length} reversed payments) {openList ? "▾" : "▸"}
      </button>
      <span style={{ fontSize: 12.5, color: V.muted, marginLeft: 10 }}>Each pair nets to nothing: a transfer between the client's own accounts, or a payment the bank gave back. Not income or expense. Undo any of them.</span>
      {openList && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {rows.slice(0, 50).map((r) => (
            <div key={r.outId} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: V.gray, borderRadius: 12, padding: "8px 12px", fontSize: 13 }}>
              <span className="num" style={{ fontWeight: 600 }}>₹{r.amount.toLocaleString("en-IN")}</span>
              <span style={{ color: V.muted }}>{formatDate(r.date)}</span>
              <span className="rv-cut" style={{ flex: 1, minWidth: 180, color: V.body }} title={`${r.outNarration}  ↔  ${r.inNarration}`}>{r.outNarration} ↔ {r.inNarration}</span>
              <button className="bx-btn bx-sm" onClick={async () => {
                try {
                  await unpairPracticeOwnTransfer({ data: { txn_id: r.outId } });
                  toast.success("Un-paired. Both lines are open again; run recon to treat them.");
                  load();
                  void refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not undo that.");
                }
              }}>Undo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
