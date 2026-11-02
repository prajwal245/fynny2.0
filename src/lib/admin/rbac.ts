/**
 * Admin roles and what each may do. One table, used by the server (which
 * enforces it) and by the admin screens (which only hide what is refused).
 *
 * Database role names are kept from the earlier admin: ops_admin is the
 * Operations Manager. The legacy "admin" role has Super Admin rights.
 */
export type AdminRole = "super_admin" | "ops_admin" | "support_agent" | "finance_manager" | "admin" | "analyst" | "content_collaborator";

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "ops_admin", "support_agent", "finance_manager", "analyst", "content_collaborator"];

/** Roles a Super Admin can hand out from Admin Team. */
export const ASSIGNABLE_ROLES: AdminRole[] = ["super_admin", "ops_admin", "support_agent", "finance_manager", "content_collaborator"];

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Super Admin (legacy)",
  ops_admin: "Operations Manager",
  support_agent: "Support Agent",
  finance_manager: "Finance Manager",
  analyst: "Analyst (read only)",
  content_collaborator: "Content Collaborator",
};

export type Permission =
  | "dashboard.view"
  | "team.manage"
  | "firms.view"
  | "firms.update"
  | "firms.delete"
  | "press.manage"
  | "kyc.review"
  | "ops.view"
  | "ops.retry"
  | "billing.view"
  | "billing.refund"
  | "billing.refund.unlimited"
  | "billing.export"
  | "coupons.manage"
  | "support.manage"
  | "audit.view";

const ALL: Permission[] = [
  "dashboard.view", "team.manage", "firms.view", "firms.update", "firms.delete", "press.manage", "kyc.review", "ops.view", "ops.retry",
  "billing.view", "billing.refund", "billing.refund.unlimited", "billing.export", "coupons.manage", "support.manage", "audit.view",
];

export const PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL,
  admin: ALL,
  ops_admin: ["dashboard.view", "firms.view", "firms.update", "press.manage", "kyc.review", "ops.view", "ops.retry", "support.manage"],
  support_agent: ["dashboard.view", "firms.view", "ops.view", "billing.view", "billing.refund", "support.manage"],
  finance_manager: ["dashboard.view", "billing.view", "billing.refund", "billing.refund.unlimited", "billing.export", "coupons.manage"],
  analyst: ["dashboard.view"],
  // Writes the blog, press and resources. No customers, billing, firms or support data.
  content_collaborator: ["press.manage"],
};

/** The most a Support Agent may refund in one go, in rupees. */
export const SUPPORT_REFUND_LIMIT = 5000;

export function can(roles: readonly string[], p: Permission): boolean {
  return roles.some((r) => (PERMISSIONS[r as AdminRole] ?? []).includes(p));
}

export function isAdminRole(r: string): r is AdminRole {
  return (ADMIN_ROLES as string[]).includes(r);
}

export const IDLE_LIMIT_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60_000;
