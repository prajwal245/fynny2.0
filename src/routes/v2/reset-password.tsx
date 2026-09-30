import { createFileRoute } from "@tanstack/react-router";
import ResetPasswordPage from "@/v2/pages/ResetPasswordPage";

export const Route = createFileRoute("/v2/reset-password")({ component: ResetPasswordPage });
