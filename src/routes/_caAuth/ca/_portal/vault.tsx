import { createFileRoute } from "@tanstack/react-router";
import CAVaultPage from "@/pages/ca/CAVaultPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/vault")({
  component: CAVaultPage,
});
