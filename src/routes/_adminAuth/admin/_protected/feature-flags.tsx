import { createFileRoute } from "@tanstack/react-router";
import AdminFeatureFlagsPage from "@/pages/admin/AdminFeatureFlagsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/feature-flags")({
  component: AdminFeatureFlagsPage,
});
