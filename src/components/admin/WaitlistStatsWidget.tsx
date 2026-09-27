import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowRight, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  email: string | null;
  name: string | null;
  company_name: string | null;
  created_at: string;
};

function timeAgo(s: string) {
  const d = new Date(s).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return `${dy}d ago`;
}

export default function WaitlistStatsWidget() {
  const [recent, setRecent] = useState<Row[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [recentRes, countRes] = await Promise.all([
        supabase
          .from("waitlist")
          .select("id,email,name,company_name,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("waitlist")
          .select("*", { count: "exact", head: true }),
      ]);
      if (cancelled) return;
      if (recentRes.error) setError(recentRes.error.message);
      else setRecent((recentRes.data ?? []) as Row[]);
      if (!countRes.error) setTotal(countRes.count ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid hsl(var(--fyn-ink) / 0.08)",
      borderRadius: 12,
      padding: 24,
      boxShadow: "0 2px 8px hsl(var(--fyn-ink) / 0.04)",
      minHeight: 380,
      display: "flex", flexDirection: "column",
    }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserPlus size={18} color="#8B6914" />
          <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 16, color: "hsl(var(--fyn-ink))" }}>
            Waitlist
          </h3>
        </div>
        {total !== null && (
          <span style={{
            background: "rgba(139,105,20,0.15)", color: "#8B6914",
            padding: "3px 10px", borderRadius: 6,
            fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 11,
          }}>
            {total.toLocaleString("en-IN")} total
          </span>
        )}
      </div>

      <div className="flex-1">
        {error ? (
          <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "#C41E1E" }}>
            Failed to load: {error}
          </p>
        ) : recent === null ? (
          <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.5)" }}>
            Loading…
          </p>
        ) : recent.length === 0 ? (
          <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.5)" }}>
            No signups yet.
          </p>
        ) : (
          <div className="space-y-3">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-2"
                style={{ borderBottom: "1px solid rgba(23,18,8,0.06)" }}>
                <div className="min-w-0">
                  <div style={{
                    fontFamily: "Roboto, sans-serif", fontWeight: 500, fontSize: 13,
                    color: "hsl(var(--fyn-ink))",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.company_name || s.name || s.email || "-"}
                  </div>
                  <div style={{
                    fontFamily: "Roboto, sans-serif", fontSize: 11,
                    color: "hsl(var(--fyn-ink) / 0.55)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.email}
                  </div>
                </div>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "hsl(var(--fyn-ink) / 0.5)", whiteSpace: "nowrap" }}>
                  {timeAgo(s.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        to="/admin/waitlist"
        className="mt-4 inline-flex items-center gap-1"
        style={{
          fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13,
          color: "#8B6914", textDecoration: "none",
        }}
      >
        View all signups <ArrowRight size={14} />
      </Link>
    </div>
  );
}
