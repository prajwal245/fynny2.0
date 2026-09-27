import { createFileRoute } from "@tanstack/react-router";
import ExceptionsPage from "@/v2/pages/ExceptionsPage";

export const Route = createFileRoute("/v2/exceptions")({ component: ExceptionsPage });
