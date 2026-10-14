import { createFileRoute, redirect } from "@tanstack/react-router";

// Replaced by the FynHelp admin control pages; old links land on the page that took over.
export const Route = createFileRoute("/_adminAuth/admin/_protected/audit-logs")({
  beforeLoad: () => {
    throw redirect({ href: "/admin/security-log", replace: true });
  },
});
