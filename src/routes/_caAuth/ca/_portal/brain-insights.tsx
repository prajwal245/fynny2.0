import { createFileRoute } from "@tanstack/react-router";
import CABrainInsightsPage from "@/pages/ca/CABrainInsightsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/brain-insights")({
  component: CABrainInsightsPage,
});
