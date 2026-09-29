/**
 * RLS regression test — CA firm isolation.
 *
 * Provisions two real CA firms, each with its own signed-in user, its own
 * client business and a full set of firm-scoped rows. Then asserts, table by
 * table, that firm A can neither read nor write anything belonging to firm B
 * (and vice-versa), including client-access linkage.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_PUBLISHABLE_KEY
 * (or the VITE_ equivalents). The suite skips itself when they are absent.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------- env
function fromDotEnv(): Record<string, string> {
  try {
    const raw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const dotenv = fromDotEnv();
const env = (...keys: string[]) => keys.map((k) => process.env[k] ?? dotenv[k]).find(Boolean) ?? "";

const SUPABASE_URL = env("SUPABASE_URL", "VITE_SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY = env("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");

const CONFIGURED = Boolean(SUPABASE_URL && SERVICE_KEY && PUBLISHABLE_KEY);

// ---------------------------------------------------------------- helpers
const stamp = Date.now();
const tag = `rls-${stamp}`;

interface Firm {
  label: "A" | "B";
  email: string;
  password: string;
  userId: string;
  smeUserId: string;
  firmId: string;
  businessId: string;
  clientId: string;
  notificationId: string;
  taskId: string;
  reminderId: string;
  ruleId: string;
  invoiceId: string;
  accessId: string;
  client: SupabaseClient;
}

const admin = CONFIGURED
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as SupabaseClient);

async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error) throw new Error(`seed ${table}: ${error.message}`);
  return (data as { id: string }).id;
}

async function provision(label: "A" | "B"): Promise<Firm> {
  const email = `${tag}-${label.toLowerCase()}@rls-test.fynhelp.dev`;
  const password = `Rls!${stamp}${label}`;

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !created.user) throw new Error(`create user ${label}: ${userErr?.message}`);
  const userId = created.user.id;

  const firmId = await insertOne("ca_firms", {
    user_id: userId,
    firm_name: `${tag} Firm ${label}`,
    ca_name: `CA ${label}`,
    email,
    is_verified: true,
    verification_status: "approved",
    plan_type: "starter",
    max_clients: 25,
  });

  await insertOne("ca_firm_members", {
    ca_firm_id: firmId,
    user_id: userId,
    invited_email: email,
    role: "partner",
    status: "active",
  });

  // The client business is created by its own SME owner, so the CA firm can only
  // reach it through ca_client_access — never through ownership.
  const smeEmail = `${tag}-${label.toLowerCase()}-sme@rls-test.fynhelp.dev`;
  const { data: smeCreated, error: smeErr } = await admin.auth.admin.createUser({
    email: smeEmail,
    password,
    email_confirm: true,
  });
  if (smeErr || !smeCreated.user) throw new Error(`create SME user ${label}: ${smeErr?.message}`);
  const smeUserId = smeCreated.user.id;

  const smeClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: smeSignInErr } = await smeClient.auth.signInWithPassword({ email: smeEmail, password });
  if (smeSignInErr) throw new Error(`SME sign in ${label}: ${smeSignInErr.message}`);
  const businessName = `${tag} Business ${label}`;
  // No .select() here: PostgREST would evaluate the SELECT policy on a snapshot
  // taken before the profile-linking trigger runs, so the returning clause fails.
  const { error: bizErr } = await smeClient.from("businesses").insert({ business_name: businessName });
  await smeClient.auth.signOut();
  if (bizErr) throw new Error(`seed business ${label}: ${bizErr.message}`);
  const { data: bizRow } = await admin.from("businesses").select("id").eq("business_name", businessName).single();
  const businessId = (bizRow as { id: string }).id;

  const accessId = await insertOne("ca_client_access", {
    ca_firm_id: firmId,
    business_id: businessId,
    access_level: "full_read",
    is_active: true,
  });


  const clientId = await insertOne("ca_clients", {
    ca_firm_id: firmId,
    business_id: businessId,
    client_name: `${tag} Client ${label}`,
    entity_type: "Private Limited",
  });

  const notificationId = await insertOne("ca_notifications", {
    ca_firm_id: firmId,
    type: "test",
    title: `${tag} alert ${label}`,
    message: "isolation probe",
    severity: "info",
  });

  const taskId = await insertOne("ca_tasks", {
    ca_firm_id: firmId,
    business_id: businessId,
    title: `${tag} task ${label}`,
  });

  const reminderId = await insertOne("ca_reminders", {
    ca_firm_id: firmId,
    business_id: businessId,
    title: `${tag} reminder ${label}`,
    remind_at: new Date().toISOString(),
  });

  const ruleId = await insertOne("ca_follow_up_rules", {
    ca_firm_id: firmId,
    rule_name: `${tag} rule ${label}`,
    trigger_event: "document_request_overdue",
    wait_days: label === "A" ? 3 : 5,
    action_type: "email",
  });

  const invoiceId = await insertOne("ca_invoices", {
    ca_firm_id: firmId,
    business_id: businessId,
    invoice_number: `${tag}-${label}-001`,
    period: "2026-08",
    subtotal: 1000,
    gst_amount: 180,
    total: 1180,
  });

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`sign in ${label}: ${signInErr.message}`);

  return {
    label, email, password, userId, smeUserId, firmId, businessId, clientId, notificationId,
    taskId, reminderId, ruleId, invoiceId, accessId, client,
  };
}

async function teardown(f: Firm) {
  await f.client.auth.signOut();
  await admin.from("ca_invoices").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_follow_up_rules").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_reminders").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_tasks").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_notifications").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_clients").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_client_access").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_firm_members").delete().eq("ca_firm_id", f.firmId);
  await admin.from("ca_firms").delete().eq("id", f.firmId);
  await admin.from("businesses").delete().eq("id", f.businessId);
  await admin.auth.admin.deleteUser(f.userId);
  await admin.auth.admin.deleteUser(f.smeUserId);
}

/** Removes fixtures left behind by an earlier run that crashed mid-setup. */
async function purgeStaleFixtures() {
  const { data: firms } = await admin.from("ca_firms").select("id").like("firm_name", "rls-%");
  for (const f of (firms ?? []) as { id: string }[]) {
    await admin.from("ca_invoices").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_follow_up_rules").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_reminders").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_tasks").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_notifications").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_clients").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_client_access").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_firm_members").delete().eq("ca_firm_id", f.id);
    await admin.from("ca_firms").delete().eq("id", f.id);
  }
  await admin.from("businesses").delete().like("business_name", "rls-%");
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) {
    if ((u.email ?? "").endsWith("@rls-test.fynhelp.dev")) await admin.auth.admin.deleteUser(u.id);
  }
}

