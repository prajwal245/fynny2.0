/**
 * Storage for the QC module: the confirmed ledger map and party master, the access log, and the period lock. Every function checks the
 * firm and the role, and none of them touches the books. A table that has not been created yet (the SQL has not been run) gives a plain
 * message, never a crash.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { suggestLedgerMap, type Family, type MapSuggestion } from "./review/ledgerMap";
import { loadVouchers } from "./reviewChecks.server";

const canConfirm = (ctx: FirmContext) => ["owner", "admin", "partner", "manager"].includes(ctx.role);
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || /does not exist|schema cache|relation/i.test(e.message ?? ""));
const NEEDS_SQL = "The QC tables are not created yet. Run supabase/migrations/20261120100000_ledger_map_party_audit_lock.sql once.";

export interface ConfirmedLedger {
  ledger: string; family: Family; gstHead: string | null; rate: number | null; rcmCategory: string | null; tdsSection: string | null; itcEligibility: string | null; confirmedAt: string | null;
}

/** The suggestions for a client's ledgers, with the confirmed choice replacing the suggestion where there is one. */
export async function getLedgerMap(db: Db, ctx: FirmContext, businessId: string): Promise<{ rows: (MapSuggestion & { confirmed: ConfirmedLedger | null })[]; confirmedCount: number; sqlMissing: boolean }> {
  const { vouchers } = await loadVouchers(db, ctx, businessId);
  const names = [...new Set(vouchers.flatMap((v) => v.legs.map((l) => l.ledger)))].sort();
  const sug = suggestLedgerMap(names.map((name) => ({ name })));
  const { data, error } = await db.from("ca_ledger_map").select("ledger, family, gst_head, rate, rcm_category, tds_section, itc_eligibility, confirmed_at").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId);
  if (error && !missing(error)) throw new PracticeError("db_error", error.message);
  const by = new Map(((data ?? []) as { ledger: string; family: Family; gst_head: string | null; rate: number | null; rcm_category: string | null; tds_section: string | null; itc_eligibility: string | null; confirmed_at: string | null }[]).map((r) => [r.ledger, r]));
  const rows = sug.map((s) => { const c = by.get(s.ledger); return { ...s, confirmed: c ? { ledger: c.ledger, family: c.family, gstHead: c.gst_head, rate: c.rate, rcmCategory: c.rcm_category, tdsSection: c.tds_section, itcEligibility: c.itc_eligibility, confirmedAt: c.confirmed_at } : null }; });
  return { rows, confirmedCount: by.size, sqlMissing: !!error && missing(error) };
}

export async function confirmLedgers(db: Db, ctx: FirmContext, businessId: string, items: { ledger: string; family: string; gst_head?: string | null; rate?: number | null; rcm_category?: string | null; tds_section?: string | null; itc_eligibility?: string | null }[]): Promise<{ saved: number }> {
  if (!canConfirm(ctx)) throw new PracticeError("forbidden", "Only a partner or manager can confirm the ledger map.");
  const now = new Date().toISOString();
  const rows = items.slice(0, 2000).map((i) => ({ ca_firm_id: ctx.firmId, business_id: businessId, ledger: i.ledger.slice(0, 300), family: i.family, gst_head: i.gst_head ?? null, rate: i.rate ?? null, rcm_category: i.rcm_category ?? null, tds_section: i.tds_section ?? null, itc_eligibility: i.itc_eligibility ?? null, confirmed_by: ctx.userId, confirmed_at: now, updated_at: now }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("ca_ledger_map").upsert(rows.slice(i, i + 200), { onConflict: "business_id,ledger" });
    if (error) throw new PracticeError("db_error", missing(error) ? NEEDS_SQL : error.message);
  }
  await logAccess(db, ctx, "export", "ledger map confirmed", businessId, { ledgers: rows.length });
  return { saved: rows.length };
}

/** Records who read, downloaded or exported what. Never blocks the action it records. */
export async function logAccess(db: Db, ctx: FirmContext, action: "read" | "download" | "export", subject: string, businessId: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await db.from("ca_access_log").insert({ ca_firm_id: ctx.firmId, user_id: ctx.userId, business_id: businessId, action, subject: subject.slice(0, 300), detail });
    if (error && !missing(error)) console.error(`[access-log] ${error.message}`);
  } catch (e) {
    console.error(`[access-log] ${(e as Error).message}`);
  }
}

/* ── period lock ─────────────────────────────────────────── */

/** A fingerprint of every document the client has for the month: change, add or remove one and the fingerprint changes. */
export async function inputFingerprint(db: Db, ctx: FirmContext, businessId: string): Promise<{ hash: string; count: number }> {
  const { data } = await db.from("ca_document_extractions").select("id, content_hash, extract_status").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).neq("extract_status", "archived");
  const parts = ((data ?? []) as { id: string; content_hash: string | null }[]).map((d) => `${d.id}:${d.content_hash ?? ""}`).sort();
  const enc = new TextEncoder().encode(parts.join("|"));
  const dig = await crypto.subtle.digest("SHA-256", enc);
  return { hash: Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, "0")).join(""), count: parts.length };
}

export async function lockPeriod(db: Db, ctx: FirmContext, businessId: string, period: string): Promise<{ locked: true; inputs: number }> {
  if (!["owner", "admin", "partner"].includes(ctx.role)) throw new PracticeError("forbidden", "Only a partner can lock a month.");
  const f = await inputFingerprint(db, ctx, businessId);
  const { error } = await db.from("ca_period_lock").upsert({ ca_firm_id: ctx.firmId, business_id: businessId, period, input_hash: f.hash, input_count: f.count, locked_by: ctx.userId, locked_at: new Date().toISOString() }, { onConflict: "business_id,period" });
  if (error) throw new PracticeError("db_error", missing(error) ? NEEDS_SQL : error.message);
  await logAccess(db, ctx, "export", `period locked ${period}`, businessId, { inputs: f.count });
  return { locked: true, inputs: f.count };
}

export async function periodStatus(db: Db, ctx: FirmContext, businessId: string, period: string): Promise<{ locked: boolean; stale: boolean; lockedAt: string | null; sqlMissing: boolean }> {
  const { data, error } = await db.from("ca_period_lock").select("input_hash, locked_at").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("period", period).maybeSingle();
  if (error) return { locked: false, stale: false, lockedAt: null, sqlMissing: missing(error) };
  if (!data) return { locked: false, stale: false, lockedAt: null, sqlMissing: false };
  const f = await inputFingerprint(db, ctx, businessId);
  return { locked: true, stale: f.hash !== (data as { input_hash: string }).input_hash, lockedAt: (data as { locked_at: string }).locked_at, sqlMissing: false };
}
