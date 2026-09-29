import { createFileRoute } from "@tanstack/react-router";
import IntegrationsPage from "@/pages/dashboard/settings/IntegrationsPage";

export const Route = createFileRoute("/_main/dashboard/settings/integrations")({
  component: IntegrationsPage,
});
