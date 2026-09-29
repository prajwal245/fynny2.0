import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_main/dashboard/tds-tax")({
  component: () => <Navigate to="/dashboard/gst?tab=tds" replace />,
});
