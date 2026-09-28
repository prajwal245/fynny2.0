import { useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import {
  Badge,
  Card,
  Drawer,
  EmptyState,
  PageHeader,
  Tone,
  V,
  formatDate,
  formatINR,
} from "../ui";
import { AgentStatusBadge } from "../agents";
import { ReviewItem, useV2 } from "../store";

type Draft = {
  date: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  counterparty: string;
  reference: string;
};

/**
 * Review Queue. Cross-client worklist as a page; the client's Review tab when
 * given a clientId. Nothing here is a transaction until a person confirms it.
 */
export default function ReviewPage({
  clientId: scopedClient,
}: { clientId?: string } = {}) {
  const { review, clients, clientName, resolveReview } = useV2();
  const [client, setClient] = useState(scopedClient ?? "all");
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const [draft, setDraft] = useState<Draft>({
    date: "",
    direction: "in",
    amount: 0,
    particulars: "",
    counterparty: "",
    reference: "",
  });

  const list = review
    .filter(
      (r) => r.status === "open" && (client === "all" || r.clientId === client),
    )
    // Lowest confidence first: the riskiest rows get a human eye soonest.
    .sort((a, b) => a.confidence - b.confidence);

  const openItem = (r: ReviewItem) => {
    setOpen(r);
    setDraft({
      date: r.suggestion.date,
      direction: r.suggestion.amount < 0 ? "out" : "in",
      amount: Math.abs(r.suggestion.amount),
      particulars: r.suggestion.particulars,
      counterparty: r.suggestion.counterparty ?? "",
      reference: r.suggestion.reference ?? "",
    });
  };

  const confirm = (edited: boolean) => {
    if (!open) return;
    if (edited && (!draft.date || !draft.amount)) {
      toast.error("A date and a non-zero amount are needed");
      return;
    }
    resolveReview(
      open.id,
      "confirmed",
      edited
        ? {
            date: draft.date,
            amount:
              draft.direction === "out"
                ? -Math.abs(draft.amount)
                : Math.abs(draft.amount),
            particulars: draft.particulars,
            counterparty: draft.counterparty,
            reference: draft.reference,
          }
        : undefined,
    );
    toast.success(
      edited
        ? "Edited and confirmed. Row is now a transaction."
        : "Confirmed. Row is now a transaction.",
    );
    setOpen(null);
  };

  const confident = list.filter((r) => r.confidence >= 0.7);
  const confirmConfident = () => {
    confident.forEach((r) => resolveReview(r.id, "confirmed"));
    toast.success(
      `${confident.length} row${confident.length > 1 ? "s" : ""} confirmed`,
    );
  };

  const tone = (c: number): Tone => (c >= 0.7 ? "warn" : "bad");

  return (
    <>
      {!scopedClient && (
        <PageHeader
          title="Review Queue"
          subtitle="Only the rows the Extract agent was not confident about. Nothing here is a transaction yet."
          action={
            <AgentStatusBadge
              agent="extract"
              label={`${list.length} awaiting review`}
            />
          }
        />
      )}

      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {!scopedClient && (
          <select
            className="v2-input"
            style={{ width: "auto", minWidth: 220 }}
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
        {confident.length > 0 && (
          <button className="v2-btn v2-btn-ghost" onClick={confirmConfident}>
            Confirm {confident.length} row{confident.length > 1 ? "s" : ""}{" "}
            above 70 percent
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title="All clear — nothing needs review"
          description="Every extracted row met the confidence threshold. New low confidence rows will show up here automatically."
        />
      ) : (
        <Card style={{ padding: 0 }} className="v2-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                {!scopedClient && <th>Client</th>}
                <th>Document</th>
                <th>Raw text</th>
                <th>Suggestion</th>
                <th>Why</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {list.map((r) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      x: 32,
                      backgroundColor: "rgba(31,90,70,0.08)",
                    }}
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    className="clickable"
                    onClick={() => openItem(r)}
                  >
                    {!scopedClient && (
                      <td style={{ fontWeight: 600 }}>
                        {clientName(r.clientId)}
                      </td>
                    )}
                    <td style={{ color: V.body }}>{r.docName}</td>
                    <td
                      style={{
                        color: V.muted,
                        fontSize: 12.5,
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.rawText}
                    </td>
                    <td>
                      {r.suggestion.particulars}
                      {r.suggestion.amount ? (
                        <div
                          className="num"
                          style={{
                            fontSize: 12,
                            color: r.suggestion.amount < 0 ? V.maroon : V.green,
                          }}
                        >
                          {formatINR(r.suggestion.amount)}
                        </div>
                      ) : null}
                    </td>
                    <td
                      style={{ color: V.body, fontSize: 12.5, maxWidth: 220 }}
                    >
                      {r.reason}
                    </td>
                    <td>
                      <Badge tone={tone(r.confidence)}>
                        {Math.round(r.confidence * 100)} percent
                      </Badge>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </Card>
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title="Review extraction"
      >
        {open && (
          <div style={{ display: "grid", gap: 18 }}>
            <AgentStatusBadge
              agent="extract"
              label={`Extract confidence ${Math.round(open.confidence * 100)} percent`}
            />
            {open.reason && (
              <div
                style={{
                  background: "rgba(176,122,24,.08)",
                  border: "1px solid rgba(176,122,24,.25)",
                  borderRadius: 14,
                  padding: 12,
                  fontSize: 13,
                  color: V.body,
                }}
              >
                <b>Why this needs a look:</b> {open.reason}
              </div>
            )}
            <div>
              <label className="v2-label">
                Original raw text ({open.docName})
              </label>
              <div
                className="num"
                style={{
                  background: V.gray,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {open.rawText}
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              }}
            >
              <div>
                <label className="v2-label">Date</label>
                <input
                  className="v2-input"
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div>
                <label className="v2-label">Direction</label>
                <select
                  className="v2-input"
                  value={draft.direction}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      direction: e.target.value as "in" | "out",
                    })
                  }
                >
                  <option value="in">Money in</option>
                  <option value="out">Money out</option>
                </select>
              </div>
              <div>
                <label className="v2-label">Amount (₹)</label>
                <input
                  className="v2-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      amount: Math.abs(Number(e.target.value)),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="v2-label">Description</label>
              <input
                className="v2-input"
                value={draft.particulars}
                onChange={(e) =>
                  setDraft({ ...draft, particulars: e.target.value })
                }
              />
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              }}
            >
              <div>
                <label className="v2-label">Counterparty</label>
                <input
                  className="v2-input"
                  value={draft.counterparty}
                  onChange={(e) =>
                    setDraft({ ...draft, counterparty: e.target.value })
                  }
                  placeholder="Who paid or was paid"
                />
              </div>
              <div>
                <label className="v2-label">Reference</label>
                <input
                  className="v2-input"
                  value={draft.reference}
                  onChange={(e) =>
                    setDraft({ ...draft, reference: e.target.value })
                  }
                  placeholder="UTR, cheque or invoice no."
                />
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: V.muted }}>
              {draft.direction === "out" ? "Money out" : "Money in"} of{" "}
              {formatINR(draft.amount)} on{" "}
              {draft.date ? formatDate(draft.date) : "no date"}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="v2-btn v2-btn-primary"
                onClick={() => confirm(false)}
              >
                Confirm
              </button>
              <button
                className="v2-btn v2-btn-ghost"
                onClick={() => confirm(true)}
              >
                Save edits and confirm
              </button>
              <button
                className="v2-btn v2-btn-ghost"
                onClick={() => {
                  resolveReview(open.id, "discarded");
                  toast.success("Item discarded");
                  setOpen(null);
                }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
