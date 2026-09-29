import { createFileRoute } from "@tanstack/react-router";
import CAAuthCallbackPage from "@/pages/ca/CAAuthCallbackPage";

export const Route = createFileRoute("/_caAuth/ca/auth/callback")({
  component: CAAuthCallbackPage,
});
