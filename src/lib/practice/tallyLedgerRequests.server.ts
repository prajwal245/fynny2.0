/**
 * Creating a ledger in Tally, server side. One ledger per request, only when a partner or manager asks, and only
 * counted as created after the connector has read it back from Tally.
 */
import { PracticeError } from "./core";
import { logActivity, type Db, type FirmContext } from "./db.server";
import type { ConnectorRow } from "./tallyConnector.server";
import {
  cleanLedgerName,
  createLedgerXml,
  ledgerImportProblems,
  ledgerRequestProblems,
} from "./tallyLedgerCreate";
import { parseImportReply } from "./tallyVoucher";
import { versionAtLeast } from "./tallyConnector";

const LEASE_MINUTES = 10;
const MAX_CLAIM = 5;
/** The version of the connector that can create ledgers. Older ones never receive a request. */
export const LEDGER_CREATE_VERSION = "1.5.0";

const canApprove = (ctx: FirmContext) =>
  ["owner", "admin", "partner", "manager"].includes(ctx.role);

async function companyFor(db: Db, ctx: FirmContext, businessId: string) {
  // A client can be linked to more than one row (the same company reported by an old and a new connector, or two companies).
  // "Exactly one row" would then fail and the client would wrongly show as not linked, so take the most recently synced one.
  const { data: rows } = await db
    .from("ca_tally_companies")
    .select("id, company_name, connector_id")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const data = (rows ?? [])[0] ?? null;
  return data as {
    id: string;
    company_name: string;
    connector_id: string;
  } | null;
}

export interface LedgerRequestView {
  id: string;
  name: string;
  parent: string;
  status: string;
  last_error: string | null;
}

/** Requests of one client that are waiting, in progress or failed, for the approval screen. */
export async function openLedgerRequests(
  db: Db,
  ctx: FirmContext,
  companyId: string,
): Promise<LedgerRequestView[]> {
  const { data } = await db
    .from("ca_tally_ledger_requests")
    .select("id, name, parent, status, last_error")
    .eq("ca_firm_id", ctx.firmId)
    .eq("company_id", companyId)
    .in("status", ["queued", "sent", "failed"])
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as LedgerRequestView[];
}

export async function requestLedger(
  db: Db,
  ctx: FirmContext,
  input: {
    businessId: string;
    name: string;
    parent: string;
    allowSimilar?: boolean;
  },
) {
  if (!canApprove(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or manager can create a ledger in Tally.",
    );
  const co = await companyFor(db, ctx, input.businessId);
  if (!co)
    throw new PracticeError(
      "no_company",
      "Link this client to a Tally company first.",
    );
  const { data: con } = await db
    .from("ca_tally_connectors")
    .select("agent_version, is_active")
    .eq("id", co.connector_id)
    .maybeSingle();
  if (!con?.is_active)
    throw new PracticeError(
      "no_connector",
      "The connector for this company is not active.",
    );
  if (
    !versionAtLeast(
      (con.agent_version as string | null) ?? null,
      LEDGER_CREATE_VERSION,
    )
  )
    throw new PracticeError(
      "old_connector",
      `Creating ledgers needs connector ${LEDGER_CREATE_VERSION} or later. Download the latest setup file in Settings, TallyPrime, and run it on the Tally PC.`,
    );
  const { data: lg } = await db
    .from("ca_tally_ledgers")
    .select("name, parent")
    .eq("company_id", co.id);
  const name = cleanLedgerName(input.name);
  const parent = input.parent.trim();
  const problems = ledgerRequestProblems(
    { name, parent },
    (lg ?? []) as { name: string; parent: string | null }[],
    { allowSimilar: input.allowSimilar },
  );
  if (problems.length) throw new PracticeError("not_allowed", problems[0]!);
  // Held to the same check the connector makes, so a request that would be refused there is never queued.
  const xmlProblems = ledgerImportProblems(
    createLedgerXml(co.company_name, name, parent),
    co.company_name,
  );
  if (xmlProblems.length)
    throw new PracticeError("not_allowed", xmlProblems[0]!);
  const { data, error } = await db
    .from("ca_tally_ledger_requests")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: input.businessId,
      company_id: co.id,
      name,
      parent,
      requested_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message))
      throw new PracticeError(
        "conflict",
        `"${name}" has already been asked for. Wait for Tally, or look at the request below.`,
      );
    throw new PracticeError("db_error", error.message);
  }
  await logActivity(
    db,
    ctx.firmId,
    input.businessId,
    "recon",
    `Asked Tally to create the ledger "${name}" under ${parent}.`,
  );
  return { id: data.id as string, status: "queued" };
}

