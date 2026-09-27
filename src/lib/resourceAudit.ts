import { logAdminAction } from "@/lib/adminAudit";

/**
 * Resource file audit trail.
 *
 * Admin-side actions (upload / replace / publish / edit / delete) go into
 * admin_audit_logs with target_type = 'resource'. resources.id is a text slug
 * while admin_audit_logs.target_id is a uuid column, so the slug is carried in
 * details.resource_id instead.
 *
 * Public download access is recorded separately in resource_access_logs by the
 * download-resource edge function.
 */
export type ResourceAuditAction =
  | "resource_create"
  | "resource_update"
  | "resource_delete"
  | "resource_publish"
  | "resource_unpublish"
  | "resource_file_upload"
  | "resource_file_replace"
  | "resource_file_unlink"
  | "resource_file_relink"
  | "resource_orphan_delete"
  | "resource_archive"
  | "resource_unarchive";

export async function logResourceAction(
  action: ResourceAuditAction,
  resource: { id?: string | null; title?: string | null },
  details: Record<string, unknown> = {},
): Promise<void> {
  await logAdminAction({
    action,
    target_type: "resource",
    details: {
      resource_id: resource.id ?? null,
      resource_title: resource.title ?? null,
      at: new Date().toISOString(),
      ...details,
    },
  });
}
