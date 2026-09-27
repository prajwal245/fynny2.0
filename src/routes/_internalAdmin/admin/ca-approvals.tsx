import { createFileRoute } from "@tanstack/react-router";
import CAApprovalsPage from "@/pages/admin/CAApprovalsPage";

export const Route = createFileRoute("/_internalAdmin/admin/ca-approvals")({
  component: CAApprovalsPage,
});
