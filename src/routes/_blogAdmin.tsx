import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { BlogAdminProvider } from "@/contexts/BlogAdminContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_blogAdmin")({
  head: () => noindexHead(),
  component: () => (
    <BlogAdminProvider>
      <Outlet />
    </BlogAdminProvider>
  ),
});
