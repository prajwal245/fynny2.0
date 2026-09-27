import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Filter = {
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
  table: string;
  filter?: string;
};

type Status = "connecting" | "live" | "offline";

/**
 * Subscribe to postgres_changes for one or more filters.
 * Calls onChange on every event. Falls back to polling (every `pollMs`) if
 * realtime fails to connect within ~6s, or after a SUBSCRIBE error.
 * Shows a toast on first successful connect.
 */
export function useRealtime(
  channelName: string,
  filters: Filter[],
  onChange: (payload: { new: any; old: any; eventType: string; table: string }) => void,
  opts: { pollMs?: number; toastOnConnect?: boolean } = {},
) {
  const { pollMs = 30000, toastOnConnect = true } = opts;
  const [status, setStatus] = useState<Status>("connecting");
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const toastedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;
    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = window.setInterval(() => {
        for (const f of filters) {
          cbRef.current({ new: null, old: null, eventType: "POLL", table: f.table });
        }
      }, pollMs);
    };

    let ch = supabase.channel(channelName);
    for (const f of filters) {
      ch = (ch as any).on(
        "postgres_changes",
        { event: f.event ?? "*", schema: f.schema ?? "public", table: f.table, filter: f.filter },
        (payload: any) => {
          cbRef.current({
            new: payload.new,
            old: payload.old,
            eventType: payload.eventType ?? payload.event,
            table: f.table,
          });
        },
      );
    }
    const sub = ch.subscribe((s) => {
      if (cancelled) return;
      if (s === "SUBSCRIBED") {
        setStatus("live");
        if (toastOnConnect && !toastedRef.current) {
          toastedRef.current = true;
          toast.success("Live updates enabled");
        }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined; }
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStatus("offline");
        startPolling();
      }
    });

    // Safety: if not subscribed in 6s, start polling.
    const guard = window.setTimeout(() => {
      if (!cancelled && status !== "live") startPolling();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(guard);
      if (pollTimer) clearInterval(pollTimer);
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  return status;
}
