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
import { EXCEPTION_REASONS, Exception, useV2 } from "../store";

/**
 * Exception Queue. Cross-client as a page; the client's Exceptions tab when
 * given a clientId. Only matched transactions reach the MIS, so every open
 * item here is either matched by a person, resolved elsewhere, or ignored.
 */
export default function ExceptionsPage({
  clientId: scopedClient,
}: { clientId?: string } = {}) {
  const { exceptions, clients, clientName, setExceptionStatus, runs, docs } =
    useV2();
  const [client, setClient] = useState(scopedClient ?? "all");
  const [reason, setReason] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const reconRunning = runs.some((r) => r.agent === "recon");
  const list = exceptions.filter(
    (e) =>
      e.status === "open" &&
      (client === "all" || e.clientId === client) &&
      (reason === "all" || e.reason === reason),
  );
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
  const close = () => setOpenId(null);

  const act = (
    e: Exception,
    action: "match" | "reconciled_external" | "ignore",
    ids?: string[],
  ) => {
    if (action === "match" && !(ids?.length || e.candidateIds?.length)) {
      toast.error("Pick the entry this matches");
      return;
    }
    setExceptionStatus(
      e.id,
      action === "ignore" ? "ignored" : "resolved",
      action === "ignore"
        ? { note }
        : { action, counterpartIds: ids, note: note || undefined },
    );
    toast.success(
      action === "match"
        ? "Matched manually. Matched count updated."
        : action === "ignore"
          ? "Exception ignored"
          : "Marked as reconciled",
    );
    close();
  };

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
          title="No open exceptions"
          description={
            reason !== "all"
              ? "Nothing open with this reason code."
              : "Every line has a match. Anything the Recon agent cannot settle will appear here with a reason code."
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
                        <button
                          className="v2-btn v2-btn-quiet"
                          disabled={!e.candidateIds?.length}
                          title={
                            e.candidateIds?.length
                              ? "Match with the suggested entry"
                              : "No suggested entry; open to choose one"
                          }
                          onClick={() => act(e, "match")}
                        >
                          Match
                        </button>
                        <button
                          className="v2-btn v2-btn-quiet"
                          onClick={() => act(e, "ignore")}
                        >
                          Ignore
                        </button>
                        <button
                          className="v2-btn v2-btn-quiet"
                          title="Mark as reconciled outside FynHelp"
                          onClick={() => act(e, "reconciled_external")}
                        >
                          Resolve
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
                  Pick more than one book entry for a split or part payment.
                </div>
              </div>
            )}

            <div>
              <label className="v2-label">Note (kept on the audit trail)</label>
              <input
                className="v2-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. part payment against invoice 1042"
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="v2-btn v2-btn-primary"
                disabled={picked.length === 0}
                onClick={() => act(active, "match", picked)}
              >
                Match{" "}
                {picked.length > 1 ? `${picked.length} entries` : "selected"}
              </button>
              <button
                className="v2-btn v2-btn-ghost"
                onClick={() => act(active, "reconciled_external")}
              >
                Reconciled elsewhere
              </button>
              <button
                className="v2-btn v2-btn-ghost"
                onClick={() => act(active, "ignore")}
              >
                Ignore
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
