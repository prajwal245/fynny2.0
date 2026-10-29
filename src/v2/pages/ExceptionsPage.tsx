import { useEffect, useMemo, useState } from "react";
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
import { openExceptions } from "../lib/exceptions";
import { ZohoPostPanel } from "../components/ZohoPost";
import { BooksExportButton, BooksExportDrawer, BX_STYLES, SYSTEM_LABEL, SystemLogo, useBooksFor } from "../components/BooksExport";
import type { BooksSystem } from "@/lib/practice/zohoExport";

/**
 * Exception Queue. Cross-client as a page; the client's Exceptions tab when
 * given a clientId. Only matched transactions reach the MIS, so every open
 * item here is either matched by a person, resolved elsewhere, or ignored.
 */
export default function ExceptionsPage({
  clientId: scopedClient,
  focusTxnId,
  onFocused,
}: { clientId?: string; focusTxnId?: string; onFocused?: () => void } = {}) {
  const { exceptions, clients, clientName, setExceptionStatus, reopenException, runs, docs, period } =
    useV2();
  // The queue follows the period in the top bar; "All periods" shows everything.
  const [scope, setScope] = useState<"period" | "all">("period");
  const [confirmAction, setConfirmAction] = useState<null | "ignore" | "reconciled_external">(null);
  const [client, setClient] = useState(scopedClient ?? "all");
  const [reason, setReason] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [exportFor, setExportFor] = useState<BooksSystem | null>(null);
  const [note, setNote] = useState("");
  const [actError, setActError] = useState<string | null>(null);

  const reconRunning = runs.some((r) => r.agent === "recon" && r.status === "running");
  const inScope = (e: (typeof exceptions)[number]) =>
    (client === "all" || e.clientId === client) && (scope === "all" || monthOf(e.date) === period);
  // Same rule as the sidebar badge: a failed bank line and its book twin are one decision.
  const allOpen = openExceptions(exceptions).filter((e) => client === "all" || e.clientId === client);
  const openInScope = allOpen.filter(inScope);
  const list = openInScope.filter((e) => reason === "all" || e.reason === reason);
  const decided = exceptions.filter((e) => e.status !== "open" && inScope(e));
  const active = exceptions.find((e) => e.id === openId) ?? null;
  // Entries already matched elsewhere are never offered again.
  const matchedIds = useMemo(
    () => new Set(docs.flatMap((d) => d.rows).filter((r) => r.id && r.matchStatus === "matched").map((r) => r.id as string)),
    [docs],
  );
  const liveCandidates = (e: Exception) =>
    e.candidates
      .map((label, i) => ({ label, id: e.candidateIds?.[i], amount: e.candidateAmounts?.[i] }))
      .filter((c) => !c.id || !matchedIds.has(c.id))
      // Never suggest an entry at less than half or more than double the amount (stored before this rule).
      .filter((c) => c.amount === undefined || !e.amount || (Math.abs(c.amount) / Math.abs(e.amount) >= 0.5 && Math.abs(c.amount) / Math.abs(e.amount) <= 2));

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
    setPicked(liveCandidates(e).filter((c) => c.id).slice(0, 1).map((c) => c.id as string));
    setNote("");
    setActError(null);
  };
  // Opened from a line elsewhere (Recon tab "Match"): open that line's drawer straight away.
  useEffect(() => {
    if (!focusTxnId) return;
    const open = exceptions.filter((e) => e.status === "open");
    const hit = open.find((e) => e.txnId === focusTxnId) ?? open.find((e) => e.candidateIds?.includes(focusTxnId));
    if (hit) {
      if (monthOf(hit.date) !== period) setScope("all");
      openItem(hit);
    }
    onFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTxnId]);
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
    if (action === "match" && !ids?.length) {
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
    // Close at once so the result (and its Undo) is in view; reopen with the reason if it is refused.
    const keepNote = note;
    const keepPicked = picked;
    close();
    const error = await setExceptionStatus(
      e.id,
      action === "ignore" ? "ignored" : "resolved",
      action === "ignore"
        ? { note: keepNote }
        : { action, counterpartIds: ids, note: keepNote || undefined, allowDifference: action === "match" && differs },
    );
    if (error) {
      setOpenId(e.id);
      setNote(keepNote);
      setPicked(keepPicked);
      setActError(error);
      return;
    }
    toast.success(
      action === "match"
        ? "Matched. It now counts in the MIS."
        : action === "ignore"
          ? "Ignored. It stays out of the MIS."
          : "Marked as reconciled outside FynHelp.",
      { action: { label: "Undo", onClick: () => void reopenException(e.id) }, duration: 8000 },
    );
  };
  // Matching from the table is only offered when the suggestion is for the same amount.
  const safeMatch = (e: Exception) => {
    const c = liveCandidates(e)[0];
    return Boolean(c?.id) && c.amount !== undefined && Math.abs(Math.abs(c.amount) - Math.abs(e.amount)) < 0.01;
  };

  return (
    <>
      <style>{BX_STYLES}</style>
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
          <option value="period">{period} · {allOpen.filter((e) => monthOf(e.date) === period).length} open</option>
          <option value="all">All periods · {allOpen.length} open</option>
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
        <span style={{ marginLeft: "auto" }}>
          <BooksExportButton clientId={client} allPeriods={scope === "all"} />
        </span>
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
          <table className="v2-table v2-table-stack">
            <thead>
              <tr>
                {!scopedClient && <th>Client</th>}
                <th>Reason</th>
                <th className="v2-hide-md">Side</th>
                <th style={{ minWidth: 220 }}>Narration</th>
                <th>Amount</th>
                <th>Date</th>
                <th className="v2-hide-md">Best candidate</th>
                <th className="v2-sticky-end" />
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
                      <Badge tone="warn">{e.reason}</Badge>{e.precedent && <span title="The Recon agent learned a decision for this line" style={{ marginLeft: 6 }}><Badge tone="info">Learned</Badge></span>}
                    </td>
                    <td className="v2-hide-md" style={{ color: V.body }}>
                      {e.side === "books" ? "Books" : "Bank"}
                    </td>
                    <td style={{ color: V.body }}>
                      <span className="v2-mono" style={{ fontSize: 13 }}>{e.narration}</span>
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
                    <td className="v2-hide-md" style={{ color: V.body, fontSize: 12.5 }}>
                      {liveCandidates(e)[0]?.label ?? "No candidate found"}
                    </td>
                    <td className="v2-sticky-end">
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
                            className="bx-btn bx-sm bx-primary"
                            title="Match with the suggested entry (same amount)"
                            onClick={() => void act(e, "match", [liveCandidates(e)[0].id as string])}
                          >
                            Match
                          </button>
                        )}
                        <button
                          className="bx-btn bx-sm"
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

            {active.status === "open" && active.side !== "books" && <ExportHint clientId={active.clientId} onOpen={(sys) => setExportFor(sys)} />}
            {active.status === "open" && <ZohoPostPanel clientId={active.clientId} txnId={active.txnId} side={active.side} open={!!active} />}

            <div>
              <label className="v2-label">Suggested by the Recon agent</label>
              {liveCandidates(active).length === 0 ? (
                <div style={{ fontSize: 13, color: V.muted }}>
                  {active.candidates.length ? "The suggested entry has since been matched to another line. Pick from the other entries below." : "No close candidate was found."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {liveCandidates(active).map(({ label: c, id }) => {
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

            {active.precedent && (
              <div data-testid="learned-decision" style={{ background: V.cream, borderLeft: `3px solid ${V.brand}`, borderRadius: 12, padding: "10px 12px", fontSize: 13, display: "grid", gap: 8 }}>
                <div>
                  <b>Learned from your team:</b> {active.precedent.by ? <><b>{active.precedent.by}</b> </> : "this line was "}{active.precedent.by ? (active.precedent.action === "ignore" ? "ignored this line" : "marked this line reconciled elsewhere") : (active.precedent.action === "ignore" ? "ignored" : "marked reconciled elsewhere")}
                  {active.precedent.times > 1 ? ` ${active.precedent.times} times` : ""}, last on {formatDate(active.precedent.at.slice(0, 10))}
                  {active.precedent.note ? <> with the note "{active.precedent.note}"</> : null}. Nothing is applied until you confirm.
                </div>
                <div>
                  <button
                    className="v2-btn v2-btn-quiet"
                    onClick={() => {
                      setNote(active.precedent!.note || "Same as last month");
                      setConfirmAction(active.precedent!.action === "ignore" ? "ignore" : "reconciled_external");
                    }}
                  >
                    Use the same decision
                  </button>
                </div>
              </div>
            )}

            {actError && (
              <div role="alert" data-testid="exception-error" style={{ background: V.warnBg, color: V.maroon, borderRadius: 12, padding: "10px 12px", fontSize: 13 }}>
                Not saved: {actError}
              </div>
            )}

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
      {active && <BooksExportDrawer open={exportFor !== null} onClose={() => setExportFor(null)} clientId={active.clientId} allPeriods={scope === "all"} initialSystem={exportFor ?? undefined} similarTo={{ amount: active.amount, narration: active.narration }} />}
    </>
  );
}

/** Inside an exception: one button per connected books system, with its logo. */
function ExportHint({ clientId, onOpen }: { clientId: string; onOpen: (s: BooksSystem) => void }) {
  const connected = useBooksFor(clientId);
  const shown: BooksSystem[] = connected.length ? connected : ["zoho", "tally"];
  if (!connected.ready) return null;
  return (
    <div className="bx-hint" role="note">
      <style>{BX_STYLES}</style>
      <strong>Not in the books yet?</strong>
      <p>Add it in {shown.map((s) => SYSTEM_LABEL[s]).join(" or ")}, or download this line and the ones like it as a file ready to import.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {shown.map((s) => (
          <button key={s} className="bx-btn bx-primary" onClick={() => onOpen(s)}>
            <SystemLogo system={s} size={18} />Export this and similar lines to {SYSTEM_LABEL[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
