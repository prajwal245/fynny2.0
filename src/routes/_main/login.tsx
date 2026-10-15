import { createFileRoute, redirect } from "@tanstack/react-router";

// The old SME sign-in is retired; links already shared land on the workspace sign-in.
export const Route = createFileRoute("/_main/login")({
  beforeLoad: ({ location }) => {
    const mode = new URLSearchParams(location.searchStr).get("mode") === "signup" ? "signup" : "signin";
    throw redirect({ href: `/app/onboarding?mode=${mode}` });
  },
  component: () => null,
});
