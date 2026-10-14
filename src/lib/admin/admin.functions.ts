/**
 * Server functions for the admin panel. Each one checks network, admin role,
 * MFA, the admin session cookie and its permission before doing anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Permission } from "./rbac";

type Ctx = { userId: string; claims: Record<string, unknown> };

async function gate(context: Ctx, perm: Permission) {
  const { requireAdmin } = await import("./security.server");
  return requireAdmin(context.userId, context.claims as never, perm);
}

/* ── sign-in ─────────────────────────────────────────────── */

/** Step 1: email and password, checked and counted on the server. */
export const adminPasswordLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => (await import("./security.server")).passwordSignIn(data.email, data.password));

/** First-time set-up: emails a link to set a password, for founder-list emails only. */
export const adminRequestSetup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(200) }).parse(d))
  .handler(async ({ data }) => (await import("./security.server")).requestAdminSetup(data.email));

/** Step 3 (after the TOTP code): opens the admin session. */
export const adminStartSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { startAdminSession } = await import("./security.server");
    const { PERMISSIONS } = await import("./rbac");
    const ctx = await startAdminSession(context.userId, context.claims as never);
    return { roles: ctx.roles, permissions: [...new Set(ctx.roles.flatMap((r) => PERMISSIONS[r]))] };
  });

/** Who is signed in, and what they may do. Also keeps the 15-minute idle timer alive. */
export const adminWhoAmI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await gate(context, "dashboard.view");
    const { PERMISSIONS } = await import("./rbac");
    return { userId: ctx.userId, email: ctx.email, roles: ctx.roles, permissions: [...new Set(ctx.roles.flatMap((r) => PERMISSIONS[r]))], ip: ctx.ip };
  });

export const adminLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./security.server")).endAdminSession(context.userId);
    return { ok: true };
  });

/** Lets the admin login page say "not from this network" before anyone types a password. */
export const adminNetworkCheck = createServerFn({ method: "GET" }).handler(async () => {
  const { clientIp, networkAllowed } = await import("./security.server");
  return { allowed: networkAllowed(clientIp()) };
});

/* ── dashboard ───────────────────────────────────────────── */

export const adminDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("./admin.server")).dashboard(await gate(context, "dashboard.view")));

export const adminActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ after: z.string().max(40).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await import("./admin.server")).activity(await gate(context, "dashboard.view"), data.after));

/* ── firms ───────────────────────────────────────────────── */

export const adminFirms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        q: z.string().max(100).optional(),
        status: z.enum(["active", "suspended", "flagged", ""]).optional(),
        plan: z.enum(["trial", "paid", "paused", "cancelled", ""]).optional(),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => (await import("./admin.server")).listFirms(await gate(context, "firms.view"), data));

export const adminFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firmId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).firmDetail(await gate(context, "firms.view"), data.firmId));

export const adminSetFirmStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firmId: z.string().uuid(), status: z.enum(["active", "suspended", "flagged"]), note: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) =>
    (await import("./admin.server")).setFirmStatus(await gate(context, "firms.update"), data.firmId, data.status, data.note),
  );

export const adminExtendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firmId: z.string().uuid(), days: z.number().int().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).extendTrial(await gate(context, "firms.update"), data.firmId, data.days));

/* ── operations ──────────────────────────────────────────── */

export const adminRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.string().max(20).optional(), agent: z.string().max(20).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await import("./admin.server")).listRuns(await gate(context, "ops.view"), data));

export const adminRetryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).retryRun(await gate(context, "ops.retry"), data.runId));

/* ── billing ─────────────────────────────────────────────── */

export const adminSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("./admin.server")).subscriptions(await gate(context, "billing.view")));

export const adminLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(730).default(90) }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await import("./admin.server")).ledger(await gate(context, "billing.view"), data.days));

export const adminLedgerCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(730).default(90) }).parse(d ?? {}))
  .handler(async ({ data, context }) => (await import("./admin.server")).ledgerCsv(await gate(context, "billing.export"), data.days));

export const adminRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ paymentId: z.string().min(4).max(40), amount: z.number().positive().max(10_000_000).nullable(), reason: z.string().min(3).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    (await import("./admin.server")).refundPayment(await gate(context, "billing.refund"), data.paymentId, data.amount, data.reason),
  );

/* ── coupons ─────────────────────────────────────────────── */

export const adminCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("./admin.server")).listCoupons(await gate(context, "coupons.manage")));

export const adminCreateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z.string().min(3).max(32),
        kind: z.enum(["percent", "flat", "trial_days"]),
        value: z.number().positive().max(1_000_000),
        razorpayOfferId: z.string().max(60).nullable().optional(),
        plans: z.array(z.enum(["starter", "professional", "scale"])).nullable().optional(),
        cycles: z.array(z.enum(["monthly", "annual"])).nullable().optional(),
        expiresAt: z.string().max(40).nullable().optional(),
        maxRedemptions: z.number().int().positive().nullable().optional(),
        perFirmLimit: z.number().int().positive().max(100).optional(),
        note: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => (await import("./admin.server")).createCoupon(await gate(context, "coupons.manage"), data));

export const adminSetCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(3).max(32), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).setCouponActive(await gate(context, "coupons.manage"), data.code, data.active));

/* ── team and audit ──────────────────────────────────────── */

export const adminTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("./admin.server")).team(await gate(context, "team.manage")));

const ROLE = z.enum(["super_admin", "ops_admin", "support_agent", "finance_manager"]);

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: ROLE }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).setRole(await gate(context, "team.manage"), data.userId, data.role));

export const adminInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().email().max(200), role: ROLE }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).inviteAdmin(await gate(context, "team.manage"), data.email, data.role));

export const adminRevokeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).revokeSessions(await gate(context, "team.manage"), data.userId));

export const adminDeactivate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await import("./admin.server")).deactivateAdmin(await gate(context, "team.manage"), data.userId));

export const adminAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await import("./admin.server")).auditLog(await gate(context, "audit.view")));
