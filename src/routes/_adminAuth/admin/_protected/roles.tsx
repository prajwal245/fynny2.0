import { createFileRoute } from "@tanstack/react-router";
import ProtectedCeoRoute from "@/components/admin/ProtectedCeoRoute";
import AdminRolesPage from "@/pages/admin/AdminRolesPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/roles")({
  component: () => (
    <ProtectedCeoRoute>
      <AdminRolesPage />
    </ProtectedCeoRoute>
  ),
});
