import { createFileRoute } from "@tanstack/react-router";
import CAEngagementsPage from "@/pages/ca/os/CAEngagementsPage";

export const Route = createFileRoute("/_caAuth/ca/_portal/engagements")({
  component: CAEngagementsPage,
});
