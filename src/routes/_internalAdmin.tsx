import { createFileRoute } from "@tanstack/react-router";
import AdminGuard from "@/components/admin/AdminGuard";
import InternalAdminLayout from "@/components/admin/InternalAdminLayout";

export const Route = createFileRoute("/_internalAdmin")({
  component: () => (
    <AdminGuard>
      <InternalAdminLayout />
    </AdminGuard>
  ),
});
