import { createFileRoute } from "@tanstack/react-router";
import CashFlowPage from "@/pages/dashboard/CashFlowPage";

export const Route = createFileRoute("/_main/dashboard/cash-flow")({
  component: CashFlowPage,
});
