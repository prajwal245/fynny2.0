import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/pages/dashboard/settings/SettingsPage";

export const Route = createFileRoute("/_main/dashboard/settings")({
  component: SettingsPage,
});
