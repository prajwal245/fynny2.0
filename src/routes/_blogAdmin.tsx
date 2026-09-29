import { createFileRoute } from "@tanstack/react-router";
import { BlogAdminProvider } from "@/contexts/BlogAdminContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_blogAdmin")({
  component: () => (
    <BlogAdminProvider>
      <Outlet />
    </BlogAdminProvider>
  ),
});
