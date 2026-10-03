import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import OnboardingPage from "@/pages/OnboardingPage";

export const Route = createFileRoute("/_main/onboarding")({
  head: () => noindexHead("Get started — FynHelp"),
  component: OnboardingPage,
});
