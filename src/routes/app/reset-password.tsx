import { createFileRoute } from "@tanstack/react-router";
import ResetPasswordPage from "@/v2/pages/ResetPasswordPage";

export const Route = createFileRoute("/app/reset-password")({ component: ResetPasswordPage });
