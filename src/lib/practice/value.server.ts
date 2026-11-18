/** Reads the counts behind the month's value card. Firm-wide, or for one client. Counts only; every number comes from the database. */
import { parsePeriod } from "./core";
import type { Db, FirmContext } from "./db.server";
import { isExplained } from "./exceptionKinds";
import { valueFrom, type ValueSummary } from "./value";

export async function periodValue(db: Db, ctx: FirmContext, periodInput: string | { start: string; end: string }, businessId?: string | null, secondsPerLine?: number): Promise<ValueSummary> {
  const p = parsePeriod(periodInput);
  // Bank lines of the month, all of them, those set aside as an own-account transfer, and those set aside as a reversed payment.
  const bank = (tag?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = db.from("ca_txns").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("side", "bank").gte("txn_date", p.start).lte("txn_date", p.end);
    if (businessId) q = q.eq("business_id", businessId);
    return tag ? q.like("recon_tag", tag) : q;
  };
  const [all, own, rev] = await Promise.all([bank(), bank("own_account:%"), bank("reversal:%")]);
  let mq = db.from("ca_recon_matches").select("match_stage").eq("ca_firm_id", ctx.firmId).lte("period_start", p.end).gte("period_end", p.start);
  if (businessId) mq = mq.eq("business_id", businessId);
  const { data: matches } = await mq.limit(20000);
  const stages = ((matches ?? []) as { match_stage: string }[]).map((m) => m.match_stage);
  const manualMatched = stages.filter((s) => s === "manual").length;
  const autoMatched = stages.length - manualMatched;

  let eq = db.from("ca_exceptions").select("txn_id, txn_side, candidates, work_status").eq("ca_firm_id", ctx.firmId).eq("status", "open").gte("period_start", p.start).lte("period_end", p.end);
  if (businessId) eq = eq.eq("business_id", businessId);
  const { data: exc } = await eq.limit(20000);
  type E = { txn_id: string; txn_side: string; candidates: { txn_id?: string }[] | null; work_status: string | null };
  const open = (exc ?? []) as E[];
  // The same rule as the queue and the close: a bank line and its book entry are one decision, and an explained one is not counted.
  const bankFirst = new Map(open.filter((e) => e.txn_side !== "books").map((e) => [String(e.txn_id), e.candidates?.[0]?.txn_id]));
  const decisions = open.filter((e) => !(e.txn_side === "books" && e.candidates?.[0]?.txn_id && bankFirst.get(String(e.candidates[0].txn_id)) === String(e.txn_id)));
  const decisionsLeft = decisions.filter((e) => !isExplained(e.work_status)).length;

  return valueFrom({ bankLines: all.count ?? 0, autoMatched, manualMatched, setAside: (own.count ?? 0) + (rev.count ?? 0), decisionsLeft, secondsPerLine });
}
