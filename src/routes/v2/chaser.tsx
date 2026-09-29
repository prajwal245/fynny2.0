import { createFileRoute } from "@tanstack/react-router";
import ChaserPage from "@/v2/pages/ChaserPage";

export const Route = createFileRoute("/v2/chaser")({ component: ChaserPage });
