/**
 * The polling fallback for jobs left running (and the only path when no webhook is configured): finds documents with a pending job,
 * asks the vendor, and when a job has finished stores its result and reads the document again. Does nothing unless the fallback is on.
 */
import type { Db } from "../../db.server";
import { createHttpClient, type UnsilodClient } from "./client";
import { readUnsilodConfig } from "./config";

const MAX_AGE_MS = 24 * 3_600_000;

export async function sweepPendingJobs(
  db: Db,
  opts: {
    env?: Record<string, string | undefined>;
    client?: UnsilodClient;
    limit?: number;
    now?: Date;
    reprocess?: (id: string) => Promise<unknown>;
  } = {},
) {
  const cfg = readUnsilodConfig(opts.env);
  if (!cfg.enabled) return { skipped: "off" as const };
  const client = opts.client ?? createHttpClient(cfg);
  const now = opts.now ?? new Date();
  const { data, error } = await db
    .from("ca_document_extractions")
    .select("id, extracted:extracted")
    .not("extracted->parser_fallback_pending", "is", null)
    .limit(opts.limit ?? 5);
  if (error) return { skipped: "unreadable" as const };
  let finished = 0;
  let cleared = 0;
  for (const d of (data ?? []) as {
    id: string;
    extracted: Record<string, unknown> | null;
  }[]) {
    const pending = (d.extracted?.["parser_fallback_pending"] ?? null) as {
      job_id?: string;
      tier?: "fast" | "lite";
      at?: string;
    } | null;
    if (!pending?.job_id) continue;
    const drop = async () => {
      const { parser_fallback_pending: _p, ...rest } = d.extracted ?? {};
      void _p;
      await db
        .from("ca_document_extractions")
        .update({ extracted: rest })
        .eq("id", d.id);
      cleared += 1;
    };
    try {
      const res = await client.fetchJob(pending.job_id);
      if (res.pending) {
        if (pending.at && now.getTime() - Date.parse(pending.at) > MAX_AGE_MS)
          await drop();
        continue;
      }
      if (!res.markdown) {
        await drop();
        continue;
      }
      const extracted = {
        ...(d.extracted ?? {}),
        parser_fallback_result: {
          tier: pending.tier ?? "fast",
          markdown: res.markdown,
          credits_used: res.creditsUsed,
          pages: res.pages,
          job_id: pending.job_id,
        },
      };
      await db
        .from("ca_document_extractions")
        .update({ extracted })
        .eq("id", d.id);
      const run =
        opts.reprocess ??
        (async (id: string) =>
          (await import("../../documents.server")).processExtraction(db, id, {
            trigger: "retry",
          }));
      await run(d.id);
      finished += 1;
    } catch {
      // A failed or cancelled job ends here; the document keeps its primary result.
      await drop().catch(() => undefined);
    }
  }
  return { finished, cleared };
}
