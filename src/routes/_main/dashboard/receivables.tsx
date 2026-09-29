import { createFileRoute } from "@tanstack/react-router";
import ReceivablesPage from "@/pages/dashboard/ReceivablesPage";

export const Route = createFileRoute("/_main/dashboard/receivables")({
  component: ReceivablesPage,
});
