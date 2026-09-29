import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_main/signup")({
  component: () => <Navigate to="/login?mode=signup" replace />,
});
