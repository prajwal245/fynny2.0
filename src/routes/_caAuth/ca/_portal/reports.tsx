import { createFileRoute } from "@tanstack/react-router";
import CAReportsPage from "@/pages/ca/CAReportsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/reports")({
  component: CAReportsPage,
});
