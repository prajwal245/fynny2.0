import { createFileRoute } from "@tanstack/react-router";
import SettingsSecurityPage from "@/pages/dashboard/settings/SecurityPage";

export const Route = createFileRoute("/_main/dashboard/settings/security")({
  component: SettingsSecurityPage,
});
