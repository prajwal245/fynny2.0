/**
 * Writing approved bank lines into Tally, server side.
 *
 * Safety rules, all enforced here:
 *  - a line is queued only when a partner/manager approves it with an EXISTING ledger;
 *  - a bank line can be queued once (database unique index) and carries a fixed REMOTEID;
 *  - the connector only claims queued lines, one attempt each; a line whose result never came back
 *    is NOT retried automatically (Tally may already have it): it is marked failed for a person to check;
 *  - nothing is created in Tally except vouchers here. A new ledger is a separate, approved request
 *    (tallyLedgerRequests.server.ts) that the connector reads back from Tally before it counts.
 */
import { PracticeError } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import type { ConnectorRow } from "./tallyConnector.server";
import {
  importProblems,
  importVoucherXml,
  parseImportReply,
  problemsWith,
  type ApprovedLine,
  type Split,
} from "./tallyVoucher";
import { isPartyGroup, versionAtLeast } from "./tallyConnector";
import { pagesForDocument } from "./billing/pageCredits";
import { suggestLedger } from "./tallyLedgerSuggest";
import { CREATABLE_GROUPS } from "./tallyLedgerCreate";

/** A claimed line not reported back within this time is treated as interrupted. */
export const LEASE_MINUTES = 10;
export const MAX_CLAIM = 10;
const MAX_LEDGERS = 20_000;

/** Bank and cash ledgers of a company, by their Tally group. Used to tell a Contra from a Receipt or Payment. */
const isBankGroup = (parent: string | null | undefined) =>
  /bank|cash/i.test(parent ?? "");

const canApprove = (ctx: FirmContext) =>
  ["owner", "admin", "partner", "manager"].includes(ctx.role);

/* ── ledgers read from Tally ──────────────────────────────── */

