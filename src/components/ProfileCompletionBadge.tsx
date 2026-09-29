import { useState, useRef, useEffect } from "react";
import { Link } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type FieldDef = { key: string; label: string };

const FIELDS: FieldDef[] = [
  { key: "full_name", label: "Full name" },
  { key: "display_name", label: "Display name" },
  { key: "mobile", label: "Mobile number" },
  { key: "whatsapp_phone", label: "WhatsApp number" },
  { key: "role", label: "Role" },
  { key: "language_preference", label: "Language" },
];

const isFilled = (v: unknown) =>
  typeof v === "string" ? v.trim().length > 0 : v !== null && v !== undefined;

const ProfileCompletionBadge = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile-completion", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, display_name, mobile, whatsapp_phone, role, language_preference"
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filled = FIELDS.filter((f) => isFilled((profile as any)?.[f.key]));
  const missing = FIELDS.filter((f) => !isFilled((profile as any)?.[f.key]));
  const percent = Math.round((filled.length / FIELDS.length) * 100);

  // Color tier
  const tierColor =
    percent >= 90
      ? "hsl(142 71% 35%)" // green
      : percent >= 50
      ? "hsl(38 74% 41%)" // gold
      : "hsl(var(--fyn-red))";

  // Donut math
  const size = 28;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Profile completion ${percent} percent`}
        title={`Profile ${percent}% complete`}
        className="flex items-center gap-2 px-2 py-1 transition-colors hover:bg-[hsl(var(--fyn-ink-05))]"
        style={{ border: "1px solid hsl(var(--fyn-ink-10))" }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--fyn-ink-10))"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tierColor}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={c / 4}
            strokeLinecap="butt"
            style={{ transition: "stroke-dasharray 240ms ease" }}
          />
        </svg>
        <span
          className="font-mono"
          style={{
            color: "hsl(var(--fyn-ink))",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {percent}%
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 z-50 shadow-lg"
          style={{
            background: "hsl(var(--fyn-beige-card))",
            border: "1px solid hsl(var(--fyn-ink-10))",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3"
            style={{ background: "hsl(var(--fyn-ink))", color: "hsl(var(--fyn-beige))" }}
          >
            <p
              className="font-mono"
              style={{ fontSize: 10, letterSpacing: "0.18em", opacity: 0.6 }}
            >
              PROFILE · COMPLETION
            </p>
            <div className="flex items-baseline justify-between mt-1">
              <span className="font-serif" style={{ fontSize: 22, fontWeight: 600 }}>
                {percent}%
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 10, letterSpacing: "0.12em", opacity: 0.7 }}
              >
                {filled.length}/{FIELDS.length} FIELDS
              </span>
            </div>
            <div
              className="mt-2 h-1"
              style={{ background: "hsl(var(--fyn-beige) / 0.15)" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  background: tierColor,
                  transition: "width 240ms ease",
                }}
              />
            </div>
          </div>

          {/* Body */}
          <div className="p-4">
            {missing.length === 0 ? (
              <p
                className="font-mono"
                style={{
                  color: "hsl(var(--fyn-ink) / 0.65)",
                  fontSize: 12,
                  letterSpacing: "0.04em",
                }}
              >
                ✓ All profile fields complete.
              </p>
            ) : (
              <>
                <p
                  className="font-mono mb-2"
                  style={{
                    color: "hsl(var(--fyn-ink) / 0.45)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                  }}
                >
                  Missing fields
                </p>
                <ul className="space-y-1.5">
                  {missing.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center gap-2"
                      style={{ color: "hsl(var(--fyn-ink))", fontSize: 13 }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 5,
                          height: 5,
                          background: "hsl(var(--fyn-red))",
                          display: "inline-block",
                        }}
                      />
                      {f.label}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Link
              to="/dashboard/settings/profile"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 font-mono"
              style={{
                background: "hsl(var(--fyn-red) / 0.08)",
                border: "1px solid hsl(var(--fyn-red))",
                color: "hsl(var(--fyn-red))",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {missing.length === 0 ? "Edit profile" : "Complete profile"} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileCompletionBadge;