export async function cancelLedgerRequest(
  db: Db,
  ctx: FirmContext,
  id: string,
) {
  if (!canApprove(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or manager can cancel this.",
    );
  const { data, error } = await db
    .from("ca_tally_ledger_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("ca_firm_id", ctx.firmId)
    .in("status", ["queued", "failed"])
    .select("id");
  if (error) throw new PracticeError("db_error", error.message);
  if (!data?.length)
    throw new PracticeError(
      "not_cancellable",
      "Only a request that has not been sent to Tally can be cancelled.",
    );
  return { ok: true };
}

/* ── the connector's side ─────────────────────────────────── */

/** Queued ledger requests for this connector, each with its ready XML. Only a connector that can create ledgers gets any. */
export async function claimLedgerRequests(db: Db, c: ConnectorRow) {
  const { data: me } = await db
    .from("ca_tally_connectors")
    .select("agent_version")
    .eq("id", c.id)
    .maybeSingle();
  if (
    !versionAtLeast(
      (me?.agent_version as string | null) ?? null,
      LEDGER_CREATE_VERSION,
    )
  )
    return [];
  const { data: cos } = await db
    .from("ca_tally_companies")
    .select("id, company_name")
    .eq("connector_id", c.id);
  const byId = new Map(
    (cos ?? []).map((x) => [x.id as string, x.company_name as string]),
  );
  if (!byId.size) return [];
  const ids = [...byId.keys()];
  const lease = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
  // A request whose answer never came back is held for a person: Tally may already have the ledger.
  await db
    .from("ca_tally_ledger_requests")
    .update({
      status: "failed",
      last_error:
        "Tally did not confirm this ledger. It may or may not exist: look for it in Tally before asking again.",
      updated_at: new Date().toISOString(),
    })
    .eq("ca_firm_id", c.ca_firm_id)
    .eq("status", "sent")
    .lt("claimed_at", lease)
    .in("company_id", ids);
  const { data: rows } = await db
    .from("ca_tally_ledger_requests")
    .select("id, company_id, name, parent")
    .eq("ca_firm_id", c.ca_firm_id)
    .eq("status", "queued")
    .in("company_id", ids)
    .order("created_at")
    .limit(MAX_CLAIM);
  const out: {
    id: string;
    company: string;
    xml: string;
    name: string;
    parent: string;
  }[] = [];
  for (const r of rows ?? []) {
    const company = byId.get(r.company_id as string)!;
    const { data: lg } = await db
      .from("ca_tally_ledgers")
      .select("name, parent")
      .eq("company_id", r.company_id as string);
    const name = r.name as string;
    const parent = r.parent as string;
    // The ledger may have appeared in Tally since the request was made: nothing to create.
    const problems = ledgerRequestProblems(
      { name, parent },
      (lg ?? []) as { name: string; parent: string | null }[],
      { allowSimilar: true },
    );
    const xml = createLedgerXml(company, name, parent);
    problems.push(...ledgerImportProblems(xml, company));
    if (problems.length) {
      await db
        .from("ca_tally_ledger_requests")
        .update({
          status: "failed",
          last_error: problems[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("status", "queued");
      continue;
    }
    const { data: won } = await db
      .from("ca_tally_ledger_requests")
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
      out.push({ id: r.id as string, company, xml, name, parent });
  }
  return out;
}

/** What Tally answered. Only a creation that the connector also read back becomes "created", and only then can a line use it. */
export async function reportLedgerResult(
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
    .from("ca_tally_ledger_requests")
    .select("id, ca_firm_id, company_id, business_id, name, parent, status")
    .eq("id", id)
    .maybeSingle();
  if (!p || p.ca_firm_id !== c.ca_firm_id)
    throw new PracticeError("not_found", "Unknown request.");
  const { data: co } = await db
    .from("ca_tally_companies")
    .select("connector_id")
    .eq("id", p.company_id as string)
    .maybeSingle();
  if (co?.connector_id !== c.id)
    throw new PracticeError("not_found", "Unknown request.");
  if (p.status === "created") return { status: "created" };
  if (p.status !== "sent")
    throw new PracticeError(
      "bad_state",
      "This request is not waiting for a result.",
    );
  const now = new Date().toISOString();
  const reply =
    typeof input.reply === "string" ? input.reply.slice(0, 20_000) : "";
  const err = typeof input.error === "string" ? input.error.slice(0, 300) : "";
  const note =
    typeof input.verifyNote === "string"
      ? input.verifyNote.replace(/\s+/g, " ").slice(0, 240)
      : "";
  const res = reply ? parseImportReply(reply) : null;
  const fail = async (why: string) => {
    await db
      .from("ca_tally_ledger_requests")
      .update({
        status: "failed",
        last_error: why.slice(0, 300),
        tally_reply: reply.slice(0, 2000) || null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "sent");
    return { status: "failed" as const };
  };
  if (res?.ok && input.verified === true) {
    await db
      .from("ca_tally_ledger_requests")
      .update({
        status: "created",
        created_in_tally_at: now,
        last_error: null,
        tally_reply: `${reply.slice(0, 1700)}\n[verified] ${note}`.slice(
          0,
          2000,
        ),
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "sent");
    // The ledger is usable at once; the next sync confirms it from Tally itself.
    await db.from("ca_tally_ledgers").upsert(
      {
        ca_firm_id: c.ca_firm_id,
        company_id: p.company_id as string,
        name: p.name as string,
        parent: p.parent as string,
        synced_at: now,
      },
      { onConflict: "company_id,name" },
    );
    await db
      .from("ca_tally_connectors")
      .update({ sync_requested_at: now })
      .eq("id", c.id);
    await logActivity(
      db,
      c.ca_firm_id,
      p.business_id as string,
      "recon",
      `The ledger "${p.name}" was created in Tally and read back.`,
    );
    return { status: "created" };
  }
  if (res?.ok)
    return fail(
      `Tally said it created this ledger, but reading it back did not confirm it: ${note || "no detail"} Look for it in Tally before asking again.`,
    );
  return fail(
    err ||
      res?.message ||
      (reply
        ? "Tally did not confirm that the ledger was created."
        : "No answer from Tally."),
  );
}
