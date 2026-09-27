import { createFileRoute } from "@tanstack/react-router";
import CABulkActionsPage from "@/pages/ca/CABulkActionsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/bulk-actions")({
  component: CABulkActionsPage,
});
