import { createFileRoute } from "@tanstack/react-router";
import EmployeesListPage from "@/pages/dashboard/EmployeesListPage";

export const Route = createFileRoute("/_main/dashboard/employees")({
  component: EmployeesListPage,
});
