import { createFileRoute, redirect } from "@tanstack/react-router";

// CA firms now use the FynHelp practice app: every old CA entry point leads there.
export const Route = createFileRoute("/_caAuth/ca/register")({
  beforeLoad: () => {
    throw redirect({ href: "/v2/onboarding" });
  },
});
