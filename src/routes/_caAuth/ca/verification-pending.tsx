import { createFileRoute } from "@tanstack/react-router";
import CAVerificationPendingPage from "@/pages/ca/CAVerificationPendingPage";

export const Route = createFileRoute("/_caAuth/ca/verification-pending")({
  component: CAVerificationPendingPage,
});
