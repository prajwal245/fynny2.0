import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_main/dashboard/settings/profile")({
  component: () => <Navigate to="/dashboard/settings/personal" replace />,
});
