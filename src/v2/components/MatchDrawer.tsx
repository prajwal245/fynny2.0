import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPracticeTransactionHistory, unmatchPracticeMatch } from "@/lib/practice/practice.functions";
import { Badge, Drawer, V, formatDate, formatINR } from "../ui";
import { ShimmerText } from "../agents";
import { useV2 } from "../store";

type History = Awaited<ReturnType<typeof getPracticeTransactionHistory>>;

const STAGE: Record<string, string> = {
  exact: "Exact: same amount and date",
  fuzzy: "Close match: amount, date and party names agree within tolerance",
  rules: "By a rule: bank charge, interest, tax, alias or split payment",
  manual: "Matched by hand",
};

/** A matched bank or book line: both sides of the match, how it was made, and Unmatch for partners. */
export function MatchDrawer({ txnId, onClose }: { txnId: string | null; onClose: () => void }) {
  const { refresh, canSignOff, role } = useV2();
  const partnerView = canSignOff && role === "Partner";
  const [h, setH] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setH(null);
    setError(null);
    setNote("");
    if (!txnId) return;
    getPracticeTransactionHistory({ data: { id: txnId } })
      .then(setH)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this match."));
  }, [txnId]);

  const active = (h?.matches ?? []).filter((m) => (m as { status?: string }).status === "active");
  const m = active[0] as (History["matches"][number] & { id: string; match_stage: string; matched_by: string | null; matched_at: string; explanation: Record<string, unknown> | null; book_txn_ids: string[]; bank_txn_id: string }) | undefined;
  const t = h?.transaction as { id: string; side: string; direction: string; amount: number; txn_date: string; description: string | null; counterparty: string | null } | undefined;
  const others = (h?.counterparts ?? []) as { id: string; side: string; direction: string; amount: number; txn_date: string; description: string | null; counterparty: string | null }[];
  const sign = (x: { direction: string; amount: number }) => (x.direction === "out" ? -Number(x.amount) : Number(x.amount));
  const line = (x: NonNullable<typeof t>) => (
    <div key={x.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, padding: "10px 12px", background: V.gray, borderRadius: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: V.muted, textTransform: "uppercase", letterSpacing: ".06em" }}>{x.side === "bank" ? "Bank" : "Books"} · {formatDate(x.txn_date)}</div>
        <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{x.counterparty || x.description || "Line"}</div>
        {x.counterparty && x.description && <div style={{ fontSize: 12.5, color: V.body, overflowWrap: "anywhere" }}>{x.description}</div>}
      </div>
      <div className="num" style={{ color: sign(x) < 0 ? V.maroon : V.green, fontWeight: 600 }}>{formatINR(sign(x))}</div>
    </div>
  );

  const unmatch = async () => {
    if (!m || !note.trim()) return;
    setBusy(true);
    try {
      await unmatchPracticeMatch({ data: { id: m.id, note: note.trim() } });
      toast.success("Unmatched. Both lines are back in the Exception Queue.");
      await refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unmatch.");
    } finally {
      setBusy(false);
    }
  };

  const stage = m ? (m.matched_by ? "manual" : m.match_stage) : "";
  const note0 = (m?.explanation as { note?: string } | null)?.note;

  return (
    <Drawer open={!!txnId} onClose={onClose} title="Matched pair">
      {error && <p style={{ color: V.maroon, fontSize: 13.5 }}>{error}</p>}
      {!h && !error && <ShimmerText text="Loading the match…" />}
      {h && t && !m && <p style={{ fontSize: 13.5 }}>This line is not matched right now.</p>}
      {h && t && m && (
        <div style={{ display: "grid", gap: 14 }} data-testid="match-drawer">
          <div style={{ display: "grid", gap: 8 }}>
            {[t, ...others].sort((a, b) => (a.side === "bank" ? -1 : 1) - (b.side === "bank" ? -1 : 1)).map(line)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Badge tone="good">{STAGE[stage] ? STAGE[stage].split(":")[0] : stage}</Badge>
            <span style={{ fontSize: 12.5, color: V.body }}>
              {STAGE[stage]?.split(": ")[1] ?? ""}
              {note0 ? ` · ${note0}` : ""} · {m.matched_by ? "by a person" : "by the Recon agent"} on {formatDate(m.matched_at)}
            </span>
          </div>
          {partnerView ? (
            <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${V.line}`, paddingTop: 14 }}>
              <label className="v2-label" htmlFor="unmatch-note">Wrong match? Note why (kept on the audit trail)</label>
              <input id="unmatch-note" className="v2-input" placeholder="e.g. receipt belongs to invoice 1042, not 1041" value={note} onChange={(e) => setNote(e.target.value)} />
              <div>
                <button className="v2-btn v2-btn-ghost" disabled={!note.trim() || busy} onClick={() => void unmatch()} data-testid="unmatch">
                  {busy ? "Unmatching…" : "Unmatch"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: V.muted, margin: 0 }}>Both lines go back to the Exception Queue. Recon will not pair them again on its own.</p>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: V.muted, margin: 0 }}>Only a partner can unmatch a pair.</p>
          )}
        </div>
      )}
    </Drawer>
  );
}
