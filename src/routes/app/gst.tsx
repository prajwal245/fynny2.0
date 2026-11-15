import { createFileRoute } from "@tanstack/react-router";
import GstPage from "@/v2/pages/GstPage";

export const Route = createFileRoute("/app/gst")({ component: GstPage });
