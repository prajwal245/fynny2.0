import { createFileRoute } from "@tanstack/react-router";
import ProtectedCeoRoute from "@/components/admin/ProtectedCeoRoute";
import AdminCeoViewPage from "@/pages/admin/AdminCeoViewPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/ceo-view")({
  component: () => (
    <ProtectedCeoRoute>
      <AdminCeoViewPage />
    </ProtectedCeoRoute>
  ),
});
