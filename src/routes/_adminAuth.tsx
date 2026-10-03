import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_adminAuth")({
  head: () => noindexHead(),
  component: () => (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  ),
});
