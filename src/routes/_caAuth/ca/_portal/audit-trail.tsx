import { createFileRoute } from "@tanstack/react-router";
import CAAuditTrailPage from "@/pages/ca/os/CAAuditTrailPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/audit-trail")({
  component: CAAuditTrailPage,
});
