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
export function useExceptionWork(refresh: () => Promise<void>) {
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

  /** Runs a server call, says what went wrong in plain words, and refreshes. Returns true when it worked. */
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string): Promise<boolean> => {
      try {
        await fn();
        if (ok) toast.success(ok);
        await refresh();
        return true;
      } catch (e) {
        toast.error(message(e));
        return false;
      }
    },
    [refresh],
  );

  return {
    members,
    me,
    loaded,
    nameOf,
    assign: (ids: string[], ownerId: string | null, note?: string) =>
      run(() => assignPracticeExceptions({ data: { ids, owner_id: ownerId, note } }), ownerId ? `Assigned ${ids.length} to ${nameOf(ownerId) ?? "them"}.` : `${ids.length} unassigned.`),
    setStatus: (id: string, status: WorkStatus, note?: string) => run(() => setPracticeExceptionStatus({ data: { id, status, note } })),
    saveRemark: (id: string, patch: { remark?: string; dueDate?: string | null }) => run(() => setPracticeExceptionRemark({ data: { id, remark: patch.remark, due_date: patch.dueDate } }), "Saved."),
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
