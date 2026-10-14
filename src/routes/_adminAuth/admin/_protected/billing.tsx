import { createFileRoute } from "@tanstack/react-router";
import BillingPage from "@/pages/admin/control/BillingPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/billing")({
  component: BillingPage,
});
