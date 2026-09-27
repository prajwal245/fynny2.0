import { createFileRoute } from "@tanstack/react-router";
import AuditReadinessPage from "@/pages/dashboard/AuditReadinessPage";

export const Route = createFileRoute("/_main/dashboard/audit-readiness")({
  component: AuditReadinessPage,
});