export async function ingestLedgers(
  db: Db,
  c: ConnectorRow,
  company: string,
  raw: unknown,
) {
  if (!Array.isArray(raw))
    throw new PracticeError("bad_ledgers", "The ledger list is missing.");
  const seen = new Map<string, string | null>();
  for (const r of raw.slice(0, MAX_LEDGERS)) {
    const o = (r ?? {}) as { name?: unknown; parent?: unknown };
    const name =
      typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > 200) continue;
    seen.set(
      name,
      typeof o.parent === "string"
        ? o.parent.trim().slice(0, 120) || null
        : null,
    );
  }
  if (!seen.size) return { stored: 0 };
  const { data: co } = await db
    .from("ca_tally_companies")
    .select("id")
    .eq("connector_id", c.id)
    .eq("company_name", company)
    .maybeSingle();
  if (!co)
    throw new PracticeError(
      "unknown_company",
      "That Tally company is not known to this connector.",
    );
  const now = new Date().toISOString();
  const rows = [...seen].map(([name, parent]) => ({
    ca_firm_id: c.ca_firm_id,
    company_id: co.id as string,
    name,
    parent,
    synced_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("ca_tally_ledgers")
      .upsert(rows.slice(i, i + 500), { onConflict: "company_id,name" });
    if (error) throw new PracticeError("db_error", error.message);
  }
  // Ledgers deleted in Tally disappear here too, so a stale name can never be written to.
  await db
    .from("ca_tally_ledgers")
    .delete()
    .eq("company_id", co.id as string)
    .lt("synced_at", now);
  return { stored: rows.length };
}

async function companyFor(db: Db, ctx: FirmContext, businessId: string) {
  const { data } = await db
    .from("ca_tally_companies")
    .select("id, company_name, last_synced_at, connector_id")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data as {
    id: string;
    company_name: string;
    last_synced_at: string | null;
    connector_id: string;
  } | null;
}

/* ── what the team sees ───────────────────────────────────── */

export interface PostingView {
  txn_id: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  suggestion: ReturnType<typeof suggestLedger>;
  posting: {
    id: string;
    status: string;
    party_ledger: string;
    last_error: string | null;
  } | null;
}

export async function workbench(db: Db, ctx: FirmContext, businessId: string, documentId?: string | null) {
  const co = await companyFor(db, ctx, businessId);
  if (!co) return { linked: false as const };
  const { data: lg } = await db
    .from("ca_tally_ledgers")
    .select("name, parent")
    .eq("company_id", co.id)
    .order("name");
  const ledgers = (lg ?? []) as { name: string; parent: string | null }[];
  const { data: con } = await db
    .from("ca_tally_connectors")
    .select("last_seen_at, agent_version")
    .eq("id", co.connector_id)
    .maybeSingle();
  const { data: txns } = await db
    .from("ca_txns")
    .select(
      "id, txn_date, direction, amount, counterparty, description, reference, match_status",
    )
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("side", "bank")
    .in("match_status", ["unmatched", "exception"])
    .order("txn_date")
    .limit(500);
  const ids = (txns ?? []).map((t) => t.id as string);
  const { data: posts } = ids.length
    ? await db
        .from("ca_tally_postings")
        .select("id, txn_id, status, party_ledger, last_error")
        .in("txn_id", ids)
        .in("status", ["queued", "sent", "posted", "failed"])
    : {
        data: [] as {
          id: string;
          txn_id: string;
          status: string;
          party_ledger: string;
          last_error: string | null;
        }[],
      };
  const byTxn = new Map((posts ?? []).map((p) => [p.txn_id as string, p]));
  const names = ledgers.map((l) => l.name);
  const bankNames = ledgers
    .filter((l) => /bank|cash/i.test(l.parent ?? ""))
    .map((l) => l.name);
  const lines: PostingView[] = (txns ?? []).map((t) => {
    const p = byTxn.get(t.id as string);
    return {
      txn_id: t.id as string,
      date: t.txn_date as string,
      direction: t.direction as "in" | "out",
      amount: Number(t.amount),
      counterparty: (t.counterparty as string | null) ?? null,
      description: (t.description as string | null) ?? null,
      reference: (t.reference as string | null) ?? null,
      suggestion: suggestLedger(
        {
          counterparty: t.counterparty as string | null,
          description: t.description as string | null,
          reference: t.reference as string | null,
          direction: t.direction as "in" | "out",
        },
        names,
        bankNames[0],
      ),
      posting: p
        ? {
            id: p.id as string,
            status: p.status as string,
            party_ledger: p.party_ledger as string,
            last_error: (p.last_error as string | null) ?? null,
          }
        : null,
    };
  });
  return {
    linked: true as const,
    company: co.company_name,
    connectorSeenAt: (con?.last_seen_at as string | null) ?? null,
    lastSyncedAt: co.last_synced_at,
    ledgers,
    bankLedgers: bankNames,
    lines,
    // Creating a ledger in Tally: the groups offered, what is already asked for, and whether the connector can do it.
    groups: CREATABLE_GROUPS,
    ledgerRequests: await (await import("./tallyLedgerRequests.server")).openLedgerRequests(db, ctx, co.id),
    canCreateLedgers: versionAtLeast((con?.agent_version as string | null) ?? null, "1.5.0"),
    // The reconciliation as a person reads it: statement beside Tally, tagged, with debit and credit apart.
    view: await (async () => {
      const { data: allPosts } = await db.from("ca_tally_postings").select("txn_id, status").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).in("status", ["queued", "sent", "posted"]);
      return (await import("./tallyReconView.server")).reconView(db, ctx, businessId, {
        documentId: documentId ?? null,
        bankLedgers: bankNames,
        postedByTxn: new Map(((allPosts ?? []) as { txn_id: string; status: string }[]).map((x) => [x.txn_id, x.status])),
      });
    })(),
  };
}

/* ── approve, cancel, retry ───────────────────────────────── */

