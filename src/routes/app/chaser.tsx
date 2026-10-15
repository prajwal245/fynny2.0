import { createFileRoute } from "@tanstack/react-router";
import ChaserPage from "@/v2/pages/ChaserPage";

export const Route = createFileRoute("/app/chaser")({ component: ChaserPage });
