import { createFileRoute } from "@tanstack/react-router";
import AdminSystemHealthPage from "@/pages/admin/AdminSystemHealthPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/system-health")({
  component: AdminSystemHealthPage,
});
