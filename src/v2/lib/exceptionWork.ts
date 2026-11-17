import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  assignPracticeExceptions,
  getPracticeExceptionTimeline,
  getPracticeTeamMembers,
  reviewPracticeException,
  setPracticeExceptionRemark,
  setPracticeExceptionStatus,
} from "@/lib/practice/practice.functions";
import type { WorkStatus } from "@/lib/practice/exceptionKinds";

export interface TeamMember {
  userId: string;
  name: string;
  role: string;
  isYou: boolean;
}
export interface TimelineEvent {
  id: string;
  type: string;
  at: string;
  by: string;
  from: string | null;
  to: string | null;
  note: string | null;
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

let cache: TeamMember[] | null = null;

/** The firm's team, read once, and the actions a person takes on an exception. Every action refreshes the queue when it is done. */
export function useExceptionWork(refresh: () => Promise<void>, patch?: (ids: string[], p: Record<string, unknown>) => void) {
  const [members, setMembers] = useState<TeamMember[]>(cache ?? []);
  const [loaded, setLoaded] = useState(Boolean(cache));
  useEffect(() => {
    if (cache) return;
    let live = true;
    void getPracticeTeamMembers()
      .then((m) => {
        cache = m as TeamMember[];
        if (live) setMembers(cache);
      })
      .catch(() => undefined)
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);
  const me = members.find((m) => m.isYou) ?? null;
  const nameOf = useCallback((id: string | null | undefined) => (id ? (members.find((m) => m.userId === id)?.name ?? "A former member") : null), [members]);

  /**
   * Shows the change at once, saves it, and says what went wrong in plain words. A failure puts the screen back as the server has it.
   * The reload that confirms a success runs in the background, so nothing waits on it.
   */
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string, change?: { ids: string[]; patch: Record<string, unknown> }): Promise<boolean> => {
      if (change && patch) patch(change.ids, change.patch);
      try {
        await fn();
        if (ok) toast.success(ok);
        void refresh();
        return true;
      } catch (e) {
        toast.error(message(e));
        await refresh();
        return false;
      }
    },
    [refresh, patch],
  );

  return {
    members,
    me,
    loaded,
    nameOf,
    assign: (ids: string[], ownerId: string | null, note?: string) =>
      run(() => assignPracticeExceptions({ data: { ids, owner_id: ownerId, note } }), ownerId ? `Assigned ${ids.length} to ${nameOf(ownerId) ?? "them"}.` : `${ids.length} unassigned.`, { ids, patch: { ownerId } }),
    setStatus: (id: string, status: WorkStatus, note?: string) => run(() => setPracticeExceptionStatus({ data: { id, status, note } }), undefined, { ids: [id], patch: { workStatus: status } }),
    saveRemark: (id: string, patch: { remark?: string; dueDate?: string | null }) => run(() => setPracticeExceptionRemark({ data: { id, remark: patch.remark, due_date: patch.dueDate } }), "Saved.", { ids: [id], patch: { ...(patch.remark !== undefined ? { remark: patch.remark } : {}), ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}) } }),
    review: (id: string, action: "send" | "return" | "approve", o: { reviewerId?: string; note?: string } = {}) =>
      run(() => reviewPracticeException({ data: { id, action, reviewer_id: o.reviewerId, note: o.note } }), action === "send" ? "Sent for review." : action === "return" ? "Returned with your note." : "Approved."),
    timeline: async (id: string): Promise<TimelineEvent[]> => {
      try {
        return (await getPracticeExceptionTimeline({ data: { id } })) as TimelineEvent[];
      } catch {
        return [];
      }
    },
  };
}
