import { createFileRoute } from "@tanstack/react-router";
import CASettingsPage from "@/pages/ca/CASettingsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/settings/notifications")({
  component: CASettingsPage,
});