// Firm-scoped tables and the id field on the seeded row for each firm.
const SCOPED_TABLES: { table: string; idOf: (f: Firm) => string; extraInsert?: (f: Firm) => Record<string, unknown> }[] = [
  { table: "ca_clients", idOf: (f) => f.clientId, extraInsert: (f) => ({ client_name: "intruder", entity_type: "Private Limited", business_id: f.businessId }) },
  { table: "ca_notifications", idOf: (f) => f.notificationId, extraInsert: () => ({ type: "test", title: "intruder", message: "x" }) },
  { table: "ca_tasks", idOf: (f) => f.taskId, extraInsert: () => ({ title: "intruder" }) },
  { table: "ca_reminders", idOf: (f) => f.reminderId, extraInsert: () => ({ title: "intruder", remind_at: new Date().toISOString() }) },
  { table: "ca_follow_up_rules", idOf: (f) => f.ruleId, extraInsert: () => ({ rule_name: "intruder", trigger_event: "document_request_overdue", wait_days: 9, action_type: "email" }) },
  { table: "ca_invoices", idOf: (f) => f.invoiceId, extraInsert: (f) => ({ invoice_number: `intruder-${stamp}`, period: "2026-08", business_id: f.businessId, subtotal: 1, gst_amount: 0, total: 1 }) },
  { table: "ca_client_access", idOf: (f) => f.accessId, extraInsert: (f) => ({ business_id: f.businessId, access_level: "full_read" }) },
];

