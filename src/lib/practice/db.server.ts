/**
 * Server-side data access shared by the practice services.
 *
 * All writes go through the service-role client, so every entry point first
 * resolves the caller's firm with `firmContext` and scopes every query by
 * `ca_firm_id`. New practice tables are not yet in the generated Supabase
 * types, so this module uses an untyped client with local row interfaces.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PracticeError } from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "public", any>;

export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export interface FirmContext {
  firmId: string;
  firmName: string;
  firmEmail: string | null;
  userId: string;
  role: "owner" | "admin" | "partner" | "manager" | "junior" | "member";
}

/** The caller's firm: the one they own, else an active membership. */
export async function firmContext(
  db: Db,
  userId: string,
): Promise<FirmContext> {
  const { data: owned } = await db
    .from("ca_firms")
    .select("id, firm_name, email")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned)
    return {
      firmId: owned.id,
      firmName: owned.firm_name,
      firmEmail: owned.email ?? null,
      userId,
      role: "owner",
    };
  const { data: member } = await db
    .from("ca_firm_members")
    .select("ca_firm_id, role, ca_firms(firm_name, email)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!member)
    throw new PracticeError("no_firm", "Create your practice first.");
  const firm =
    (member as { ca_firms?: { firm_name?: string; email?: string } })
      .ca_firms ?? {};
  const role = String(member.role ?? "member").toLowerCase();
  return {
    firmId: member.ca_firm_id,
    firmName: firm.firm_name ?? "Your CA firm",
    firmEmail: firm.email ?? null,
    userId,
    role: (["admin", "partner", "manager", "junior"].includes(role)
      ? role
      : "member") as FirmContext["role"],
  };
}

export const canSignOff = (ctx: FirmContext) =>
  ctx.role === "owner" || ctx.role === "admin" || ctx.role === "partner";

/** Throws unless the business is a client of the caller's firm. */
export async function assertClient(
  db: Db,
  ctx: FirmContext,
  businessId: string,
): Promise<{
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  do_not_disturb: boolean;
}> {
  const { data } = await db
    .from("ca_clients")
    .select(
      "id, client_name, client_email, client_phone, notes, do_not_disturb",
    )
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .limit(1)
    .maybeSingle();
  if (!data)
    throw new PracticeError("not_found", "Client not found in your practice.");
  return data;
}

export function clientMeta(notes: string | null): {
  entityType?: string;
  contactName?: string;
  lastMis?: string;
} {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { entityType: notes };
  }
}

/** Client timeline entry. Never throws: the timeline must not block real work. */
export async function logActivity(
  db: Db,
  firmId: string,
  businessId: string | null,
  agent: string,
  text: string,
) {
  const { error } = await db.from("ca_activity_log").insert({
    ca_firm_id: firmId,
    business_id: businessId,
    action_type: agent,
    description: text.slice(0, 1000),
  });
  if (error) console.error(`[practice] activity log failed: ${error.message}`);
}

export async function chaserEvent(
  db: Db,
  e: {
    chaser_id: string;
    ca_firm_id: string;
    business_id: string | null;
    event_type: string;
    note: string;
    actor_id?: string | null;
    channel?: string;
    template_id?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await db
    .from("ca_chaser_events")
    .insert({ metadata: {}, ...e, actor_id: e.actor_id ?? null });
  if (error) console.error(`[practice] chaser event failed: ${error.message}`);
}

export function must<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (res.error)
    throw new PracticeError("db_error", `${what}: ${res.error.message}`);
  if (res.data === null)
    throw new PracticeError("not_found", `${what}: not found`);
  return res.data;
}

/** Fetch every row of a query in pages (PostgREST caps a response at 1,000 rows). */
export async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; from < max; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new PracticeError("db_error", error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}
