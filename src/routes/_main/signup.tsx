import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/_main/signup")({
  head: () => noindexHead(),
  component: () => <Navigate to="/login?mode=signup" replace />,
});
