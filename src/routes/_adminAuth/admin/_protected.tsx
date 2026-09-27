import { createFileRoute } from "@tanstack/react-router";
import { AdminProtected } from "@/components/admin/AdminLayout";
import AdminLayout from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/_adminAuth/admin/_protected")({
  component: () => (
    <AdminProtected>
      <AdminLayout />
    </AdminProtected>
  ),
});
