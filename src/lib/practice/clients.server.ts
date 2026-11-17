/**
 * Client foundation. A v2 client is a `businesses` row (the id every other
 * table keys on) plus the firm's `ca_clients` record and access grant.
 */
import { PracticeError } from "./core";
import { gstinProblem } from "./india";
import { chaseContactPatch, type ChaseContact, type ClientContactChange } from "./chaseContact";
import {
  assertClient,
  clientMeta,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";

export interface ClientInput {
  name: string;
  entityType?: string;
  gstin?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  doNotDisturb?: boolean;
}

function clean(input: ClientInput) {
  const gstin = input.gstin?.trim().toUpperCase() || null;
  const problem = gstin ? gstinProblem(gstin) : null;
  if (problem) throw new PracticeError("invalid", problem);
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new PracticeError(
      "invalid",
      "The email address does not look right.",
    );
  return { gstin, email, phone: input.phone?.trim() || null };
}

export async function createPracticeClient(
  db: Db,
  ctx: FirmContext,
  input: ClientInput & { id?: string },
) {
  const name = input.name?.trim();
  if (!name) throw new PracticeError("invalid", "Client name is required.");
  const { gstin, email, phone } = clean(input);
  // One client per name (ignoring case and punctuation) and per GSTIN.
  const { data: existing } = await db
    .from("ca_clients")
    .select("client_name, gstin, client_status")
    .eq("ca_firm_id", ctx.firmId);
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const live = (existing ?? []).filter((c) => c.client_status !== "archived");
  const sameName = live.find((c) => key(String(c.client_name ?? "")) === key(name));
  if (sameName) throw new PracticeError("conflict", `A client named "${sameName.client_name}" already exists.`);
  if (gstin) {
    const sameGstin = live.find((c) => String(c.gstin ?? "").toUpperCase() === gstin);
    if (sameGstin) throw new PracticeError("conflict", `${sameGstin.client_name} already has the GSTIN ${gstin}.`);
  }
  // The screen may supply the id so it can navigate to the client straight away.
  const { data: biz, error: bizErr } = await db
    .from("businesses")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      business_name: name.slice(0, 200),
      ...(gstin ? { gstin } : {}),
    })
    .select("id")
    .single();
  if (bizErr)
    throw new PracticeError(
      /duplicate key/i.test(bizErr.message) ? "conflict" : "db_error",
      /duplicate key/i.test(bizErr.message)
        ? "This client already exists."
        : bizErr.message,
    );
  const { data: client, error } = await db
    .from("ca_clients")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: biz.id,
      client_name: name.slice(0, 200),
      client_email: email,
      client_phone: phone,
      gstin,
      client_status: "active",
      onboarded_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      do_not_disturb: Boolean(input.doNotDisturb),
      notes: JSON.stringify({
        entityType: input.entityType ?? "Private Limited",
        contactName: input.contactName ?? "",
      }),
    })
    .select("id")
    .single();
  if (error) {
    await db.from("businesses").delete().eq("id", biz.id);
    throw new PracticeError("db_error", error.message);
  }
  await db.from("ca_client_access").insert({
    ca_firm_id: ctx.firmId,
    business_id: biz.id,
    access_level: "full_read",
    granted_by: ctx.userId,
    is_active: true,
    notes: "Practice workspace client",
  });
  await logActivity(
    db,
    ctx.firmId,
    biz.id,
    "system",
    `${name} added to the portfolio.`,
  );
  // A firm that joined with a referral code qualifies on its first client. Never blocks adding the client.
  await (await import("./referrals.server")).onClientAdded(db, ctx.firmId).catch((e) => console.error(`[referrals] ${(e as Error).message}`));
  return { id: biz.id, row_id: client.id };
}

async function syncOpenChases(db: Db, firmId: string, businessId: string, change: ClientContactChange) {
  const { data: chases } = await db
    .from("ca_document_requests")
    .select("id, status, contact_name, contact_email, contact_phone, notes")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .not("status", "in", "(fulfilled,resolved,cancelled)");
  for (const c of chases ?? []) {
    const patch = chaseContactPatch(c as ChaseContact, change);
    if (patch) await db.from("ca_document_requests").update(patch).eq("id", c.id as string);
  }
}

export async function updatePracticeClient(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  patch: Partial<ClientInput> & { lastMis?: string },
) {
  const current = await assertClient(db, ctx, businessId);
  const meta = clientMeta(current.notes);
  const { gstin, email, phone } = clean({ name: "", ...patch });
  const update: Record<string, unknown> = {
    notes: JSON.stringify({
      ...meta,
      ...(patch.entityType !== undefined
        ? { entityType: patch.entityType }
        : {}),
      ...(patch.contactName !== undefined
        ? { contactName: patch.contactName }
        : {}),
      ...(patch.lastMis !== undefined ? { lastMis: patch.lastMis } : {}),
    }),
    last_activity_at: new Date().toISOString(),
  };
  if (patch.name !== undefined)
    update.client_name = patch.name.trim().slice(0, 200);
  if (patch.email !== undefined) update.client_email = email;
  if (patch.phone !== undefined) update.client_phone = phone;
  if (patch.gstin !== undefined) update.gstin = gstin;
  if (patch.doNotDisturb !== undefined)
    update.do_not_disturb = patch.doNotDisturb;
  const { error } = await db
    .from("ca_clients")
    .update(update)
    .eq("id", current.id);
  if (error) throw new PracticeError("db_error", error.message);
  // Open chases copied the client's contact details when they were made: bring them up to date.
  const change: ClientContactChange = {};
  if (patch.phone !== undefined) change.phone = { old: current.client_phone ?? null, next: phone };
  if (patch.email !== undefined) change.email = { old: current.client_email ?? null, next: email };
  if (patch.contactName !== undefined) change.contactName = { old: meta.contactName ?? null, next: patch.contactName.trim() || null };
  if (Object.keys(change).length) await syncOpenChases(db, ctx.firmId, businessId, change);
  if (patch.name)
    await db
      .from("businesses")
      .update({ business_name: patch.name.trim().slice(0, 200) })
      .eq("id", businessId);
  return { ok: true };
}

