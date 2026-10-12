import { createFileRoute, redirect } from "@tanstack/react-router";

// The old SME dashboard is retired: everyone signs in to the practice workspace.
export const Route = createFileRoute("/_main/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/v2", statusCode: 301 });
  },
  component: () => null,
});
