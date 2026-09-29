import { createFileRoute } from "@tanstack/react-router";
import ClientsPage from "@/v2/pages/ClientsPage";

export const Route = createFileRoute("/v2/clients/")({ component: ClientsPage });
