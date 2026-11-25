/**
 * Storage for the QC module: the confirmed ledger map and party master, the access log, and the period lock. Every function checks the
 * firm and the role, and none of them touches the books. A table that has not been created yet (the SQL has not been run) gives a plain
 * message, never a crash.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { suggestLedgerMap, type Family, type MapSuggestion } from "./review/ledgerMap";
import { loadVouchers } from "./reviewChecks.server";
import { INPUTS, inputDef, type InputStates } from "./readiness/model";
import { coverageNote, coversMonth, inputKeyOfDoc, type DocFact } from "./readiness/documents";

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

export interface PartyInput { party: string; aliases: string[]; gstin: string | null; pan: string | null }

/** Fills the party master from Tally's masters. Rows already confirmed by a person keep their credit days, Udyam and related-party fields: only the identity fields are written. */
export async function savePartyMaster(db: Db, ctx: FirmContext, businessId: string, parties: PartyInput[]): Promise<{ saved: number }> {
  if (!canConfirm(ctx)) throw new PracticeError("forbidden", "Only a partner or manager can fill the party master.");
  const now = new Date().toISOString();
  const rows = parties.slice(0, 5000).map((p) => ({ ca_firm_id: ctx.firmId, business_id: businessId, party: p.party.slice(0, 300), aliases: p.aliases.slice(0, 20).map((a) => a.slice(0, 300)), gstin: p.gstin, pan: p.pan, updated_at: now }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("ca_party_master").upsert(rows.slice(i, i + 200), { onConflict: "business_id,party" });
    if (error) throw new PracticeError("db_error", missing(error) ? NEEDS_SQL : error.message);
  }
  await logAccess(db, ctx, "export", "party master filled from Tally masters", businessId, { parties: rows.length });
  return { saved: rows.length };
}

/* ── data readiness ──────────────────────────────────────── */

/** Onboarding and year-end items are kept per financial year; monthly items per month. */
const scopeOf = (key: string, month: string, fy: string) => (inputDef(key)?.pack === "monthly" ? month : fy);

/**
 * What has arrived for a client: documents the product holds (read from their classification) and what a person has marked.
 * A document counts for a month's monthly pack when it was added on or after the first of that month.
 */
export async function getInputStates(db: Db, ctx: FirmContext, businessId: string, month: string, fy: string): Promise<{ inputs: InputStates; sqlMissing: boolean }> {
  const inputs: InputStates = {};
  const { data: docs } = await db.from("ca_document_extractions").select("id, original_filename, classification, side, extracted, created_at, extract_status").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).neq("extract_status", "archived");
  // Every stored document goes through the one mapping, and counts for the month by what it contains, not by when it was uploaded.
  const facts: DocFact[] = ((docs ?? []) as { id: string; original_filename: string | null; classification: string | null; side: string | null; created_at: string; extracted: { register?: { kind?: string }; source?: string; reference_kind?: string | null; statement_check?: { first?: string | null; last?: string | null } | null; date_range?: { first: string | null; last: string | null } | null; statement_period?: { from: string | null; to: string | null } | null; books_kind?: "day_book" | "ledger" | "unknown" | null } | null }[]).map((d) => ({
    id: d.id, filename: d.original_filename, side: d.side, classification: d.classification, createdAt: d.created_at,
    registerKind: d.extracted?.register?.kind ?? null, referenceKind: d.extracted?.reference_kind ?? null,
    statement: d.extracted?.statement_check ? { first: d.extracted.statement_check.first ?? null, last: d.extracted.statement_check.last ?? null } : null,
    range: d.extracted?.date_range ?? null, period: d.extracted?.statement_period ?? null, booksKind: d.extracted?.books_kind ?? null, source: d.extracted?.source ?? null,
  }));
  const byKey = new Map<string, DocFact[]>();
  for (const f of facts) {
    const key = inputKeyOfDoc(f);
    if (!key) continue;
    if (inputDef(key)?.pack === "monthly" && !coversMonth(f, month)) continue;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(f);
  }
  for (const [key, list] of byKey) {
    const latest = list.map((f) => f.createdAt).sort().at(-1) ?? null;
    inputs[key] = { status: "received", at: latest, source: "detected", note: coverageNote(list) };
  }
  // What the connected books system supplies for this month fills its inputs, whatever was or was not uploaded.
  try {
    const bc = await (await import("./booksConnection.server")).booksConnection(db, ctx, businessId, month);
    for (const key of bc.supplies) inputs[key] = { status: "received", at: bc.lastSyncedAt, source: "connector", note: bc.label };
  } catch { /* a database without the connector tables just has no connection */ }
  const { data, error } = await db.from("ca_input_status").select("input_key, period, status, note, marked_by, marked_at").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).in("period", [month, fy]);
  if (error && !missing(error)) throw new PracticeError("db_error", error.message);
  for (const r of ((data ?? []) as { input_key: string; period: string; status: "received" | "not_applicable" | "missing"; note: string | null; marked_by: string | null; marked_at: string }[])) {
    if (r.period !== scopeOf(r.input_key, month, fy)) continue;
    if (r.status === "missing") { delete inputs[r.input_key]; continue; }
    if (!inputs[r.input_key] || r.status === "not_applicable") inputs[r.input_key] = { status: r.status, at: r.marked_at, by: r.marked_by, source: "marked", note: r.note };
  }
  return { inputs, sqlMissing: !!error && missing(error) };
}

export async function markInput(db: Db, ctx: FirmContext, businessId: string, key: string, month: string, fy: string, status: "received" | "not_applicable" | "missing", note?: string | null): Promise<{ ok: true }> {
  if (!inputDef(key)) throw new PracticeError("invalid", "Unknown input.");
  if (status === "not_applicable" && !note?.trim()) throw new PracticeError("invalid", "Say why this does not apply to this client.");
  const { error } = await db.from("ca_input_status").upsert({ ca_firm_id: ctx.firmId, business_id: businessId, input_key: key, period: scopeOf(key, month, fy), status, note: note?.trim() || null, marked_by: ctx.userId, marked_at: new Date().toISOString() }, { onConflict: "business_id,input_key,period" });
  if (error) throw new PracticeError("db_error", missing(error) ? "The data-readiness table is not created yet. Run supabase/migrations/20261121100000_input_status.sql once." : error.message);
  await logAccess(db, ctx, "export", `input marked ${status}: ${key}`, businessId, { period: month });
  return { ok: true };
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
