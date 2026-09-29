import { createFileRoute } from "@tanstack/react-router";
import { AuthProvider } from "@/contexts/AuthContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_main")({
  component: () => (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  ),
});
