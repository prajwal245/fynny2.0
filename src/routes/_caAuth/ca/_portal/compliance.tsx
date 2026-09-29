import { createFileRoute } from "@tanstack/react-router";
import CACompliancePage from "@/pages/ca/CACompliancePage";

export const Route = createFileRoute("/_caAuth/ca/_portal/compliance")({
  component: CACompliancePage,
});
