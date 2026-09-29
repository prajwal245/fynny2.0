import { createFileRoute } from "@tanstack/react-router";
import PayablesPage from "@/pages/dashboard/PayablesPage";

export const Route = createFileRoute("/_main/dashboard/payables")({
  component: PayablesPage,
});
