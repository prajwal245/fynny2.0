import { createFileRoute } from "@tanstack/react-router";
import ClientWorkspacePage from "@/v2/pages/ClientWorkspacePage";

export const Route = createFileRoute("/v2/clients/$clientId")({ component: ClientWorkspacePage });
