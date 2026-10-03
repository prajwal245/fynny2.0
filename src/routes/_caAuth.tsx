import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import { CAAuthProvider } from "@/contexts/CAAuthContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_caAuth")({
  head: () => noindexHead(),
  component: () => (
    <CAAuthProvider>
      <Outlet />
    </CAAuthProvider>
  ),
});
