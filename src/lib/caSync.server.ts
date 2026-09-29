/**
 * Server-only helpers for the Data & Integration OS syncs.
 *
 * Every sync follows the same contract:
 *   resolve firm -> assert client access -> open a ca_sync_jobs row ->
 *   pull from the provider -> insert only new canonical rows ->
 *   close the job + write a ca_audit_events row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncResult {
  success: boolean;
  records_synced: number;
  errors: string[];
  cursor?: string | null;
}

export interface CanonicalTxn {
  business_id: string;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  category: string;
  source_reference: string;
  is_demo: boolean;
}

/** Resolve the caller's CA firm from membership, falling back to firm ownership. */
export async function resolveFirmId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data: member } = await admin
    .from("ca_firm_members").select("ca_firm_id").eq("user_id", userId).maybeSingle();
  if (member?.ca_firm_id) return member.ca_firm_id as string;
  const { data: owned } = await admin
    .from("ca_firms").select("id").eq("user_id", userId).maybeSingle();
  return (owned?.id as string) ?? null;
}

export async function assertClientAccess(
  admin: SupabaseClient, firmId: string, businessId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("ca_client_access")
    .select("id")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

export async function openSyncJob(
  admin: SupabaseClient, firmId: string, businessId: string, sourceSystem: string,
): Promise<string | null> {
  const { data } = await admin
    .from("ca_sync_jobs")
    .insert({
      ca_firm_id: firmId,
      business_id: businessId,
      source_system: sourceSystem,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

export async function closeSyncJob(
  admin: SupabaseClient,
  jobId: string | null,
  patch: { status: string; records_synced?: number; error_message?: string | null; last_sync_cursor?: string | null },
): Promise<void> {
  if (!jobId) return;
  await admin.from("ca_sync_jobs").update({
    status: patch.status,
    records_synced: patch.records_synced ?? 0,
    error_message: patch.error_message ? patch.error_message.slice(0, 500) : null,
    last_sync_cursor: patch.last_sync_cursor ?? null,
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
}

export async function lastCursor(
  admin: SupabaseClient, firmId: string, businessId: string, sourceSystem: string,
): Promise<string | null> {
  const { data } = await admin
    .from("ca_sync_jobs")
    .select("last_sync_cursor")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("source_system", sourceSystem)
    .eq("status", "completed")
    .not("last_sync_cursor", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.last_sync_cursor as string) ?? null;
}

/**
 * Insert only rows whose source_reference is not already present for this
 * business. bank_transactions has a partial unique index on
 * (business_id, source_reference), so replays are idempotent either way —
 * this pre-filter keeps the insert from aborting the whole batch.
 */
export async function insertNewTxns(
  admin: SupabaseClient, businessId: string, rows: CanonicalTxn[],
): Promise<number> {
  const clean = rows.filter((r) => r.amount > 0 && r.amount < 1_000_000_000 && !!r.date);
  if (clean.length === 0) return 0;
  const refs = clean.map((r) => r.source_reference);
  const { data: existingRows } = await admin
    .from("bank_transactions")
    .select("source_reference")
    .eq("business_id", businessId)
    .in("source_reference", refs);
  const existing = new Set((existingRows ?? []).map((r) => r.source_reference as string));
  const toInsert = clean.filter((r) => !existing.has(r.source_reference));
  if (toInsert.length === 0) return 0;
  const { error } = await admin.from("bank_transactions").insert(toInsert);
  if (error) throw new Error(error.message);
  return toInsert.length;
}

export async function logSyncAudit(
  admin: SupabaseClient,
  args: { firmId: string; businessId: string; actorId: string; action: string; detail: Record<string, unknown> },
): Promise<void> {
  await admin.from("ca_audit_events").insert({
    ca_firm_id: args.firmId,
    business_id: args.businessId,
    actor_id: args.actorId,
    entity_type: "integration",
    action: args.action,
    detail: args.detail,
  });
}

/** Returns a usable Zoho access token, refreshing it in place when expired. */
export async function zohoAccessToken(
  admin: SupabaseClient,
  integration: { access_token: string | null; refresh_token: string | null; expires_at: string | null; metadata: Record<string, unknown> | null },
  organizationId: string,
): Promise<{ token: string; apiDomain: string }> {
  const meta = (integration.metadata ?? {}) as Record<string, string>;
  const apiDomain = meta.api_domain || "https://www.zohoapis.com";
  let token = integration.access_token ?? "";

  const expired = !integration.expires_at || new Date(integration.expires_at).getTime() < Date.now() + 60_000;
  if (expired) {
    if (!integration.refresh_token) throw new Error("Zoho connection expired — reconnect required");
    const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env["ZOHO_CLIENT_ID"] ?? "",
        client_secret: process.env["ZOHO_CLIENT_SECRET"] ?? "",
        refresh_token: integration.refresh_token,
      }),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(`Zoho token refresh failed: ${body.error ?? res.status}`);
    token = body.access_token;
    await admin.from("integrations").update({
      access_token: body.access_token,
      expires_at: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("organization_id", organizationId).eq("provider", "zoho_books");
  }

  if (!token) throw new Error("Zoho connection has no access token — reconnect required");
  return { token, apiDomain };
}

/* ------------------------------------------------------------------ */
/* Provider pulls — shared by the interactive server functions and the */
/* nightly auto-sync cron route.                                       */
/* ------------------------------------------------------------------ */

export interface SyncArgs {
  firmId: string;
  businessId: string;
  actorId: string | null;
}

export async function runZohoBooksSync(
  admin: SupabaseClient, { firmId, businessId, actorId }: SyncArgs,
): Promise<SyncResult> {
  const { data: integration } = await admin
    .from("integrations")
    .select("access_token, refresh_token, expires_at, metadata")
    .eq("organization_id", businessId)
    .eq("provider", "zoho_books")
    .maybeSingle();
  if (!integration) throw new Error("Zoho Books is not connected for this client");

  const jobId = await openSyncJob(admin, firmId, businessId, "zoho_books");
  const errors: string[] = [];

  try {
    const { token, apiDomain } = await zohoAccessToken(admin, integration as never, businessId);
    const auth = { Authorization: `Zoho-oauthtoken ${token}` };

    const orgRes = await fetch(`${apiDomain}/books/v3/organizations`, { headers: auth });
    if (!orgRes.ok) throw new Error(`Zoho organizations failed (${orgRes.status})`);
    const orgBody = await orgRes.json();
    const zohoOrgId = orgBody?.organizations?.[0]?.organization_id;
    if (!zohoOrgId) throw new Error("No Zoho Books organization found on this connection");

    const [invRes, expRes] = await Promise.all([
      fetch(`${apiDomain}/books/v3/invoices?status=all&organization_id=${zohoOrgId}`, { headers: auth }),
      fetch(`${apiDomain}/books/v3/expenses?organization_id=${zohoOrgId}`, { headers: auth }),
    ]);
    if (!invRes.ok) errors.push(`Invoices fetch failed (${invRes.status})`);
    if (!expRes.ok) errors.push(`Expenses fetch failed (${expRes.status})`);

    const invoices: Array<Record<string, unknown>> = invRes.ok ? (await invRes.json())?.invoices ?? [] : [];
    const expenses: Array<Record<string, unknown>> = expRes.ok ? (await expRes.json())?.expenses ?? [] : [];

    const rows: CanonicalTxn[] = [];
    for (const inv of invoices) {
      rows.push({
        business_id: businessId,
        date: String(inv.date ?? "").slice(0, 10),
        description: `Invoice ${inv.invoice_number ?? ""} — ${inv.customer_name ?? "Customer"}`.slice(0, 300),
        amount: Number(inv.total ?? 0),
        type: "credit",
        category: "Revenue",
        source_reference: `zoho_books:invoice:${inv.invoice_id}`,
        is_demo: false,
      });
    }
    for (const exp of expenses) {
      rows.push({
        business_id: businessId,
        date: String(exp.date ?? "").slice(0, 10),
        description: String(exp.description || exp.account_name || "Expense").slice(0, 300),
        amount: Number(exp.total ?? exp.amount ?? 0),
        type: "debit",
        category: String(exp.account_name ?? "Expense").slice(0, 100),
        source_reference: `zoho_books:expense:${exp.expense_id}`,
        is_demo: false,
      });
    }

    const inserted = await insertNewTxns(admin, businessId, rows);
    const cursor = new Date().toISOString();

    await closeSyncJob(admin, jobId, {
      status: errors.length ? "completed_with_errors" : "completed",
      records_synced: inserted,
      error_message: errors.join("; ") || null,
      last_sync_cursor: cursor,
    });
    await logSyncAudit(admin, {
      firmId, businessId, actorId: actorId ?? "system",
      action: "zoho_sync",
      detail: { records_synced: inserted, invoices: invoices.length, expenses: expenses.length, period: cursor },
    });

    return { success: true, records_synced: inserted, errors, cursor };
  } catch (e) {
    const message = (e as Error).message ?? "Zoho sync failed";
    await closeSyncJob(admin, jobId, { status: "failed", error_message: message });
    return { success: false, records_synced: 0, errors: [message] };
  }
}

export async function runRazorpaySync(
  admin: SupabaseClient, { firmId, businessId, actorId }: SyncArgs,
): Promise<SyncResult> {
  const { data: integration } = await admin
    .from("integrations")
    .select("metadata")
    .eq("organization_id", businessId)
    .eq("provider", "razorpay")
    .maybeSingle();
  const meta = (integration?.metadata ?? {}) as Record<string, string>;
  if (!meta.key_id || !meta.key_secret) throw new Error("Razorpay is not connected for this client");

  const jobId = await openSyncJob(admin, firmId, businessId, "razorpay");

  try {
    const cursor = await lastCursor(admin, firmId, businessId, "razorpay");
    const from = cursor ? Number(cursor) : null;
    const params = new URLSearchParams({ count: "100" });
    if (from && Number.isFinite(from)) params.set("from", String(from + 1));

    const res = await fetch(`https://api.razorpay.com/v1/payments?${params.toString()}`, {
      headers: { Authorization: "Basic " + btoa(`${meta.key_id}:${meta.key_secret}`) },
    });
    if (!res.ok) throw new Error(`Razorpay request failed (${res.status})`);
    const payload = await res.json();
    const payments: Array<Record<string, unknown>> = payload?.items ?? [];
    const usable = payments.filter((p) => p.status === "captured" || p.status === "authorized");

    const rows: CanonicalTxn[] = usable.map((p) => ({
      business_id: businessId,
      date: new Date(Number(p.created_at ?? 0) * 1000).toISOString().slice(0, 10),
      description: String(p.description ?? `Razorpay payment ${p.id}`).slice(0, 300),
      amount: Number(p.amount ?? 0) / 100,
      type: "credit" as const,
      category: "Payment Gateway",
      source_reference: `razorpay:${p.id}`,
      is_demo: false,
    }));

    const inserted = await insertNewTxns(admin, businessId, rows);
    const maxCursor = usable.reduce((m, p) => Math.max(m, Number(p.created_at ?? 0)), from ?? 0);

    await closeSyncJob(admin, jobId, {
      status: "completed",
      records_synced: inserted,
      last_sync_cursor: maxCursor ? String(maxCursor) : null,
    });
    await logSyncAudit(admin, {
      firmId, businessId, actorId: actorId ?? "system",
      action: "razorpay_sync",
      detail: { records_synced: inserted, payments_seen: payments.length, cursor: maxCursor ? String(maxCursor) : null },
    });

    return { success: true, records_synced: inserted, errors: [], cursor: maxCursor ? String(maxCursor) : null };
  } catch (e) {
    const message = (e as Error).message ?? "Razorpay sync failed";
    await closeSyncJob(admin, jobId, { status: "failed", error_message: message });
    return { success: false, records_synced: 0, errors: [message] };
  }
}
