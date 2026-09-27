import { createFileRoute } from "@tanstack/react-router";
import PayrollPlannerPage from "@/pages/dashboard/PayrollPlannerPage";

export const Route = createFileRoute("/_main/dashboard/payroll")({
  component: PayrollPlannerPage,
});
