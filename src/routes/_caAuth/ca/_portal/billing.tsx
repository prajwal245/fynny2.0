import { createFileRoute } from "@tanstack/react-router";
import CABillingPage from "@/pages/ca/CABillingPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/billing")({
  component: CABillingPage,
});
