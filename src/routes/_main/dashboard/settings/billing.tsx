import { createFileRoute } from "@tanstack/react-router";
import BillingPage from "@/pages/dashboard/settings/BillingPage";

export const Route = createFileRoute("/_main/dashboard/settings/billing")({
  component: BillingPage,
});
