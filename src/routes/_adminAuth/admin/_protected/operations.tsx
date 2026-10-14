import { createFileRoute } from "@tanstack/react-router";
import OperationsPage from "@/pages/admin/control/OperationsPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/operations")({
  component: OperationsPage,
});
