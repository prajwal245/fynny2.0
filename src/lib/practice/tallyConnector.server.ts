/**
 * Tally connector, server side. The connector (a small program on the PC with Tally) calls
 * two public endpoints with its secret token: "hello" (who is open, what to send) and
 * "ledger" (one company's Day Book for one month). Books-side documents are filed the same
 * way as Zoho Books, so Extract, Recon and the MIS treat them like an uploaded Tally export.
 */
import { PracticeError } from "./core";
import { assertClient, logActivity, type Db, type FirmContext } from "./db.server";
import { BUCKET, processExtraction, registerDocument } from "./documents.server";
import {
  bearerOf,
  cleanCompanyNames,
  connectorOnline,
  hashToken,
  looksLikeToken,
  monthsToPull,
  newConnectorToken,
  validMonth,
  voucherCount,
} from "./tallyConnector";

export const MAX_LEDGER_BYTES = 25 * 1024 * 1024;
export const SYNC_INTERVAL_MINUTES = 60;

export interface ConnectorRow {
  id: string;
  ca_firm_id: string;
  name: string;
  sync_requested_at: string | null;
}

/** The connector behind a request's bearer token, or null. */
export async function authConnector(db: Db, authorization: string | null): Promise<ConnectorRow | null> {
  const token = bearerOf(authorization);
  if (!looksLikeToken(token)) return null;
  const { data } = await db
    .from("ca_tally_connectors")
    .select("id, ca_firm_id, name, sync_requested_at")
    .eq("token_hash", await hashToken(token))
    .eq("is_active", true)
    .maybeSingle();
  return (data as ConnectorRow | null) ?? null;
}

/** The connector says hello: record it, learn its companies, say what to send. */
export async function hello(
  db: Db,
  c: ConnectorRow,
  body: { version?: unknown; host?: unknown; companies?: unknown; error?: unknown },
) {
  const names = cleanCompanyNames(body.companies);
  const now = new Date();
  await db
    .from("ca_tally_connectors")
    .update({
      last_seen_at: now.toISOString(),
      agent_version: typeof body.version === "string" ? body.version.slice(0, 40) : null,
      host_name: typeof body.host === "string" ? body.host.slice(0, 80) : null,
      last_error: typeof body.error === "string" && body.error ? body.error.slice(0, 300) : null,
      sync_requested_at: null,
    })
    .eq("id", c.id);
  if (names.length) {
    await db
      .from("ca_tally_companies")
      .upsert(names.map((company_name) => ({ ca_firm_id: c.ca_firm_id, connector_id: c.id, company_name })), {
        onConflict: "connector_id,company_name",
        ignoreDuplicates: true,
      });
  }
  const { data: rows } = await db
    .from("ca_tally_companies")
    .select("company_name, business_id, last_synced_at")
    .eq("connector_id", c.id);
  return {
    syncNow: Boolean(c.sync_requested_at),
    intervalMinutes: SYNC_INTERVAL_MINUTES,
    companies: (rows ?? []).map((r) => ({
      name: r.company_name as string,
      mapped: Boolean(r.business_id),
      months: r.business_id ? monthsToPull(r.last_synced_at as string | null, now) : [],
    })),
  };
}

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type LedgerResult =
  | { status: "synced" | "unchanged" | "empty"; note: string; extractionId?: string }
  | { status: "unmapped" | "paused"; note: string };

