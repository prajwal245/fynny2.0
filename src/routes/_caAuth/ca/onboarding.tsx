import { createFileRoute } from "@tanstack/react-router";
import CAOnboardingPage from "@/pages/ca/CAOnboardingPage";

export const Route = createFileRoute("/_caAuth/ca/onboarding")({
  component: CAOnboardingPage,
});
