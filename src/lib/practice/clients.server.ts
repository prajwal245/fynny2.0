/**
 * Client foundation. A v2 client is a `businesses` row (the id every other
 * table keys on) plus the firm's `ca_clients` record and access grant.
 */
import { PracticeError } from "./core";
import { assertClient, clientMeta, logActivity, type Db, type FirmContext } from "./db.server";

export interface ClientInput {
  name: string;
  entityType?: string;
  gstin?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  doNotDisturb?: boolean;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function clean(input: ClientInput) {
  const gstin = input.gstin?.trim().toUpperCase() || null;
  if (gstin && !GSTIN.test(gstin)) throw new PracticeError("invalid", "GSTIN should be 15 characters, like 29AABCS1429B1ZL.");
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PracticeError("invalid", "The email address does not look right.");
  return { gstin, email, phone: input.phone?.trim() || null };
}

export async function createPracticeClient(db: Db, ctx: FirmContext, input: ClientInput & { id?: string }) {
  const name = input.name?.trim();
  if (!name) throw new PracticeError("invalid", "Client name is required.");
  const { gstin, email, phone } = clean(input);
  // The screen may supply the id so it can navigate to the client straight away.
  const { data: biz, error: bizErr } = await db.from("businesses").insert({ ...(input.id ? { id: input.id } : {}), business_name: name.slice(0, 200), ...(gstin ? { gstin } : {}) }).select("id").single();
  if (bizErr) throw new PracticeError(/duplicate key/i.test(bizErr.message) ? "conflict" : "db_error", /duplicate key/i.test(bizErr.message) ? "This client already exists." : bizErr.message);
  const { data: client, error } = await db.from("ca_clients").insert({
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
    notes: JSON.stringify({ entityType: input.entityType ?? "Private Limited", contactName: input.contactName ?? "" }),
  }).select("id").single();
  if (error) {
    await db.from("businesses").delete().eq("id", biz.id);
    throw new PracticeError("db_error", error.message);
  }
  await db.from("ca_client_access").insert({ ca_firm_id: ctx.firmId, business_id: biz.id, access_level: "full_read", granted_by: ctx.userId, is_active: true, notes: "Practice workspace client" });
  await logActivity(db, ctx.firmId, biz.id, "system", `${name} added to the portfolio.`);
  return { id: biz.id, row_id: client.id };
}

export async function updatePracticeClient(db: Db, ctx: FirmContext, businessId: string, patch: Partial<ClientInput> & { lastMis?: string }) {
  const current = await assertClient(db, ctx, businessId);
  const meta = clientMeta(current.notes);
  const { gstin, email, phone } = clean({ name: "", ...patch });
  const update: Record<string, unknown> = {
    notes: JSON.stringify({
      ...meta,
      ...(patch.entityType !== undefined ? { entityType: patch.entityType } : {}),
      ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
      ...(patch.lastMis !== undefined ? { lastMis: patch.lastMis } : {}),
    }),
    last_activity_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) update.client_name = patch.name.trim().slice(0, 200);
  if (patch.email !== undefined) update.client_email = email;
  if (patch.phone !== undefined) update.client_phone = phone;
  if (patch.gstin !== undefined) update.gstin = gstin;
  if (patch.doNotDisturb !== undefined) update.do_not_disturb = patch.doNotDisturb;
  const { error } = await db.from("ca_clients").update(update).eq("id", current.id);
  if (error) throw new PracticeError("db_error", error.message);
  if (patch.name) await db.from("businesses").update({ business_name: patch.name.trim().slice(0, 200) }).eq("id", businessId);
  return { ok: true };
}
