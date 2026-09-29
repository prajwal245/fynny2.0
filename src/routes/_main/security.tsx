import { createFileRoute } from "@tanstack/react-router";
import PublicSecurityPage from "@/pages/SecurityPage";

export const Route = createFileRoute("/_main/security")({
  component: PublicSecurityPage,
});
