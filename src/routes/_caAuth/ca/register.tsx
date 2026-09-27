import { createFileRoute } from "@tanstack/react-router";
import CARegisterPage from "@/pages/ca/CARegisterPage";

export const Route = createFileRoute("/_caAuth/ca/register")({
  component: CARegisterPage,
});
