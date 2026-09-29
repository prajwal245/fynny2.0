import { createFileRoute } from "@tanstack/react-router";
import CATasksPage, { type TaskTab } from "@/pages/ca/CATasksPage";

const TABS: TaskTab[] = ["all", "mine", "overdue", "today"];

export const Route = createFileRoute("/_caAuth/ca/_portal/tasks")({
  validateSearch: (search: Record<string, unknown>): { tab?: TaskTab } => {
    const tab = String(search["tab"] ?? "");
    return TABS.includes(tab as TaskTab) ? { tab: tab as TaskTab } : {};
  },
  component: TasksRoute,
});

function TasksRoute() {
  const { tab } = Route.useSearch();
  return <CATasksPage key={tab ?? "all"} initialTab={tab ?? "all"} />;
}
