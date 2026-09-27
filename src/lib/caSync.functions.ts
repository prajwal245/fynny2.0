import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SyncResult } from "./caSync.server";

export type { SyncResult } from "./caSync.server";

export interface IntegrationStatus {
  business_id: string;
  provider: string;
  status: string | null;
  connected_at: string | null;
}

/** Which providers the firm's clients have connected. Never returns credentials. */
export const getFirmIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<IntegrationStatus[]> => {
    const { supabase } = context;
    // RLS on ca_client_access limits this to firms the caller belongs to.
    const { data: access, error } = await supabase
      .from("ca_client_access")
      .select("business_id")
      .eq("ca_firm_id", data.firmId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    const ids = (access ?? []).map((a) => a.business_id as string).filter(Boolean);
    if (ids.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: intErr } = await supabaseAdmin
      .from("integrations")
      .select("organization_id, provider, status, created_at")
      .in("organization_id", ids);
    if (intErr) throw new Error(intErr.message);

    return (rows ?? []).map((r) => ({
      business_id: String(r.organization_id),
      provider: String(r.provider),
      status: r.status ?? null,
      connected_at: r.created_at ?? null,
    }));
  });

export interface AutoSyncSetting {
  provider: string;
  auto_sync_enabled: boolean;
  auto_sync_frequency: string;
  last_auto_sync_at: string | null;
}

export const syncZohoBooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string; firmId: string }) => {
    if (!input?.businessId || !input?.firmId) throw new Error("businessId and firmId are required");
    return input;
  })
  .handler(async ({ data, context }): Promise<SyncResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("./caSync.server");
    const admin = supabaseAdmin as never as Parameters<typeof helpers.resolveFirmId>[0];

    const firmId = await helpers.resolveFirmId(admin, context.userId);
    if (!firmId || firmId !== data.firmId) throw new Error("CA firm not found for this user");
    if (!(await helpers.assertClientAccess(admin, firmId, data.businessId))) {
      throw new Error("Access denied. This client is not in your portfolio.");
    }
    return helpers.runZohoBooksSync(admin, { firmId, businessId: data.businessId, actorId: context.userId });
  });

export const syncRazorpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string; firmId: string }) => {
    if (!input?.businessId || !input?.firmId) throw new Error("businessId and firmId are required");
    return input;
  })
  .handler(async ({ data, context }): Promise<SyncResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("./caSync.server");
    const admin = supabaseAdmin as never as Parameters<typeof helpers.resolveFirmId>[0];

    const firmId = await helpers.resolveFirmId(admin, context.userId);
    if (!firmId || firmId !== data.firmId) throw new Error("CA firm not found for this user");
    if (!(await helpers.assertClientAccess(admin, firmId, data.businessId))) {
      throw new Error("Access denied. This client is not in your portfolio.");
    }
    return helpers.runRazorpaySync(admin, { firmId, businessId: data.businessId, actorId: context.userId });
  });

/** Auto-sync schedule for a client's connected providers. */
export const getAutoSyncSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; businessId: string }) => {
    if (!input?.firmId || !input?.businessId) throw new Error("firmId and businessId are required");
    return input;
  })
  .handler(async ({ data, context }): Promise<AutoSyncSetting[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("./caSync.server");
    const admin = supabaseAdmin as never as Parameters<typeof helpers.resolveFirmId>[0];
    const firmId = await helpers.resolveFirmId(admin, context.userId);
    if (!firmId || firmId !== data.firmId) throw new Error("CA firm not found for this user");
    if (!(await helpers.assertClientAccess(admin, firmId, data.businessId))) {
      throw new Error("Access denied. This client is not in your portfolio.");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("integrations")
      .select("provider, auto_sync_enabled, auto_sync_frequency, last_auto_sync_at")
      .eq("organization_id", data.businessId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      provider: String(r.provider),
      auto_sync_enabled: Boolean(r.auto_sync_enabled),
      auto_sync_frequency: String(r.auto_sync_frequency ?? "daily"),
      last_auto_sync_at: (r.last_auto_sync_at as string | null) ?? null,
    }));
  });

export const setAutoSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; businessId: string; provider: string; enabled: boolean; frequency?: string }) => {
    if (!input?.firmId || !input?.businessId || !input?.provider) {
      throw new Error("firmId, businessId and provider are required");
    }
    if (!["zoho_books", "razorpay"].includes(input.provider)) throw new Error("Unsupported provider");
    const frequency = input.frequency ?? "daily";
    if (!["daily", "weekly"].includes(frequency)) throw new Error("Unsupported frequency");
    return { ...input, frequency };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("./caSync.server");
    const admin = supabaseAdmin as never as Parameters<typeof helpers.resolveFirmId>[0];
    const firmId = await helpers.resolveFirmId(admin, context.userId);
    if (!firmId || firmId !== data.firmId) throw new Error("CA firm not found for this user");
    if (!(await helpers.assertClientAccess(admin, firmId, data.businessId))) {
      throw new Error("Access denied. This client is not in your portfolio.");
    }
    const { error } = await supabaseAdmin
      .from("integrations")
      .update({ auto_sync_enabled: data.enabled, auto_sync_frequency: data.frequency })
      .eq("organization_id", data.businessId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    await helpers.logSyncAudit(admin, {
      firmId, businessId: data.businessId, actorId: context.userId,
      action: data.enabled ? "auto_sync_enabled" : "auto_sync_disabled",
      detail: { provider: data.provider, frequency: data.frequency },
    });
    return { ok: true };
  });
