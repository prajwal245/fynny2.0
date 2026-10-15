import { createFileRoute } from "@tanstack/react-router";
import ClientsPage from "@/v2/pages/ClientsPage";

export const Route = createFileRoute("/app/clients/")({ component: ClientsPage });
