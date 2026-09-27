import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_main/dashboard/360")({
  component: () => <Navigate to="/dashboard/liquidity" replace />,
});
