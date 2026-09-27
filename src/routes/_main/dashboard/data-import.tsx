import { createFileRoute } from "@tanstack/react-router";
import DataImportPage from "@/pages/dashboard/DataImportPage";

export const Route = createFileRoute("/_main/dashboard/data-import")({
  component: DataImportPage,
});
