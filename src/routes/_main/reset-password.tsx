import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import ResetPasswordPage from "@/pages/ResetPasswordPage";

export const Route = createFileRoute("/_main/reset-password")({
  head: () => noindexHead("Reset password — FynHelp"),
  component: ResetPasswordPage,
});
