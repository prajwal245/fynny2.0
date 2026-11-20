/**
 * The books connection of one client, as the product needs it: which system, whether it is live, when it last synced, and a way to ask for a sync now.
 * Tally: the connector is asked at its next check-in (it only makes outbound calls). Zoho: the month is read straight away.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { connectorOnline } from "./tallyConnector";
import { connectionState, GAPS, suppliedNow, type BooksSource, type ConnectionState } from "./books/capabilities";

export interface BooksConnection {
  source: BooksSource;
  state: ConnectionState;
  label: string;
  lastSyncedAt: string | null;
  note: string | null;
  online: boolean;
  /** What this system fills for the month, and what it cannot. */
  supplies: string[];
  gaps: { input: string; why: string }[];
  /** Ids the sync button needs. */
  tallyConnectorId: string | null;
  zohoLinkId: string | null;
  error: string | null;
}

export async function booksConnection(db: Db, ctx: FirmContext, businessId: string, month: string): Promise<BooksConnection> {
  const { data: companies } = await db.from("ca_tally_companies").select("company_name, connector_id, last_synced_at, last_sync_note").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId);
  const co = ((companies ?? []) as { company_name: string; connector_id: string; last_synced_at: string | null; last_sync_note: string | null }[])[0];
  const { data: links } = await db.from("ca_zoho_links").select("id, account_name, last_synced_at, last_sync_note").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId);
  const zl = ((links ?? []) as { id: string; account_name: string | null; last_synced_at: string | null; last_sync_note: string | null }[])[0];
  if (co) {
    const { data: c } = await db.from("ca_tally_connectors").select("id, name, last_seen_at, is_active, last_error").eq("id", co.connector_id).maybeSingle();
    const conn = c as { id: string; name: string; last_seen_at: string | null; is_active: boolean; last_error: string | null } | null;
    const online = connectorOnline(conn?.last_seen_at);
    const live = { connected: !!conn?.is_active, online, lastSyncedAt: co.last_synced_at, error: null };
    return { source: "tally", state: connectionState(live), label: `Tally · ${co.company_name}`, lastSyncedAt: co.last_synced_at, note: co.last_sync_note, online, supplies: suppliedNow("tally", live, month), gaps: GAPS.tally, tallyConnectorId: conn?.id ?? null, zohoLinkId: null, error: null };
  }
  if (zl) {
    const { data: z } = await db.from("ca_zoho_connections").select("status, last_error").eq("ca_firm_id", ctx.firmId).maybeSingle();
    const zc = z as { status: string; last_error: string | null } | null;
    const live = { connected: zc?.status === "connected", online: zc?.status === "connected", lastSyncedAt: zl.last_synced_at, error: zc?.status === "error" ? zc.last_error ?? "Zoho needs to be reconnected." : null };
    return { source: "zoho", state: connectionState(live), label: `Zoho Books · ${zl.account_name ?? "linked account"}`, lastSyncedAt: zl.last_synced_at, note: zl.last_sync_note, online: live.online, supplies: suppliedNow("zoho", live, month), gaps: GAPS.zoho, tallyConnectorId: null, zohoLinkId: zl.id, error: live.error };
  }
  return { source: "files", state: "none", label: "Uploaded files", lastSyncedAt: null, note: null, online: false, supplies: [], gaps: [], tallyConnectorId: null, zohoLinkId: null, error: null };
}

/** The sync button: Tally is asked to send the month at its next check-in; Zoho reads it now. Never writes to either system. */
export async function syncBooksNow(db: Db, ctx: FirmContext, businessId: string, month: string): Promise<{ source: BooksSource; mode: "queued" | "done"; note: string }> {
  const c = await booksConnection(db, ctx, businessId, month);
  if (c.source === "tally" && c.tallyConnectorId) {
    await (await import("./tallyConnector.server")).requestSync(db, ctx, c.tallyConnectorId, [month]);
    return { source: "tally", mode: "queued", note: c.online ? "Asked Tally for the month. It arrives at the connector's next check-in, usually within a few minutes." : "Asked. The connector is not checking in right now: open Tally on that PC and it will send the month when it does." };
  }
  if (c.source === "zoho" && c.zohoLinkId) {
    const r = await (await import("./zoho.server")).sync(db, ctx, c.zohoLinkId, month);
    return { source: "zoho", mode: "done", note: typeof (r as { note?: string }).note === "string" ? (r as { note: string }).note : "Zoho Books read." };
  }
  throw new PracticeError("no_books", "No books system is connected to this client. Connect Tally or Zoho Books in Settings, or upload the files.");
}
