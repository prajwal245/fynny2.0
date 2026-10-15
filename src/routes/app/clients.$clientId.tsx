import { createFileRoute } from "@tanstack/react-router";
import ClientWorkspacePage from "@/v2/pages/ClientWorkspacePage";

export const Route = createFileRoute("/app/clients/$clientId")({ component: ClientWorkspacePage });
