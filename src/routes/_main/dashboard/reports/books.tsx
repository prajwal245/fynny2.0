import { createFileRoute } from "@tanstack/react-router";
import BooksOfAccountsPage from "@/pages/dashboard/BooksOfAccountsPage";

export const Route = createFileRoute("/_main/dashboard/reports/books")({
  component: BooksOfAccountsPage,
});
