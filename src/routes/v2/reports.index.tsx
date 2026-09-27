import { createFileRoute } from "@tanstack/react-router";
import ReportsPage from "@/v2/pages/ReportsPage";

export const Route = createFileRoute("/v2/reports/")({ component: ReportsPage });
