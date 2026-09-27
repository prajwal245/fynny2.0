import { createFileRoute } from "@tanstack/react-router";
import CAIntegrationsPage from "@/pages/ca/CAIntegrationsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/integrations")({
  component: CAIntegrationsPage,
});
