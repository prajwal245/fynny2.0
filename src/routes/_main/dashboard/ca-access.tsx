import { createFileRoute } from "@tanstack/react-router";
import CAAccessOverviewPage from "@/pages/dashboard/CAAccessOverviewPage";

export const Route = createFileRoute("/_main/dashboard/ca-access")({
  component: CAAccessOverviewPage,
});