export async function approvePosting(
  db: Db,
  ctx: FirmContext,
  input: {
    txnId: string;
    partyLedger: string;
    bankLedger: string;
    kind?: "Contra";
    splits?: Split[] | null;
    /** The person has confirmed the statement belongs to this bank ledger, or that Tally does not already hold this entry. */
    confirmBank?: boolean;
    confirmNotDuplicate?: boolean;
  },
) {
  if (!canApprove(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or manager can approve entries for Tally.",
    );
  const billing = await import("./billing.server");
  if (!(await billing.firmCanWork(db, ctx.firmId)))
    throw new PracticeError(
      "paused",
      "The trial or plan has ended. New work is paused.",
    );
  const { data: t } = await db
    .from("ca_txns")
    .select(
      "id, business_id, extraction_id, side, direction, amount, txn_date, counterparty, description, reference, match_status",
    )
    .eq("id", input.txnId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!t || t.side !== "bank" || !t.business_id)
    throw new PracticeError("not_found", "That bank line was not found.");
  if (!["unmatched", "exception"].includes(t.match_status as string))
    throw new PracticeError(
      "already_matched",
      "This line is already matched to an entry in Tally. Nothing to post.",
    );
  const co = await companyFor(db, ctx, t.business_id as string);
  if (!co)
    throw new PracticeError(
      "no_company",
      "Link this client to a Tally company first.",
    );
  const { data: lg } = await db
    .from("ca_tally_ledgers")
    .select("name, parent")
    .eq("company_id", co.id);
  const existing = (lg ?? []).map((l) => l.name as string);
  const bankLike = (lg ?? [])
    .filter((l) => isBankGroup(l.parent as string | null))
    .map((l) => l.name as string);
  const line: ApprovedLine = {
    id: `fh-${t.id}`,
    company: co.company_name,
    date: t.txn_date as string,
    direction: t.direction as "in" | "out",
    amount: Number(t.amount),
    bankLedger: input.bankLedger,
    partyLedger: input.partyLedger,
    narration: String(t.description ?? t.counterparty ?? "").slice(0, 240),
    reference: (t.reference as string | null) ?? null,
    kind: input.kind === "Contra" ? "Contra" : undefined,
    splits: input.splits?.length ? input.splits : null,
  };
  const problems = problemsWith(line, existing, bankLike);
  if (problems.length) throw new PracticeError("not_allowed", problems[0]);
  // A statement that seems to belong to another account, or an entry Tally seems to hold already, waits for a person's word.
  const hold = await (await import("./tallyReconView.server")).approvalHolds(
    db,
    ctx,
    { business_id: t.business_id as string, extraction_id: (t.extraction_id as string | null) ?? null, direction: line.direction, amount: line.amount, txn_date: line.date },
    input.bankLedger,
    { bank: input.confirmBank, notDuplicate: input.confirmNotDuplicate },
  );
  if (hold) throw new PracticeError(hold.code, hold.message);
  // Pages for this document, taken once however many of its lines are approved. Short of pages: nothing is queued.
  let charged = false;
  if (t.extraction_id) {
    const { count } = await db
      .from("ca_txns")
      .select("id", { count: "exact", head: true })
      .eq("extraction_id", t.extraction_id as string);
    const pages = pagesForDocument({ rows: count ?? 0 });
    const spend = await (
      await import("./billing/pageCredits.server")
    ).spendForDocument(db, ctx.firmId, t.extraction_id as string, pages);
    if (!spend.ok)
      throw new PracticeError(
        "no_pages",
        `This document needs ${spend.needed} page${spend.needed === 1 ? "" : "s"} and you have ${spend.balance}. Add pages in Settings, Billing, then approve again.`,
      );
    charged = spend.charged;
  }
  // Use the ledger's exact spelling from Tally, not what was typed.
  const exact = (n: string) =>
    existing.find((e) => e.trim().toLowerCase() === n.trim().toLowerCase()) ??
    n;
  const { data, error } = await db
    .from("ca_tally_postings")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: t.business_id,
      company_id: co.id,
      txn_id: t.id,
      line_key: `fh-${t.id}${await retrySuffix(db, t.id as string)}`,
      direction: line.direction,
      amount: line.amount,
      txn_date: line.date,
      bank_ledger: exact(line.bankLedger),
      party_ledger: exact(line.splits?.[0]?.ledger ?? line.partyLedger),
      voucher_kind: line.kind ?? null,
      splits: line.splits
        ? line.splits.map((x) => ({
            ledger: exact(x.ledger),
            amount: x.amount,
          }))
        : null,
      narration: line.narration,
      reference: line.reference,
      approved_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    // Not queued, so the pages taken for this document just now go back.
    if (charged && t.extraction_id)
      await (
        await import("./billing/pageCredits.server")
      ).refundDocument(db, ctx.firmId, t.extraction_id as string);
    if (/duplicate key/i.test(error.message))
      throw new PracticeError(
        "conflict",
        "This line has already been approved for Tally.",
      );
    throw new PracticeError("db_error", error.message);
  }
  await logActivity(
    db,
    ctx.firmId,
    t.business_id as string,
    "recon",
    `Approved for Tally: ${line.direction === "in" ? "receipt" : "payment"} of ₹${line.amount.toLocaleString("en-IN")} to "${exact(line.partyLedger)}".`,
  );
  return { id: data.id as string, status: "queued" };
}

/** A line whose earlier posting was cancelled or failed needs a fresh REMOTEID so Tally cannot confuse the two. */
async function retrySuffix(db: Db, txnId: string): Promise<string> {
  const { count } = await db
    .from("ca_tally_postings")
    .select("id", { count: "exact", head: true })
    .eq("txn_id", txnId);
  return count ? `-r${count}` : "";
}

