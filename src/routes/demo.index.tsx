import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
  component: () => null,
});
