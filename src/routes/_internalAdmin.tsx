import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import AdminGuard from "@/components/admin/AdminGuard";
import InternalAdminLayout from "@/components/admin/InternalAdminLayout";

export const Route = createFileRoute("/_internalAdmin")({
  head: () => noindexHead(),
  component: () => (
    <AdminGuard>
      <InternalAdminLayout />
    </AdminGuard>
  ),
});
