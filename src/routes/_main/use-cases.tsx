import { createFileRoute, redirect } from "@tanstack/react-router";

// Use cases now live on the pipeline page.
export const Route = createFileRoute("/_main/use-cases")({
  beforeLoad: () => {
    throw redirect({ to: "/pipeline", statusCode: 301 });
  },
  component: () => null,
});
