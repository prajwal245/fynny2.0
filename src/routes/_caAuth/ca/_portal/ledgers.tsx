import { createFileRoute } from "@tanstack/react-router";
import CALedgersPage from "@/pages/ca/os/CALedgersPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/ledgers")({
  component: CALedgersPage,
});
