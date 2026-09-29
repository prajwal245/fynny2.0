import { createFileRoute } from "@tanstack/react-router";
import CAClientsPage from "@/pages/ca/CAClientsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/clients/")({
  component: CAClientsPage,
});
