import { createFileRoute } from "@tanstack/react-router";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_adminAuth")({
  component: () => (
    <AdminAuthProvider>
      <Outlet />
    </AdminAuthProvider>
  ),
});
