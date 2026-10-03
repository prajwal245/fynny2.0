import { createFileRoute } from "@tanstack/react-router";
import { noindexHead } from "@/lib/seo";
import LoginPage from "@/pages/LoginPage";

export const Route = createFileRoute("/_main/login")({
  head: () => noindexHead("Sign in — FynHelp"),
  component: LoginPage,
});
