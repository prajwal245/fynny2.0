import { createFileRoute, redirect } from "@tanstack/react-router";

// The old SME onboarding is retired; firms set up in the practice workspace.
export const Route = createFileRoute("/_main/onboarding")({
  beforeLoad: () => {
    throw redirect({ href: "/app/onboarding?mode=signup" });
  },
  component: () => null,
});
