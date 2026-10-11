import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  PageHeader,
  V,
  formatDate,
  formatINR,
} from "../ui";
import { AgentStatusBadge } from "../agents";
import { EXCEPTION_REASONS, Exception, monthOf, useV2 } from "../store";

/**
 * Exception Queue. Cross-client as a page; the client's Exceptions tab when
 * given a clientId. Only matched transactions reach the MIS, so every open
 * item here is either matched by a person, resolved elsewhere, or ignored.
 */
export default function ExceptionsPage({
  clientId: scopedClient,
}: { clientId?: string } = {}) {
  const { exceptions, clients, clientName, setExceptionStatus, reopenException, runs, docs, period } =
    useV2();
  // The queue follows the period in the top bar; "All periods" shows everything.
  const [scope, setScope] = useState<"period" | "all">("period");
  const [confirmAction, setConfirmAction] = useState<null | "ignore" | "reconciled_external">(null);
  const [client, setClient] = useState(scopedClient ?? "all");
  const [reason, setReason] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const reconRunning = runs.some((r) => r.agent === "recon" && r.status === "running");
  const inScope = (e: (typeof exceptions)[number]) =>
    (client === "all" || e.clientId === client) && (scope === "all" || monthOf(e.date) === period);
  const openInScope = exceptions.filter((e) => e.status === "open" && inScope(e));
  // A bank line and its book entry often fail together: show the pair once (the bank side).
  const openTxnIds = new Set(openInScope.map((e) => e.txnId).filter(Boolean) as string[]);
  const twinOf = (e: (typeof exceptions)[number]) =>
    e.side === "books" &&
    openInScope.some((b) => b.side !== "books" && b.candidateIds?.[0] === e.txnId && e.candidateIds?.[0] === b.txnId);
  const list = openInScope.filter((e) => (reason === "all" || e.reason === reason) && !twinOf(e));
  const decided = exceptions.filter((e) => e.status !== "open" && inScope(e));
  void openTxnIds;
  const active = exceptions.find((e) => e.id === openId) ?? null;

  // Any other unmatched entry on the opposite side, same direction, for a manual match.
  const others = useMemo(() => {
    if (!active) return [];
    const wantSide = active.side === "books" ? "bank" : "books";
    const suggested = new Set(active.candidateIds ?? []);
    return docs
      .filter((d) => d.clientId === active.clientId)
      .flatMap((d) => d.rows)
      .filter(
        (r) =>
          r.id &&
          r.side === wantSide &&
          (r.matchStatus === "unmatched" || r.matchStatus === "exception") &&
          Math.sign(r.amount) === Math.sign(active.amount) &&
          !suggested.has(r.id),
      )
      .sort(
        (a, b) =>
          Math.abs(Math.abs(a.amount) - Math.abs(active.amount)) -
          Math.abs(Math.abs(b.amount) - Math.abs(active.amount)),
      )
      .slice(0, 25);
  }, [active, docs]);

  const openItem = (e: Exception) => {
    setOpenId(e.id);
    setPicked(e.candidateIds?.slice(0, 1) ?? []);
    setNote("");
  };
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const close = () => {
    setOpenId(null);
    setConfirmAction(null);
  };

  // What the picked entries add up to against this line.
  const amountOf = (id: string) => {
    if (!active) return 0;
    const i = active.candidateIds?.indexOf(id) ?? -1;
    if (i >= 0 && active.candidateAmounts?.[i] !== undefined) return Math.abs(active.candidateAmounts[i]);
    const row = docs.flatMap((d) => d.rows).find((r) => r.id === id);
    return Math.abs(row?.amount ?? 0);
  };
  const pickedTotal = picked.reduce((s, id) => s + amountOf(id), 0);
  const difference = active ? Math.round((Math.abs(active.amount) - pickedTotal) * 100) / 100 : 0;
  const differs = picked.length > 0 && Math.abs(difference) >= 0.01;

  const act = async (
    e: Exception,
    action: "match" | "reconciled_external" | "ignore",
    ids?: string[],
  ) => {
    if (action === "match" && !(ids?.length || e.candidateIds?.length)) {
      toast.error("Pick the entry this matches");
      return;
    }
    if (action === "match" && differs && !note.trim()) {
      toast.error("Add a note saying why the amounts differ");
      return;
    }
    if (action !== "match" && !note.trim()) {
      toast.error("Add a short note for the audit trail");
      return;
    }
    const ok = await setExceptionStatus(
      e.id,
      action === "ignore" ? "ignored" : "resolved",
      action === "ignore"
        ? { note }
        : { action, counterpartIds: ids, note: note || undefined, allowDifference: action === "match" && differs },
    );
    if (!ok) return;
    toast.success(
      action === "match"
        ? "Matched. It now counts in the MIS."
        : action === "ignore"
          ? "Ignored. It stays out of the MIS."
          : "Marked as reconciled outside FynHelp.",
      { action: { label: "Undo", onClick: () => void reopenException(e.id) }, duration: 8000 },
    );
    setConfirmAction(null);
    close();
  };
  // Matching from the table is only offered when the suggestion is for the same amount.
  const safeMatch = (e: Exception) =>
    Boolean(e.candidateIds?.length) && e.candidateAmounts?.[0] !== undefined && Math.abs(Math.abs(e.candidateAmounts[0]) - Math.abs(e.amount)) < 0.01;

  return (
    <>
      {!scopedClient && (
        <PageHeader
          title="Exception Queue"
          subtitle="Lines the Recon agent could not settle on its own. Separate from the Review Queue."
          action={
            <AgentStatusBadge
              agent="recon"
              active={reconRunning}
              label={
                reconRunning ? "Matching transactions" : `${list.length} open`
              }
            />
          }
        />
      )}

      <div
        style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}
      >
        {!scopedClient && (
          <select
            className="v2-input"
            style={{ width: "auto", minWidth: 200 }}
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="v2-input"
          style={{ width: "auto", minWidth: 180 }}
          value={scope}
          onChange={(e) => setScope(e.target.value as "period" | "all")}
          aria-label="Period"
        >
          <option value="period">{period}</option>
          <option value="all">All periods</option>
        </select>
        <select
          className="v2-input"
          style={{ width: "auto", minWidth: 200 }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="all">All reason codes</option>
          {EXCEPTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={22} />}
          title={scope === "period" ? `No open exceptions in ${period}` : "No open exceptions"}
          description={
            reason !== "all"
              ? "Nothing open with this reason code."
              : decided.length
                ? `${decided.filter((d) => d.status === "resolved").length} matched or resolved and ${decided.filter((d) => d.status === "ignored").length} ignored${scope === "period" ? ` in ${period}` : ""}. Ignored lines stay out of the MIS.`
                : "Anything the Recon agent cannot settle appears here with a reason code."
          }
        />
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                {!scopedClient && <th>Client</th>}
                <th>Reason</th>
                <th>Side</th>
                <th>Narration</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Best candidate</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map((e) => (
                  <motion.tr
                    key={e.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: 24 }}
                    transition={{ duration: 0.28 }}
                    className="clickable"
                    onClick={() => openItem(e)}
                  >
                    {!scopedClient && (
                      <td style={{ fontWeight: 600 }}>
                        {clientName(e.clientId)}
                      </td>
                    )}
                    <td>
                      <Badge tone="warn">{e.reason}</Badge>
                    </td>
                    <td style={{ color: V.body }}>
                      {e.side === "books" ? "Books" : "Bank"}
                    </td>
                    <td style={{ color: V.body }}>
                      {e.narration}
                      {e.detail && (
                        <div
                          style={{ fontSize: 12, color: V.muted, marginTop: 3 }}
                        >
                          {e.detail}
                        </div>
                      )}
                    </td>
                    <td
                      className="num"
                      style={{ color: e.amount < 0 ? V.maroon : V.green }}
                    >
                      {formatINR(e.amount)}
                    </td>
                    <td className="num" style={{ color: V.body }}>
                      {formatDate(e.date)}
                    </td>
                    <td style={{ color: V.body, fontSize: 12.5 }}>
                      {e.candidates[0] ?? "No candidate found"}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          justifyContent: "flex-end",
                        }}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {safeMatch(e) && (
                          <button
                            className="v2-btn v2-btn-quiet"
                            title="Match with the suggested entry (same amount)"
                            onClick={() => void act(e, "match")}
                          >
                            Match
                          </button>
                        )}
                        <button
                          className="v2-btn v2-btn-quiet"
                          onClick={() => openItem(e)}
                        >
                          Decide
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <Drawer open={!!active} onClose={close} title="Resolve exception">
        {active && (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="warn">{active.reason}</Badge>
              <Badge>{clientName(active.clientId)}</Badge>
              <Badge tone="info">
                {active.side === "books" ? "Books entry" : "Bank line"}
              </Badge>
              {active.stage && <Badge>Reached {active.stage} stage</Badge>}
            </div>
            <div style={{ background: V.gray, borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 600 }}>{active.narration}</div>
              <div
                className="num"
                style={{
                  marginTop: 4,
                  color: active.amount < 0 ? V.maroon : V.green,
                }}
              >
                {formatINR(active.amount)} on {formatDate(active.date)}
              </div>
              {active.detail && (
                <div style={{ fontSize: 13, color: V.body, marginTop: 8 }}>
                  {active.detail}
                </div>
              )}
            </div>

            <div>
              <label className="v2-label">Suggested by the Recon agent</label>
              {active.candidates.length === 0 ? (
                <div style={{ fontSize: 13, color: V.muted }}>
                  No close candidate was found.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {active.candidates.map((c, i) => {
                    const id = active.candidateIds?.[i];
                    return (
                      <label
                        key={c}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          background: V.gray,
                          borderRadius: 12,
                          padding: 10,
                          cursor: id ? "pointer" : "default",
                          fontSize: 13,
                        }}
                      >
                        {id && (
                          <input
                            type="checkbox"
                            checked={picked.includes(id)}
                            onChange={() => toggle(id)}
                            style={{ marginTop: 3 }}
                          />
                        )}
                        <span>{c}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {others.length > 0 && (
              <div>
                <label className="v2-label">
                  Other unmatched{" "}
                  {active.side === "books" ? "bank lines" : "book entries"}
                </label>
                <div
                  style={{
                    display: "grid",
                    gap: 6,
                    maxHeight: 240,
                    overflowY: "auto",
                  }}
                >
                  {others.map((r) => (
                    <label
                      key={r.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto auto minmax(0,1fr) auto",
                        gap: 10,
                        alignItems: "center",
                        fontSize: 12.5,
                        padding: "6px 4px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id!)}
                        onChange={() => toggle(r.id!)}
                      />
                      <span className="num" style={{ color: V.muted }}>
                        {formatDate(r.date)}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.particulars}
                      </span>
                      <span
                        className="num"
                        style={{ color: r.amount < 0 ? V.maroon : V.green }}
                      >
                        {formatINR(r.amount)}
                      </span>
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: V.muted, marginTop: 6 }}>
                  {active.side === "books"
                    ? "Pick every bank line that paid this entry (part payments)."
                    : "Pick more than one book entry when one payment covers several bills."}
                </div>
              </div>
            )}

            {differs && (
              <div role="alert" style={{ background: V.warnBg, color: V.warnFg, borderRadius: 12, padding: "10px 12px", fontSize: 13 }}>
                The picked {picked.length > 1 ? "entries add up to" : "entry is"} {formatINR(pickedTotal)}, a difference of {formatINR(Math.abs(difference))}.
                Pick the other part of the payment, or write why the amounts differ to match anyway.
              </div>
            )}

            <div>
              <label className="v2-label">Note (kept on the audit trail){differs || confirmAction ? " · required" : ""}</label>
              <input
                className="v2-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. part payment against invoice 1042"
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {confirmAction ? (
                <>
                  <div style={{ width: "100%", fontSize: 13, color: V.body }}>
                    {confirmAction === "ignore"
                      ? "Ignore this line? It stays out of the MIS. You can undo for a few seconds after."
                      : "Mark this line as reconciled outside FynHelp? It will count as reconciled."}
                  </div>
                  <button className="v2-btn v2-btn-primary" disabled={!note.trim()} onClick={() => void act(active, confirmAction)}>
                    {confirmAction === "ignore" ? "Ignore line" : "Mark reconciled"}
                  </button>
                  <button className="v2-btn v2-btn-quiet" onClick={() => setConfirmAction(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button
                    className="v2-btn v2-btn-primary"
                    disabled={picked.length === 0 || (differs && !note.trim())}
                    onClick={() => void act(active, "match", picked)}
                  >
                    {differs ? "Match with difference" : `Match ${picked.length > 1 ? `${picked.length} entries` : "selected"}`}
                  </button>
                  <button className="v2-btn v2-btn-ghost" onClick={() => setConfirmAction("reconciled_external")}>
                    Reconciled elsewhere
                  </button>
                  <button className="v2-btn v2-btn-ghost" onClick={() => setConfirmAction("ignore")}>
                    Ignore
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
