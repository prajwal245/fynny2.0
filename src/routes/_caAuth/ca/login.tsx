import { createFileRoute } from "@tanstack/react-router";
import CALoginPage from "@/pages/ca/CALoginPage";

export const Route = createFileRoute("/_caAuth/ca/login")({
  component: CALoginPage,
});
