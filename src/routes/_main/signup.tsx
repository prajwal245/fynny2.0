import { createFileRoute, redirect } from "@tanstack/react-router";

// Sign-up lives in the practice workspace.
export const Route = createFileRoute("/_main/signup")({
  beforeLoad: () => {
    throw redirect({ href: "/v2/onboarding?mode=signup" });
  },
  component: () => null,
});
