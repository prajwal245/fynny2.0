/**
 * Set a new password from the emailed reset link. Supabase signs the user in
 * from the link (a recovery session); we then only ask for the new password.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { V } from "../ui";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"waiting" | "ready" | "expired">("waiting");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let done = false;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        done = true;
        setReady("ready");
      }
    });
    void supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) {
        done = true;
        setReady("ready");
      }
    });
    // The link carries the session; if none arrives it has expired or was used.
    const t = setTimeout(() => {
      if (!done) setReady("expired");
    }, 4000);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Use a password of at least six characters.");
    if (password !== confirm) return toast.error("The two passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You are signed in.");
    navigate({ to: "/v2" });
  };

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <div className="v2-card" style={{ padding: 26, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: V.gray }}>
            <KeyRound size={20} />
          </span>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Set a new password</h2>
            <p style={{ fontSize: 13, color: V.body, margin: "4px 0 0" }}>For your FynHelp practice login.</p>
          </div>
        </div>
        {ready === "waiting" && <p style={{ fontSize: 13, color: V.muted, margin: 0 }}>Checking your reset link…</p>}
        {ready === "expired" && (
          <div style={{ display: "grid", gap: 12 }} data-testid="reset-expired">
            <p style={{ fontSize: 13.5, color: V.body, margin: 0 }}>
              This reset link has expired or was already used. Request a new one.
            </p>
            <a className="v2-btn v2-btn-primary" style={{ justifySelf: "start" }} href="/v2/onboarding?mode=forgot">
              Send a new link
            </a>
          </div>
        )}
        {ready === "ready" && (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div>
              <label className="v2-label">New password</label>
              <input className="v2-input" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least six characters" />
            </div>
            <div>
              <label className="v2-label">Confirm new password</label>
              <input className="v2-input" type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button className="v2-btn v2-btn-primary" type="submit" disabled={busy} style={{ justifySelf: "start" }}>
              {busy ? "Saving" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
