import { createFileRoute } from "@tanstack/react-router";
import CAAlertMonitorPage from "@/pages/ca/CAAlertMonitorPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/notifications")({
  component: CAAlertMonitorPage,
});