describe.skipIf(!CONFIGURED)("RLS regression — CA firm isolation", () => {
  let A: Firm;
  let B: Firm;

  beforeAll(async () => {
    await purgeStaleFixtures();
    A = await provision("A");
    B = await provision("B");
  }, 120_000);

  afterAll(async () => {
    if (A) await teardown(A);
    if (B) await teardown(B);
  }, 120_000);

  it("each user resolves only their own firm", async () => {
    for (const [me, other] of [[A, B], [B, A]] as const) {
      const { data } = await me.client.from("ca_firms").select("id");
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      expect(ids).toContain(me.firmId);
      expect(ids).not.toContain(other.firmId);
    }
  });

  it("each user sees only their own firm membership rows", async () => {
    for (const [me, other] of [[A, B], [B, A]] as const) {
      const { data } = await me.client.from("ca_firm_members").select("id, ca_firm_id");
      const firms = new Set((data ?? []).map((r: { ca_firm_id: string }) => r.ca_firm_id));
      expect(firms.has(me.firmId)).toBe(true);
      expect(firms.has(other.firmId)).toBe(false);
    }
  });

  describe.each(SCOPED_TABLES)("$table", ({ table, idOf, extraInsert }) => {
    it("reads are limited to the caller's firm", async () => {
      for (const [me, other] of [[A, B], [B, A]] as const) {
        const { data, error } = await me.client.from(table).select("id, ca_firm_id");
        expect(error, `${table} select for firm ${me.label}`).toBeNull();
        const rows = data ?? [];
        expect(rows.map((r: { id: string }) => r.id)).toContain(idOf(me));
        expect(rows.map((r: { id: string }) => r.id)).not.toContain(idOf(other));
        expect(rows.every((r: { ca_firm_id: string }) => r.ca_firm_id === me.firmId)).toBe(true);
      }
    });

    it("a targeted read of the other firm's row returns nothing", async () => {
      const { data, error } = await A.client.from(table).select("id").eq("id", idOf(B)).maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("updates cannot touch the other firm's row", async () => {
      const { data, error } = await A.client
        .from(table)
        .update({ updated_at: new Date().toISOString(), ca_firm_id: A.firmId })
        .eq("id", idOf(B))
        .select("id");
      // Either the policy rejects the write outright, or it silently matches zero rows.
      if (!error) expect(data ?? []).toHaveLength(0);
      // The row must still belong to firm B.
      const { data: after } = await admin.from(table).select("ca_firm_id").eq("id", idOf(B)).single();
      expect((after as { ca_firm_id: string }).ca_firm_id).toBe(B.firmId);
    });

    it("deletes cannot remove the other firm's row", async () => {
      const { data, error } = await A.client.from(table).delete().eq("id", idOf(B)).select("id");
      if (!error) expect(data ?? []).toHaveLength(0);
      const { data: still } = await admin.from(table).select("id").eq("id", idOf(B)).maybeSingle();
      expect(still).not.toBeNull();
    });

    it("inserts stamped with the other firm's id are rejected", async () => {
      const row = { ca_firm_id: B.firmId, ...(extraInsert ? extraInsert(B) : {}) };
      const { data, error } = await A.client.from(table).insert(row).select("id");
      expect(error, `${table} accepted a cross-firm insert`).not.toBeNull();
      if (data?.length) {
        await admin.from(table).delete().eq("id", (data[0] as { id: string }).id);
      }
    });
  });

  it("client business data is only reachable through the caller's own client access", async () => {
    for (const [me, other] of [[A, B], [B, A]] as const) {
      const { data: mine } = await me.client.from("businesses").select("id").eq("id", me.businessId).maybeSingle();
      const { data: theirs } = await me.client.from("businesses").select("id").eq("id", other.businessId).maybeSingle();
      expect(theirs, `firm ${me.label} read firm ${other.label}'s business`).toBeNull();
      // Reading own client business is allowed (or at minimum never leaks the other firm's).
      if (mine) expect((mine as { id: string }).id).toBe(me.businessId);
    }
  });

  it("a firm cannot grant itself access to another firm's client", async () => {
    const { data, error } = await A.client
      .from("ca_client_access")
      .insert({ ca_firm_id: A.firmId, business_id: B.businessId, access_level: "full_read" })
      .select("id");
    if (!error && data?.length) {
      await admin.from("ca_client_access").delete().eq("id", (data[0] as { id: string }).id);
      throw new Error("firm A was able to grant itself access to firm B's client business");
    }
    expect(error).not.toBeNull();
  });
});
