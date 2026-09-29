/**
 * Two-factor authentication (TOTP) for CA portal accounts.
 *
 * Enrollment, verification and removal run through Supabase Auth MFA, so the
 * factor is enforced by the auth server — not by client state. Partners and
 * managers can additionally require 2FA for every member of the firm.
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logCAAudit } from "@/lib/caAudit";
import { CA, CACard, CAButton, caInputStyle } from "@/components/ca/portalUi";

interface Factor {
  id: string;
  friendly_name?: string | null;
  status: string;
}

export default function CATwoFactorCard({ firmId, canManageFirm }: { firmId: string | null; canManageFirm: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [requireMfa, setRequireMfa] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.totp ?? []) as Factor[]));
    if (firmId) {
      const { data: firm } = await supabase.from("ca_firms").select("require_mfa").eq("id", firmId).maybeSingle();
      setRequireMfa(Boolean(firm?.require_mfa));
    }
    setLoading(false);
  }, [firmId]);

  useEffect(() => { load(); }, [load]);

  const verified = factors.filter((f) => f.status === "verified");

  const startEnroll = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `FynHelp CA ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  };

  const confirm = async () => {
    if (!factorId || code.trim().length < 6) return toast.error("Enter the 6-digit code from your authenticator app");
    setBusy(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) { setBusy(false); return toast.error(chErr?.message ?? "Could not start verification"); }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication is now active");
    if (firmId) await logCAAudit({ firmId, entityType: "security", action: "mfa_enrolled" });
    setEnrolling(false); setQr(null); setSecret(null); setFactorId(null); setCode("");
    load();
  };

  const removeFactor = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (firmId) await logCAAudit({ firmId, entityType: "security", action: "mfa_removed" });
    toast.success("Two-factor authentication removed");
    load();
  };

  const toggleRequire = async (next: boolean) => {
    if (!firmId) return;
    if (next && verified.length === 0) {
      return toast.error("Set up 2FA on your own account before requiring it for the firm");
    }
    const { error } = await supabase.from("ca_firms").update({ require_mfa: next }).eq("id", firmId);
    if (error) return toast.error(error.message);
    setRequireMfa(next);
    await logCAAudit({ firmId, entityType: "security", action: next ? "mfa_required_on" : "mfa_required_off" });
    toast.success(next ? "2FA is now required for every firm member" : "2FA requirement removed");
  };

  return (
    <CACard style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <ShieldCheck size={20} color={CA.teal} />
        <div style={{ fontFamily: CA.serif, fontSize: 16, fontWeight: 700 }}>Two-factor authentication</div>
      </div>

      {loading ? (
        <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.muted }}>Loading…</div>
      ) : (
        <>
          <div style={{ fontFamily: CA.sans, fontSize: 13.5, color: CA.muted, lineHeight: 1.6 }}>
            {verified.length > 0
              ? "Your account is protected with an authenticator app. You will be asked for a 6-digit code at each sign-in."
              : "Add an authenticator app (Google Authenticator, Authy, 1Password) to protect client data with a second factor."}
          </div>

          {verified.map((f) => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: 14, padding: "10px 14px", border: `0.5px solid ${CA.line}`, borderRadius: 10,
            }}>
              <span style={{ fontFamily: CA.sans, fontSize: 13, color: CA.ink }}>
                {f.friendly_name || "Authenticator app"}
              </span>
              <CAButton variant="danger" disabled={busy} onClick={() => removeFactor(f.id)} style={{ padding: "6px 12px", fontSize: 12.5 }}>
                Remove
              </CAButton>
            </div>
          ))}

          {!enrolling && (
            <div style={{ marginTop: 16 }}>
              <CAButton disabled={busy} onClick={startEnroll} style={{ padding: "8px 14px", fontSize: 13 }}>
                {verified.length > 0 ? "Add another device" : "Set up 2FA"}
              </CAButton>
            </div>
          )}

          {enrolling && qr && (
            <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 360 }}>
              <img src={qr} alt="Scan this QR code with your authenticator app" width={180} height={180} />
              {secret && (
                <div style={{ fontFamily: CA.mono, fontSize: 12.5, color: CA.muted, wordBreak: "break-all" }}>
                  Manual key: {secret}
                </div>
              )}
              <input
                style={caInputStyle}
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
              />
              <div style={{ display: "flex", gap: 10 }}>
                <CAButton disabled={busy} onClick={confirm} style={{ padding: "8px 14px", fontSize: 13 }}>
                  {busy ? "Verifying…" : "Verify & activate"}
                </CAButton>
                <CAButton
                  variant="ghost"
                  onClick={() => { setEnrolling(false); setQr(null); setCode(""); if (factorId) supabase.auth.mfa.unenroll({ factorId }); setFactorId(null); }}
                  style={{ padding: "8px 14px", fontSize: 13 }}
                >
                  Cancel
                </CAButton>
              </div>
            </div>
          )}

          {canManageFirm && (
            <label style={{
              display: "flex", alignItems: "center", gap: 9, marginTop: 20,
              fontFamily: CA.sans, fontSize: 13.5, color: CA.ink,
            }}>
              <input type="checkbox" checked={requireMfa} onChange={(e) => toggleRequire(e.target.checked)} />
              Require two-factor authentication for every member of this firm
            </label>
          )}
        </>
      )}
    </CACard>
  );
}
