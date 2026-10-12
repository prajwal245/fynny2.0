/**
 * Plain guidance for the Review Queue, worked out by rules (no AI): when many
 * rows from one file are waiting for the same reason, say what the file looks
 * like and offer the one fix that clears them all.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, FileWarning, Lightbulb, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Card, V } from "../ui";
import { ReviewItem, useV2 } from "../store";

const REGISTER_NAME = /(invoice|bill|purchase|sales|gst|gstr|tds|payroll|salary|razorpay|cashfree|payu|settlement|register)/i;
const REGISTER_TEXT = /(gstin|taxable|cgst|sgst|igst|invoice no|hsn|deductee|section 19|net pay|settlement)/i;

/** Rows from a file that looks like a register are never bulk-confirmed into bank lines. */
export function registerLikeDocs(items: ReviewItem[]): Set<string> {
  const byDoc = new Map<string, ReviewItem[]>();
  for (const r of items) if (r.docId) (byDoc.get(r.docId) ?? byDoc.set(r.docId, []).get(r.docId)!).push(r);
  const out = new Set<string>();
  for (const [docId, list] of byDoc)
    if (REGISTER_NAME.test(list[0].docName ?? "") || list.slice(0, 5).some((r) => REGISTER_TEXT.test(r.rawText ?? ""))) out.add(docId);
  return out;
}

type Group = { docId: string; docName: string; clientId: string; items: ReviewItem[]; reason: string };

export function guideGroups(items: ReviewItem[], keep: Set<string> = new Set()): Group[] {
  const byDoc = new Map<string, ReviewItem[]>();
  for (const r of items) if (r.docId) (byDoc.get(r.docId) ?? byDoc.set(r.docId, []).get(r.docId)!).push(r);
  return [...byDoc.entries()]
    .map(([docId, list]) => {
      const counts = new Map<string, number>();
      for (const r of list) counts.set(r.reason ?? "", (counts.get(r.reason ?? "") ?? 0) + 1);
      const [reason] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [""];
      return { docId, docName: list[0].docName, clientId: list[0].clientId, items: list, reason };
    })
    .filter((g) => g.items.length >= 3 || !g.clientId || keep.has(g.docId))
    .sort((a, b) => b.items.length - a.items.length);
}

export function ReviewGuide({ items }: { items: ReviewItem[] }) {
  const { clients, reprocessDoc, assignDoc, resolveReview } = useV2();
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Every register-like file gets its card (a 4th legacy register was hidden before); others up to 3.
  const regs = registerLikeDocs(items);
  const all = guideGroups(items, regs);
  const groups = [...all.filter((g) => regs.has(g.docId)), ...all.filter((g) => !regs.has(g.docId)).slice(0, 3)];
  if (!groups.length) return null;

  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
      {groups.map((g) => {
        const looksLikeRegister = regs.has(g.docId);
        const unassigned = !g.clientId;
        const n = g.items.length;
        const title = looksLikeRegister
          ? `${g.docName} looks like a list of invoices or a tax register, not a bank statement`
          : unassigned
            ? `${g.docName} isn't filed under a client yet`
            : `${n} rows from ${g.docName} need a look for the same reason`;
        const body = looksLikeRegister
          ? `Registers (purchase or sales invoices, GST, TDS, payroll, payment gateway reports) are summarised with their totals and kept out of bank reconciliation, so they never need checking line by line. Read the file again and FynHelp files it as a register.${unassigned ? " Choose the client first so it lands in the right place." : ""}`
          : unassigned
            ? "Rows from a file without a client can't join any reconciliation. Choose the client and FynHelp reads it again under that client."
            : `The reason: ${g.reason || "the Extract agent was unsure"}. Fix one row and confirm the rest if they look right, or read the file again if it was the wrong file.`;
        return (
          <Card key={g.docId} style={{ borderLeft: `3px solid ${V.brand}`, background: V.cream }} data-testid="review-guide">
            <div style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 12, alignItems: "start" }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", color: V.brand, display: "grid", placeItems: "center" }}>
                {looksLikeRegister ? <FileWarning size={18} /> : <Lightbulb size={18} />}
              </span>
              <div style={{ minWidth: 0, display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>{title}</div>
                  <div style={{ fontSize: 13.5, color: V.body, marginTop: 4, lineHeight: 1.55 }}>{body}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {unassigned && (
                    <>
                      <select className="v2-input" style={{ width: "auto", minWidth: 220 }} aria-label="Client" value={pick[g.docId] ?? ""} onChange={(e) => setPick({ ...pick, [g.docId]: e.target.value })}>
                        <option value="">Choose the client…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button
                        className="v2-btn v2-btn-primary"
                        disabled={!pick[g.docId] || busy === g.docId}
                        data-busy={busy === g.docId}
                        onClick={async () => {
                          setBusy(g.docId);
                          await assignDoc(g.docId, pick[g.docId]);
                          setBusy(null);
                        }}
                      >
                        <UserPlus size={15} /> File and read again
                      </button>
                    </>
                  )}
                  {!unassigned && looksLikeRegister && (
                    <button
                      className="v2-btn v2-btn-primary"
                      disabled={busy === g.docId}
                      data-busy={busy === g.docId}
                      onClick={async () => {
                        setBusy(g.docId);
                        try {
                          await reprocessDoc(g.docId);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <RotateCcw size={15} /> Read again as a register
                    </button>
                  )}
                  {!unassigned && !looksLikeRegister && (
                    <button
                      className="v2-btn v2-btn-ghost"
                      onClick={() => {
                        g.items.forEach((r) => resolveReview(r.id, "confirmed"));
                        toast.success(`${n} row${n === 1 ? "" : "s"} from ${g.docName} confirmed as transactions`);
                      }}
                    >
                      <Check size={15} /> Confirm all {n}
                    </button>
                  )}
                  <button
                    className="v2-btn v2-btn-ghost"
                    onClick={() => {
                      g.items.forEach((r) => resolveReview(r.id, "discarded"));
                      toast.success(`${n} row${n === 1 ? "" : "s"} from ${g.docName} discarded`);
                    }}
                  >
                    <Trash2 size={15} /> Discard all {n}
                  </button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
