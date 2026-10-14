import { useEffect, useState } from "react";
import { Card, PageHeader } from "./AdminDashboardPage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PasswordInput from "@/v2/components/PasswordInput";

export default function AdminSettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your admin profile and password. Admins and roles are managed in Admin Team." />
      <Card style={{ padding: 32 }}>
        <ProfileTab />
      </Card>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h3 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 600, fontSize: 20, color: "hsl(var(--fyn-ink))" }}>{title}</h3>
      {subtitle && <p style={{ fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink) / 0.6)" }}>{subtitle}</p>}
    </div>
  );
}

function ProfileTab() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
      setName((user?.user_metadata as { name?: string; full_name?: string } | undefined)?.name
           ?? (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? "");
    })();
  }, []);

  const updateProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { name, full_name: name } });
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
  };

  const changePassword = async () => {
    if (pwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pwd !== pwd2) { toast.error("Passwords do not match"); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) { toast.error(error.message); return; }
    setPwd(""); setPwd2("");
    toast.success("Password changed");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 48, padding: "0 14px", borderRadius: 12,
    border: "1px solid rgba(23,18,8,0.15)", background: "#fff",
    fontFamily: "Roboto, sans-serif", fontSize: 14, color: "hsl(var(--fyn-ink))", outline: "none",
  };

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Your Profile" subtitle="Update your name. Email is managed by your account provider." />
        <div className="grid gap-4 max-w-md">
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Email</span>
            <input value={email} disabled style={{ ...inputStyle, background: "rgba(23,18,8,0.04)", color: "hsl(var(--fyn-ink) / 0.6)" }} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Display Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
          </label>
          <button onClick={updateProfile} disabled={savingProfile}
            style={{ height: 44, padding: "0 18px", borderRadius: 12, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, opacity: savingProfile ? 0.6 : 1, justifySelf: "start" }}>
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </section>

      <section>
        <SectionHeading title="Change Password" subtitle="Choose a strong password (8+ characters)." />
        <div className="grid gap-4 max-w-md">
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>New Password</span>
            <PasswordInput value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" style={inputStyle} />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontFamily: "Roboto, sans-serif", fontSize: 13, color: "hsl(var(--fyn-ink) / 0.7)", marginBottom: 6 }}>Confirm New Password</span>
            <PasswordInput value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" style={inputStyle} />
          </label>
          <button onClick={changePassword} disabled={savingPwd}
            style={{ height: 44, padding: "0 18px", borderRadius: 12, background: "linear-gradient(135deg,#C41E1E,#8B6914)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, opacity: savingPwd ? 0.6 : 1, justifySelf: "start" }}>
            {savingPwd ? "Updating…" : "Change Password"}
          </button>
        </div>
      </section>
    </div>
  );
}

