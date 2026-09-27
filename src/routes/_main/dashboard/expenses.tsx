import { createFileRoute } from "@tanstack/react-router";
import ExpensesListPage from "@/pages/dashboard/ExpensesListPage";

export const Route = createFileRoute("/_main/dashboard/expenses")({
  component: ExpensesListPage,
});
