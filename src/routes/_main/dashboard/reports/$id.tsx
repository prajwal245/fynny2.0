import { createFileRoute } from "@tanstack/react-router";
import CFOReportDetailPage from "@/pages/dashboard/CFOReportDetailPage";

export const Route = createFileRoute("/_main/dashboard/reports/$id")({
  component: CFOReportDetailPage,
});