/** One company's Day Book for one month, filed as a books-side document for the mapped client. */
export async function ingestLedger(db: Db, c: ConnectorRow, company: string, month: string, bytes: Uint8Array): Promise<LedgerResult> {
  if (!validMonth(month)) throw new PracticeError("bad_month", "The month must look like 2026-04.");
  if (bytes.length === 0) throw new PracticeError("empty", "The file is empty.");
  if (bytes.length > MAX_LEDGER_BYTES) throw new PracticeError("too_large", "Files larger than 25 MB cannot be processed.");
  const { data: co } = await db
    .from("ca_tally_companies")
    .select("id, business_id")
    .eq("connector_id", c.id)
    .eq("company_name", company)
    .maybeSingle();
  if (!co || !co.business_id) return { status: "unmapped", note: "Link this Tally company to a client in FynHelp Settings first." };
  const billing = await import("./billing.server");
  if (!(await billing.firmCanWork(db, c.ca_firm_id))) return { status: "paused", note: "The trial or plan has ended. New work is paused." };

  const label = monthLabel(month);
  const touch = (n: string) => db.from("ca_tally_companies").update({ last_synced_at: new Date().toISOString(), last_sync_note: n }).eq("id", co.id);
  const vouchers = voucherCount(new TextDecoder().decode(bytes));
  if (!vouchers) {
    await touch(`${label}: no vouchers in Tally`);
    return { status: "empty", note: `No vouchers in Tally for ${label}.` };
  }

  const hash = await sha256Hex(bytes);
  const path = `${c.ca_firm_id}/${co.business_id}/tally/${co.id}-${month}.xml`;
  const filename = `Tally - ${company.replace(/[\\/]/g, "-")} - ${label}.xml`.replace(/[:*?"<>|]/g, " ");
  const note = `${label}: ${vouchers} voucher${vouchers === 1 ? "" : "s"}`;
  const { data: prev } = await db.from("ca_document_extractions").select("id, content_hash").eq("ca_firm_id", c.ca_firm_id).eq("storage_path", path).maybeSingle();
  if (prev?.content_hash === hash) {
    await touch(`${note} (no change)`);
    return { status: "unchanged", note: `No changes in Tally since the last sync of ${label}.`, extractionId: prev.id as string };
  }
  // Same company and month with new entries: read the new version in place. Lines already matched stay matched.
  await billing.assertWorkRoom(db, c.ca_firm_id, { businessId: co.business_id as string, newDocument: !prev });
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/xml", upsert: true });
  if (upErr) throw new PracticeError("storage", upErr.message);

  let extractionId: string;
  if (prev) {
    await db.from("ca_document_extractions").update({ content_hash: hash, original_filename: filename, extract_status: "queued", error_message: null }).eq("id", prev.id);
    await processExtraction(db, prev.id as string, { trigger: "channel", userId: null });
    extractionId = prev.id as string;
  } else {
    const reg = await registerDocument(db, { firmId: c.ca_firm_id, userId: null }, {
      storage_path: path,
      filename,
      mime: "application/xml",
      business_id: co.business_id as string,
      side: "books",
      channel: "Tally",
      source_metadata: { tally_company: company, month, connector: c.name },
    });
    extractionId = reg.extraction_id;
  }
  await touch(note);
  await logActivity(db, c.ca_firm_id, co.business_id as string, "extract", `Tally ${note} received from the connector "${c.name}".`);
  return { status: "synced", note, extractionId };
}

/* ── partner-facing management (called from signed-in server functions) ── */

export async function listConnectors(db: Db, ctx: FirmContext) {
  const [{ data: cons }, { data: cos }] = await Promise.all([
    db.from("ca_tally_connectors").select("id, name, is_active, last_seen_at, agent_version, host_name, last_error, created_at, sync_requested_at").eq("ca_firm_id", ctx.firmId).eq("is_active", true).order("created_at"),
    db.from("ca_tally_companies").select("id, connector_id, company_name, business_id, last_synced_at, last_sync_note").eq("ca_firm_id", ctx.firmId).order("company_name"),
  ]);
  const now = new Date();
  return (cons ?? []).map((k) => ({
    ...k,
    online: connectorOnline(k.last_seen_at as string | null, now),
    companies: (cos ?? []).filter((x) => x.connector_id === k.id),
  }));
}

/** Creates a connector. The token is returned once and never stored. */
export async function createConnector(db: Db, ctx: FirmContext, name: string) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) throw new PracticeError("bad_name", "Give the connector a name, for example the office PC it runs on.");
  const { count } = await db.from("ca_tally_connectors").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("is_active", true);
  if ((count ?? 0) >= 10) throw new PracticeError("limit", "A firm can have up to 10 active connectors. Remove one first.");
  const token = newConnectorToken();
  const { data, error } = await db
    .from("ca_tally_connectors")
    .insert({ ca_firm_id: ctx.firmId, name: clean, token_hash: await hashToken(token), created_by: ctx.userId })
    .select("id")
    .single();
  if (error) throw new PracticeError("db_error", error.message);
  return { id: data.id as string, name: clean, token };
}

export async function revokeConnector(db: Db, ctx: FirmContext, id: string) {
  const { error } = await db.from("ca_tally_connectors").update({ is_active: false }).eq("id", id).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return { ok: true };
}

export async function mapCompany(db: Db, ctx: FirmContext, companyId: string, businessId: string | null) {
  if (businessId) await assertClient(db, ctx, businessId);
  const { error } = await db.from("ca_tally_companies").update({ business_id: businessId }).eq("id", companyId).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return { ok: true };
}

export async function requestSync(db: Db, ctx: FirmContext, connectorId: string) {
  const { error } = await db.from("ca_tally_connectors").update({ sync_requested_at: new Date().toISOString() }).eq("id", connectorId).eq("ca_firm_id", ctx.firmId);
  if (error) throw new PracticeError("db_error", error.message);
  return { ok: true };
}
