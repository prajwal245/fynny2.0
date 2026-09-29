import { createFileRoute } from "@tanstack/react-router";
import AdminInternalAccessPage from "@/pages/admin/AdminInternalAccessPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/internal-access")({
  component: AdminInternalAccessPage,
});
