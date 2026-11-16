import { createFileRoute } from "@tanstack/react-router";
import ClosePage from "@/v2/pages/ClosePage";

export const Route = createFileRoute("/app/close")({ component: ClosePage });
