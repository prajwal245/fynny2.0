import { createFileRoute } from "@tanstack/react-router";
import CAVerificationPage from "@/pages/admin/CAVerificationPage";

export const Route = createFileRoute("/_adminAuth/admin/_protected/ca-verification")({
  component: CAVerificationPage,
});
