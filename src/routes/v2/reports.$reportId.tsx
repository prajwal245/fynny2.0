import { createFileRoute } from "@tanstack/react-router";
import ReportDetailPage from "@/v2/pages/ReportDetailPage";

export const Route = createFileRoute("/v2/reports/$reportId")({ component: ReportDetailPage });
