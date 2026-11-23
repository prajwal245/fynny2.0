/** Credits used by the fallback, read from what each document recorded about itself, plus what this process has spent but not yet saved. */
import type { Db } from "../../db.server";
import { dayKey, memoryLedger, type CreditLedger } from "./limits";

const process_ = memoryLedger();

export function dbLedger(db: Db, firmId: string): CreditLedger {
  return {
    async used(now) {
      const month = dayKey(now).slice(0, 7);
      const { data, error } = await db
        .from("ca_document_extractions")
        .select(
          "fb:extracted->parser_fallback, pend:extracted->parser_fallback_pending",
        )
        .eq("ca_firm_id", firmId)
        .or(
          "extracted->parser_fallback.not.is.null,extracted->parser_fallback_pending.not.is.null",
        )
        .limit(5000);
      // If the ledger cannot be read, the fallback must not spend: this throws and the caller fails open.
      if (error) throw new Error(`credit ledger unreadable: ${error.message}`);
      let day = 0;
      let mon = 0;
      for (const r of (data ?? []) as {
        fb: { credit_used?: number; day?: string } | null;
        pend: { credits_estimate?: number; day?: string } | null;
      }[]) {
        for (const [credits, d] of [
          [r.fb?.credit_used, r.fb?.day],
          [r.pend?.credits_estimate, r.pend?.day],
        ] as const) {
          if (typeof credits !== "number" || typeof d !== "string") continue;
          if (d.slice(0, 7) === month) mon += credits;
          if (d === dayKey(now)) day += credits;
        }
      }
      const local = await process_.used(now);
      return { day: day + local.day, month: mon + local.month };
    },
    async record(credits, now) {
      await process_.record(credits, now);
    },
  };
}
