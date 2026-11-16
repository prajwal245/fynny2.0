import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Segmented, Stat, V, formatDate } from "../ui";
import { useV2 } from "../store";
import { parsePeriod } from "@/lib/practice/core";
import { getPracticePortfolioClose } from "@/lib/practice/practice.functions";
import { CLOSE_LABEL, dueOn, overdueSteps, type StepState } from "@/lib/practice/close/steps";
import { STATE_TONE } from "../components/CloseChecklist";

type Row = Awaited<ReturnType<typeof getPracticePortfolioClose>>[number];
type Filter = "all" | "attention" | "bank_books_closed" | "fully_closed" | "not_started";

const pending = (r: Row) => r.steps.filter((s) => s.status !== "done");
const today = () => new Date().toISOString().slice(0, 10);

/** Portfolio close: every client's month at a glance, the 7th / 11th / 20th due dates, and who is behind. */
export default function ClosePage() {
  const { period, clients } = useV2();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  let key = "";
  try { key = parsePeriod(period).key; } catch { key = ""; }

  const load = useCallback(async () => {
    if (!key) return;
    try {
      setRows(await getPracticePortfolioClose({ data: { period: key } }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the close status.");
    }
  }, [key]);
  useEffect(() => { void load(); }, [load, clients.length]);

  const now = today();
  const late = (r: Row) => overdueSteps(r.steps as StepState[], now).length;
  const stats = useMemo(() => {
    const all = rows ?? [];
    // The three dates a CA works to: statements, reconciliation and TDS by the 7th, GSTR-1 on the 11th, GSTR-3B, provisions and the MIS by the 20th.
    const by = (day: number, keys?: string[]) => all.filter((r) => r.steps.some((s) => s.status !== "done" && (keys ? keys.includes(s.key) : s.dueOn === dueOn(key, day)))).length;
    return {
      total: all.length,
      bankBooks: all.filter((r) => r.state === "bank_books_closed" || r.state === "fully_closed").length,
      full: all.filter((r) => r.state === "fully_closed").length,
      d7: by(7),
      d11: by(11, ["gst"]),
      d20: by(20),
      behind: all.filter((r) => late(r) > 0).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key]);

  const shown = (rows ?? []).filter((r) => (filter === "all" ? true : filter === "attention" ? late(r) > 0 : r.state === filter));
  // Behind first, then the least complete.
  const ordered = [...shown].sort((a, b) => late(b) - late(a) || a.done - b.done || a.name.localeCompare(b.name));

  if (!key) return <EmptyState title="Pick a single month" description="Choose a month in the top bar to see how every client's close is going." />;

  return (
    <>
      <PageHeader title="Month-end close" subtitle={`Where every client stands for ${period}. Bank and Books Closed is what FynHelp can check; Fully Closed also needs GST, TDS, provisions, the MIS review and partner sign-off confirmed by people.`} />
      {error && <p style={{ color: V.maroon, fontSize: 13 }}>{error}</p>}
      {!rows && !error && <p style={{ color: V.muted, fontSize: 13 }}>Reading every client's month…</p>}
      {rows && (
        <>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 18 }}>
            <Stat label="Bank and books closed" value={`${stats.bankBooks} / ${stats.total}`} hint="statements verified, reconciled, exceptions explained" tone={stats.total && stats.bankBooks === stats.total ? "good" : "neutral"} />
            <Stat label="Fully closed" value={`${stats.full} / ${stats.total}`} hint="everything confirmed and signed off" tone={stats.total && stats.full === stats.total ? "good" : "neutral"} />
            <Stat label="Behind" value={String(stats.behind)} hint="a step is past its due date" tone={stats.behind ? "bad" : "good"} onClick={() => setFilter("attention")} />
          </div>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginBottom: 20 }} data-testid="due-dates">
            {[
              { day: 7, n: stats.d7, what: "Statements, reconciliation, exceptions and TDS" },
              { day: 11, n: stats.d11, what: "GST: GSTR-1" },
              { day: 20, n: stats.d20, what: "GSTR-3B, provisions and the MIS" },
            ].map((d) => (
              <Card key={d.day}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", color: V.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}><CalendarClock size={14} /> By the {d.day}th · {formatDate(dueOn(key, d.day))}</div>
                <div className="num" style={{ fontSize: 26, fontWeight: 600, marginTop: 8, color: d.n ? V.ink : V.green }}>{d.n ? `${d.n} client${d.n === 1 ? "" : "s"} pending` : "All clear"}</div>
                <div style={{ fontSize: 12.5, color: V.muted, marginTop: 4 }}>{d.what}</div>
              </Card>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <Segmented
              label="Filter clients"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: rows.length },
                { value: "attention", label: "Behind", count: stats.behind },
                { value: "not_started", label: "Not started", count: rows.filter((r) => r.state === "not_started").length },
                { value: "bank_books_closed", label: "Bank and Books Closed", count: rows.filter((r) => r.state === "bank_books_closed").length },
                { value: "fully_closed", label: "Fully Closed", count: stats.full },
              ]}
            />
          </div>

          {ordered.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={22} />} title={rows.length === 0 ? "No clients yet" : "No client matches this filter"} description={rows.length === 0 ? "Add a client and upload a bank statement to start a close." : "Try another filter."} />
          ) : (
            <Card style={{ padding: 0 }} className="v2-scroll">
              <table className="v2-table" style={{ width: "100%", minWidth: 860 }}>
                <thead>
                  <tr><th>Client</th><th>State</th><th style={{ width: 200 }}>Progress</th><th>Next step</th><th>Due</th></tr>
                </thead>
                <tbody>
                  {ordered.map((r, i) => {
                    const next = pending(r)[0];
                    const behind = late(r);
                    return (
                      <motion.tr key={r.businessId} className="clickable" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }} onClick={() => void nav({ to: "/app/clients/$clientId", params: { clientId: r.businessId }, search: { tab: "close" } as never })}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td><Badge tone={STATE_TONE[r.state]}>{CLOSE_LABEL[r.state]}</Badge></td>
                        <td>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 999, background: V.gray, overflow: "hidden" }}><div style={{ width: `${(r.done / r.total) * 100}%`, height: "100%", background: r.state === "fully_closed" ? V.green : V.brand }} /></div>
                            <span className="num" style={{ fontSize: 12, color: V.muted }}>{r.done}/{r.total}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: V.body }}>{next ? next.label : "Nothing left"}</td>
                        <td className="num" style={{ fontSize: 13, color: behind ? V.maroon : V.body, fontWeight: behind ? 600 : 400 }}>{next ? `${formatDate(next.dueOn)}${behind ? ` · ${behind} late` : ""}` : ""}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
