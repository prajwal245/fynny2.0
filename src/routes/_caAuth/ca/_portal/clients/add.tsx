import { createFileRoute } from "@tanstack/react-router";
import CAAddClientPage from "@/pages/ca/CAAddClientPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/clients/add")({
  component: CAAddClientPage,
});
