import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Badge, V } from "../ui";
import { getPracticePeriodStatus, lockPracticePeriod } from "@/lib/practice/practice.functions";

/**
 * Locks the month at close, with a fingerprint of every document the client has. If a document is later changed, added or removed,
 * the lock says it is stale and the month needs another look: a closed month never changes silently.
 */
export default function PeriodLock({ clientId, period }: { clientId: string; period: string }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof getPracticePeriodStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const month = /^\d{4}-\d{2}$/.test(period) ? period : null;
  const load = () => { if (month) getPracticePeriodStatus({ data: { business_id: clientId, period: month } }).then(setSt).catch(() => setSt(null)); };
  useEffect(load, [clientId, month]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!month || !st || st.sqlMissing) return null;
  const lock = async () => {
    setBusy(true);
    try { const r = await lockPracticePeriod({ data: { business_id: clientId, period: month } }); toast.success(`${month} locked with ${r.inputs} documents on record.`); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not lock."); } finally { setBusy(false); }
  };
  return (
    <div data-testid="period-lock" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 13 }}>
      <Lock size={15} color={V.muted} />
      {st.locked && !st.stale && <><Badge tone="good">Locked</Badge><span style={{ color: V.body }}>{month} was locked {st.lockedAt ? new Date(st.lockedAt).toLocaleDateString("en-IN") : ""}; no document has changed since.</span></>}
      {st.locked && st.stale && <><Badge tone="bad">Changed since locked</Badge><span style={{ color: V.maroon }}>A document for this client was changed, added or removed after {month} was locked. Review the month again, then lock it again.</span><button className="v2-btn v2-btn-ghost v2-btn-sm" disabled={busy} onClick={() => void lock()}>Lock again</button></>}
      {!st.locked && <><span style={{ color: V.body }}>{month} is not locked.</span><button className="v2-btn v2-btn-ghost v2-btn-sm" disabled={busy} onClick={() => void lock()}>Lock this month (partner)</button></>}
    </div>
  );
}
