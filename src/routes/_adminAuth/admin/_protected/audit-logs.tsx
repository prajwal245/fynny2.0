import { createFileRoute } from "@tanstack/react-router";
import AdminAuditLogsPage from "@/pages/admin/AdminAuditLogsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/audit-logs")({
  component: AdminAuditLogsPage,
});
