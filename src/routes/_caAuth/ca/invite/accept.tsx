import { createFileRoute } from "@tanstack/react-router";
import CAInviteAcceptPage from "@/pages/ca/CAInviteAcceptPage";

export const Route = createFileRoute("/_caAuth/ca/invite/accept")({
  component: CAInviteAcceptPage,
});