/**
 * Takes a client out of the workspace without deleting anything: documents,
 * matches, reports and the audit trail stay. Partners only.
 */
export async function archivePracticeClient(db: Db, ctx: FirmContext, businessId: string, reason: string) {
  const { canSignOff } = await import("./db.server");
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can archive a client.");
  const { data: c } = await db
    .from("ca_clients")
    .select("id, client_name, notes")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!c) throw new PracticeError("not_found", "Client not found.");
  // The time is kept with the client (in its notes record), so the firm can restore it for 14 days.
  const { clientMeta } = await import("./db.server");
  await db.from("ca_clients").update({ client_status: "archived", notes: JSON.stringify({ ...clientMeta(c.notes as string | null), archivedAt: new Date().toISOString() }) }).eq("id", c.id);
  await db
    .from("ca_document_requests")
    .update({ status: "closed", next_follow_up_at: null })
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("status", "open");
  await logActivity(db, ctx.firmId, businessId, "system", `${c.client_name} archived${reason.trim() ? `: ${reason.trim()}` : ""}. Its documents, reports and history are kept.`);
  return { ok: true };
}

export interface ArchivedClient {
  businessId: string;
  name: string;
  archivedAt: string | null;
  restorable: boolean;
  daysLeft: number | null;
  label: string;
}

/** When a client was archived: the time kept with it, else the history entry written when it was archived. */
async function archivedAtOf(db: Db, ctx: FirmContext, businessId: string, notes: string | null): Promise<string | null> {
  const { clientMeta } = await import("./db.server");
  const meta = clientMeta(notes) as { archivedAt?: string };
  if (meta.archivedAt) return meta.archivedAt;
  const { data } = await db
    .from("ca_activity_log")
    .select("created_at, description")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("action_type", "system")
    .like("description", "% archived%")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.created_at as string | undefined) ?? null;
}

/** Archived clients, newest first, each with how long it can still be restored. */
export async function listArchivedClients(db: Db, ctx: FirmContext): Promise<ArchivedClient[]> {
  const { restoreWindow, restoreLabel } = await import("./archive");
  const { data } = await db.from("ca_clients").select("business_id, client_name, notes").eq("ca_firm_id", ctx.firmId).eq("client_status", "archived").limit(500);
  const out: ArchivedClient[] = [];
  for (const c of (data ?? []) as { business_id: string | null; client_name: string; notes: string | null }[]) {
    if (!c.business_id) continue;
    const at = await archivedAtOf(db, ctx, c.business_id, c.notes);
    const w = restoreWindow(at);
    out.push({ businessId: c.business_id, name: c.client_name, archivedAt: at, restorable: w.restorable, daysLeft: w.daysLeft, label: restoreLabel(w) });
  }
  return out.sort((a, b) => String(b.archivedAt ?? "").localeCompare(String(a.archivedAt ?? "")));
}

/**
 * Brings an archived client back, within 14 days of archiving. Partners only. The client counts toward the plan again, so the plan's
 * active-client limit is checked first and the message says what to do if there is no room.
 */
export async function unarchivePracticeClient(db: Db, ctx: FirmContext, businessId: string) {
  const { canSignOff, clientMeta } = await import("./db.server");
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can restore a client.");
  const { data: c } = await db.from("ca_clients").select("id, client_name, client_status, notes").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).maybeSingle();
  if (!c) throw new PracticeError("not_found", "Client not found.");
  if (c.client_status !== "archived") throw new PracticeError("invalid", `${c.client_name} is not archived.`);
  const { restoreWindow, RESTORE_DAYS } = await import("./archive");
  const w = restoreWindow(await archivedAtOf(db, ctx, businessId, c.notes as string | null));
  if (!w.restorable) throw new PracticeError("expired", `${c.client_name} was archived more than ${RESTORE_DAYS} days ago. Ask FynHelp support to restore it.`);
  // Back in the count: is there room on the plan?
  const billing = await import("./billing.server");
  await billing.assertWorkRoom(db, ctx.firmId, { businessId, newDocument: false });
  const { archivedAt: _gone, ...meta } = clientMeta(c.notes as string | null) as Record<string, unknown>;
  await db.from("ca_clients").update({ client_status: "active", notes: Object.keys(meta).length ? JSON.stringify(meta) : null }).eq("id", c.id);
  await logActivity(db, ctx.firmId, businessId, "system", `${c.client_name} restored from the archive by ${ctx.role}. Its documents, reports and history are as they were.`);
  return { ok: true };
}
