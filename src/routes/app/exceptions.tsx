import { createFileRoute } from "@tanstack/react-router";
import ExceptionsPage from "@/v2/pages/ExceptionsPage";

export const Route = createFileRoute("/app/exceptions")({ component: ExceptionsPage });
