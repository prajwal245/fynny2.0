import { createFileRoute } from "@tanstack/react-router";
import SettingsPage from "@/v2/pages/SettingsPage";

export const Route = createFileRoute("/v2/settings")({ component: SettingsPage });
