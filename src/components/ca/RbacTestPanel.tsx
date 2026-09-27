/**
 * Manual RBAC validation guide. Shown only while a firm has exactly one
 * member, so the partner can invite a test user and verify role restrictions
 * before onboarding staff. Progress is remembered in the browser and the
 * card hides itself once every check is done.
 */
import { useEffect, useState } from "react";
import { CA, CACard, CAButton } from "@/components/ca/portalUi";

const STORAGE_KEY = "rbac_checklist";

const CHECKS = [
  "Log in as Junior and try to create an invoice — the Save button should be disabled",
  "Try to lock a period in Close — should show permission denied",
  "Try to sign off on a working paper — should be blocked",
  "Try to open the Users page — should be read only with no Invite button",
];

export default function RbacTestPanel({
  onQuickInvite,
}: {
  onQuickInvite: (role: string) => void;
}) {
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as boolean[];
        if (Array.isArray(parsed) && parsed.length === CHECKS.length) return parsed;
      }
    } catch {
      // Ignore unreadable local state.
    }
    return CHECKS.map(() => false);
  });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      // Ignore write failures in restricted browsers.
    }
  }, [done]);

  const toggle = (i: number) =>
    setDone((prev) => prev.map((v, j) => (j === i ? !v : v)));

  // Hide entirely once every check is complete.
  if (done.every(Boolean)) return null;

  return (
    <CACard style={{ marginTop: 18, padding: 16, borderLeft: `3px solid ${CA.gold}` }}>
      <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700, color: CA.ink }}>
        Role access controls not yet validated
      </div>
      <div style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, marginTop: 8, lineHeight: 1.6 }}>
        Your firm has only one member. Before onboarding CA staff, invite a test user and verify role restrictions
        work correctly.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <CAButton onClick={() => onQuickInvite("junior")}>Quick invite as Junior</CAButton>
        <CAButton variant="ghost" onClick={() => onQuickInvite("manager")}>Quick invite as Manager</CAButton>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: CA.sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase", color: CA.faint, marginTop: 20, marginBottom: open ? 8 : 0,
        }}
      >
        {open ? "Hide" : "Show"} what to test after inviting a Junior
        <span style={{ fontFamily: CA.mono, marginLeft: 10, color: CA.muted, letterSpacing: 0 }}>
          {done.filter(Boolean).length} of {CHECKS.length} done
        </span>
      </button>

      {open && (
        <div style={{ display: "grid", gap: 2 }}>
          {CHECKS.map((c, i) => (
            <label
              key={c}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0",
                borderBottom: `0.5px solid ${CA.line}`, cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={done[i] ?? false} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
              <span
                style={{
                  fontFamily: CA.sans, fontSize: 13.5, lineHeight: 1.5,
                  color: done[i] ? CA.faint : CA.ink,
                  textDecoration: done[i] ? "line-through" : "none",
                }}
              >
                {c}
              </span>
            </label>
          ))}
        </div>
      )}
    </CACard>
  );
}
