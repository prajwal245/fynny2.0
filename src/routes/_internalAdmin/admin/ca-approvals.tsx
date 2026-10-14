import { createFileRoute, redirect } from "@tanstack/react-router";

// CA firms now sign up through the practice app and are approved on creation; firms are managed in Firms.
export const Route = createFileRoute("/_internalAdmin/admin/ca-approvals")({
  beforeLoad: () => {
    throw redirect({ href: "/admin/firms", replace: true });
  },
});
