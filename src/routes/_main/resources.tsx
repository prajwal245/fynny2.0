import { createFileRoute, redirect } from "@tanstack/react-router";

// The old SME resource library was replaced by the product guide.
export const Route = createFileRoute("/_main/resources")({
  beforeLoad: () => {
    throw redirect({ to: "/guide", statusCode: 301 });
  },
  component: () => null,
});
