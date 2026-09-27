import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const RED = "#A93838";
const BORDER = "#E0D9C8";

const Card = ({ title, sub, danger, children }: { title: string; sub?: string; danger?: boolean; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-6 mb-6 animate-fade-in"
    style={{ borderColor: danger ? RED : BORDER }}>
    <h3 className="font-semibold text-[15px]" style={{ color: danger ? RED : "#171208" }}>{title}</h3>
    {sub && <p className="text-[12px] mt-1" style={{ color: "rgba(23,18,8,0.60)" }}>{sub}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </div>
);

const inputCls = "w-full h-10 px-3 rounded-md border bg-card text-[14px] focus:outline-hidden focus:ring-2 focus:ring-[#A93838]/30";

const passwordStrength = (pw: string): { label: string; pct: number; color: string } => {
  let s = 0;
  if (pw.length >= 8) s++; if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { label: "Weak", pct: 33, color: "#DC2626" };
  if (s === 2 || s === 3) return { label: "Medium", pct: 66, color: "#D97706" };
  return { label: "Strong", pct: 100, color: "#16A34A" };
};

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="p-6 rounded-md text-[13px] text-center" style={{ background: "#FAF7F0", color: "rgba(23,18,8,0.6)" }}>{children}</div>
);

const SecurityPage = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [delText, setDelText] = useState("");
  const strength = passwordStrength(newPassword);

  const handlePasswordUpdate = async () => {
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setSaving(false); toast.error(error.message); return; }
    // Revoke every other session so a stolen token cannot outlive the change.
    await supabase.auth.signOut({ scope: "others" });
    setSaving(false);
    toast.success("Password updated. All other devices have been signed out.");
    setNewPassword(""); setConfirmPassword("");
  };


  const handleDelete = async () => {
    toast.warning("Account deletion requested");
    await supabase.auth.signOut();
    toast("Please contact support@fynhelp.com to complete account deletion.");
    setShowDelete(false); setDelText("");
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-serif text-2xl font-bold mb-1" style={{ color: "#171208" }}>Security & Password</h2>
      <p className="text-[13px] mb-6" style={{ color: "rgba(23,18,8,0.60)" }}>Manage password, 2FA, sessions and API keys.</p>

      <Card title="Change Password">
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} />
        <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} style={{ borderColor: BORDER }} />
        {newPassword && (
          <div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#F3EBD9" }}>
              <div className="h-full transition-all" style={{ width: `${strength.pct}%`, background: strength.color }} />
            </div>
            <span className="text-[11px] font-medium mt-1 inline-block" style={{ color: strength.color }}>{strength.label}</span>
          </div>
        )}
        <button onClick={handlePasswordUpdate} disabled={saving} className="px-5 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-60" style={{ background: RED }}>
          {saving ? "Updating..." : "Update Password"}
        </button>
      </Card>

      <Card title="Two-Factor Authentication" sub="Add an extra layer of security to your account">
        <EmptyState>Two-factor authentication coming soon</EmptyState>
      </Card>

      <Card title="Active Sessions">
        <EmptyState>Session management coming soon. For security concerns, contact support@fynhelp.com</EmptyState>
      </Card>

      <Card title="Login History">
        <EmptyState>Session management coming soon. For security concerns, contact support@fynhelp.com</EmptyState>
      </Card>

      <Card title="API Keys" sub="Use API keys to access FynHelp data programmatically">
        <button disabled className="px-4 py-2 rounded-md text-sm font-medium border cursor-not-allowed opacity-60" style={{ color: RED, borderColor: RED }}>
          API access coming soon
        </button>
      </Card>

      <Card title="Delete Account" sub="Permanently delete your account and all data. This cannot be undone." danger>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ color: RED, borderColor: RED }}>Delete Account</button>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px]">Type <span className="font-bold">DELETE</span> to confirm:</p>
            <input value={delText} onChange={(e) => setDelText(e.target.value)} className={inputCls} style={{ borderColor: RED }} />
            <div className="flex gap-2">
              <button disabled={delText !== "DELETE"} onClick={handleDelete}
                className="px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40" style={{ background: RED }}>Confirm Delete</button>
              <button onClick={() => { setShowDelete(false); setDelText(""); }} className="px-4 py-2 rounded-md text-sm font-medium border" style={{ borderColor: BORDER }}>Cancel</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SecurityPage;
