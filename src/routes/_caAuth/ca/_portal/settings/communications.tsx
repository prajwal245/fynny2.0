import { createFileRoute } from "@tanstack/react-router";
import CACommSettingsPage from "@/pages/ca/CACommSettingsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/settings/communications")({
  component: CACommSettingsPage,
});
