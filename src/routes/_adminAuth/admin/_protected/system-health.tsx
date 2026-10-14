import { createFileRoute } from "@tanstack/react-router";
import SystemHealthPage from "@/pages/admin/control/SystemHealthPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/system-health")({
  component: SystemHealthPage,
});
