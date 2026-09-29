import { createFileRoute } from "@tanstack/react-router";
import InternLoginPage from "@/pages/intern/InternLoginPage";

export const Route = createFileRoute("/_blogAdmin/intern/login")({
  component: InternLoginPage,
});
