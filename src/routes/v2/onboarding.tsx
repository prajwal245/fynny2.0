import { createFileRoute } from "@tanstack/react-router";
import OnboardingPage from "@/v2/pages/OnboardingPage";

export const Route = createFileRoute("/v2/onboarding")({ component: OnboardingPage });