export async function cancelPosting(db: Db, ctx: FirmContext, id: string) {
  if (!canApprove(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or manager can cancel an entry.",
    );
  const { data, error } = await db
    .from("ca_tally_postings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("ca_firm_id", ctx.firmId)
    .in("status", ["queued", "failed"])
    .select("id");
  if (error) throw new PracticeError("db_error", error.message);
  if (!data?.length)
    throw new PracticeError(
      "not_cancellable",
      "Only an entry that has not been sent to Tally can be cancelled.",
    );
  return { ok: true };
}

/* ── the connector's side ─────────────────────────────────── */

/** Queued lines for this connector's companies, each with its ready XML. Interrupted lines are held, not resent. */
export async function claimPostings(db: Db, c: ConnectorRow) {
  const nowMs = Date.now();
  const lease = new Date(nowMs - LEASE_MINUTES * 60_000).toISOString();
  const { data: cos } = await db
    .from("ca_tally_companies")
    .select("id, company_name")
    .eq("connector_id", c.id);
  const byId = new Map(
    (cos ?? []).map((x) => [x.id as string, x.company_name as string]),
  );
  if (!byId.size) return [];
  await db
    .from("ca_tally_postings")
    .update({
      status: "failed",
      last_error:
        "Tally did not confirm this entry. It may or may not have been created: check Tally for this voucher before trying again.",
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq("ca_firm_id", c.ca_firm_id)
    .eq("status", "sent")
    .lt("claimed_at", lease)
    .in("company_id", [...byId.keys()]);
  const { data: rows } = await db
    .from("ca_tally_postings")
    .select(
      "id, company_id, line_key, direction, amount, txn_date, bank_ledger, party_ledger, narration, reference, voucher_kind, splits",
    )
    .eq("ca_firm_id", c.ca_firm_id)
    .eq("status", "queued")
    .in("company_id", [...byId.keys()])
    .order("approved_at")
    .limit(MAX_CLAIM);
  const out: { id: string; company: string; xml: string }[] = [];
  // Connectors from 1.4.0 read TallyPrime's own Import Data shape and read every entry back; older ones get the older shape.
  const { data: me } = await db
    .from("ca_tally_connectors")
    .select("agent_version")
    .eq("id", c.id)
    .maybeSingle();
  const format = versionAtLeast(
    (me?.agent_version as string | null) ?? null,
    "1.4.0",
  )
    ? "import-data"
    : "legacy";
  for (const r of rows ?? []) {
    const { data: lg } = await db
      .from("ca_tally_ledgers")
      .select("name, parent")
      .eq("company_id", r.company_id as string);
    const existing = (lg ?? []).map((l) => l.name as string);
    const bankLike = (lg ?? [])
      .filter((l) => isBankGroup(l.parent as string | null))
      .map((l) => l.name as string);
    const line: ApprovedLine = {
      id: r.line_key as string,
      company: byId.get(r.company_id as string)!,
      date: r.txn_date as string,
      direction: r.direction as "in" | "out",
      amount: Number(r.amount),
      bankLedger: r.bank_ledger as string,
      partyLedger: r.party_ledger as string,
      narration: (r.narration as string) ?? "",
      reference: (r.reference as string | null) ?? null,
      kind: r.voucher_kind === "Contra" ? "Contra" : undefined,
      splits: Array.isArray(r.splits) ? (r.splits as Split[]) : null,
      partyLedgerIsParty: (lg ?? []).some(
        (l) =>
          String(l.name).trim().toLowerCase() ===
            String(r.party_ledger).trim().toLowerCase() &&
          isPartyGroup(l.parent as string | null),
      ),
    };
    const problems = problemsWith(line, existing, bankLike);
    // The same soundness check the connector runs: nothing unbalanced or malformed is ever queued for Tally.
    if (!problems.length)
      problems.push(
        ...importProblems(importVoucherXml(line, format), line.company),
      );
    if (problems.length) {
      // The ledger was removed or renamed in Tally since approval: stop, do not write.
      await db
        .from("ca_tally_postings")
        .update({
          status: "failed",
          last_error: problems[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("status", "queued");
      continue;
    }
    // Claim exactly once: only the row still queued is moved.
    const { data: won } = await db
      .from("ca_tally_postings")
      .update({
        status: "sent",
        claimed_at: new Date().toISOString(),
        attempts: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .eq("status", "queued")
      .select("id");
    if (won?.length)
      out.push({
        id: r.id as string,
        company: line.company,
        xml: importVoucherXml(line, format),
      });
  }
  return out;
}

/** The connector reports what Tally answered. Only a clear single creation becomes "posted". */
export async function reportResult(
  db: Db,
  c: ConnectorRow,
  id: string,
  input: {
    reply?: unknown;
    error?: unknown;
    verified?: unknown;
    verifyNote?: unknown;
  },
) {
  const { data: p } = await db
    .from("ca_tally_postings")
    .select("id, ca_firm_id, company_id, status, business_id")
    .eq("id", id)
    .maybeSingle();
  if (!p || p.ca_firm_id !== c.ca_firm_id)
    throw new PracticeError("not_found", "Unknown entry.");
  const { data: co } = await db
    .from("ca_tally_companies")
    .select("connector_id")
    .eq("id", p.company_id as string)
    .maybeSingle();
  if (co?.connector_id !== c.id)
    throw new PracticeError("not_found", "Unknown entry.");
  if (p.status === "posted") return { status: "posted" };
  if (p.status !== "sent")
    throw new PracticeError(
      "bad_state",
      "This entry is not waiting for a result.",
    );
  const now = new Date().toISOString();
  const reply =
    typeof input.reply === "string" ? input.reply.slice(0, 20_000) : "";
  const err = typeof input.error === "string" ? input.error.slice(0, 300) : "";
  const res = reply ? parseImportReply(reply) : null;
  const note =
    typeof input.verifyNote === "string"
      ? input.verifyNote.replace(/\s+/g, " ").slice(0, 240)
      : "";
  // Tally said "created", but the connector read the voucher back and it did not match: hold it for a person, never call it done.
  if (res?.ok && input.verified === false) {
    const why = `Tally said it created this entry, but reading it back did not confirm it: ${note || "no detail"} Check Tally before approving it again.`;
    await db
      .from("ca_tally_postings")
      .update({
        status: "failed",
        last_error: why.slice(0, 300),
        tally_reply: reply.slice(0, 2000) || null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "sent");
    return { status: "failed" };
  }
  if (res?.ok) {
    // A connector from 1.4.0 reads the entry back; its note is kept with Tally's reply as the proof.
    const proof =
      input.verified === true && note
        ? `${reply.slice(0, 1700)}\n[verified] ${note}`
        : reply.slice(0, 2000);
    await db
      .from("ca_tally_postings")
      .update({
        status: "posted",
        posted_at: now,
        tally_reply: proof,
        last_error: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "sent");
    await logActivity(
      db,
      c.ca_firm_id,
      p.business_id as string,
      "recon",
      "An approved entry was written to Tally.",
    );
    // Read it back: ask the connector for a fresh Day Book at its next check-in, so Recon sees the new voucher and matches it.
    await db
      .from("ca_tally_connectors")
      .update({ sync_requested_at: now })
      .eq("id", c.id);
    return { status: "posted" };
  }
  const why =
    err ||
    res?.message ||
    (reply
      ? "Tally did not confirm that the entry was created."
      : "No answer from Tally.");
  await db
    .from("ca_tally_postings")
    .update({
      status: "failed",
      last_error: why.slice(0, 300),
      tally_reply: reply.slice(0, 2000) || null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "sent");
  return { status: "failed" };
}

/**
 * A person has checked Tally and the entry is there (for example after an interrupted write), so FynHelp should
 * stop treating it as unsent. Only a held (failed) line can be confirmed, and the note is kept in the history.
 */
export async function markPostedByHand(
  db: Db,
  ctx: FirmContext,
  id: string,
  note: string,
) {
  if (!canApprove(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or manager can confirm an entry.",
    );
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 200);
  if (clean.length < 3)
    throw new PracticeError(
      "note_needed",
      "Write a short note, for example 'Checked in Tally, voucher 245 is there'.",
    );
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("ca_tally_postings")
    .update({
      status: "posted",
      posted_at: now,
      last_error: null,
      resolved_note: clean,
      updated_at: now,
    })
    .eq("id", id)
    .eq("ca_firm_id", ctx.firmId)
    .eq("status", "failed")
    .select("business_id");
  if (error) throw new PracticeError("db_error", error.message);
  if (!data?.length)
    throw new PracticeError(
      "not_held",
      "Only an entry that is waiting for a check can be confirmed.",
    );
  await logActivity(
    db,
    ctx.firmId,
    data[0].business_id as string,
    "recon",
    `An entry was confirmed as already in Tally by hand: ${clean}`,
  );
  return { ok: true };
}
