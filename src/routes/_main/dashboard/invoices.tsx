import { createFileRoute } from "@tanstack/react-router";
import InvoicesListPage from "@/pages/dashboard/InvoicesListPage";

export const Route = createFileRoute("/_main/dashboard/invoices")({
  component: InvoicesListPage,
});
