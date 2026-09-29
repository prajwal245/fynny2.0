import { createFileRoute } from "@tanstack/react-router";
import CustomersPage from "@/pages/dashboard/CustomersPage";

export const Route = createFileRoute("/_main/dashboard/customers")({
  component: CustomersPage,
});
