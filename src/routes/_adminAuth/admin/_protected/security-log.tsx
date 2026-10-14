import { createFileRoute } from "@tanstack/react-router";
import SecurityLogPage from "@/pages/admin/control/SecurityLogPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/security-log")({
  component: SecurityLogPage,
});
