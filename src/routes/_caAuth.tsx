import { createFileRoute } from "@tanstack/react-router";
import { CAAuthProvider } from "@/contexts/CAAuthContext";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_caAuth")({
  component: () => (
    <CAAuthProvider>
      <Outlet />
    </CAAuthProvider>
  ),
});
