import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_blogAdmin/blog-admin/")({
  component: () => <Navigate to="/blog-admin/login" replace />,
});
