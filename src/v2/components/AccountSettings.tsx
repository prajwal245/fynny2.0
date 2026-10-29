/**
 * Settings › Account: everything about the signed-in person, open to every role
 * (the rest of Settings is for partners). Name, password, a reset link by email,
 * and signing out of other devices.
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkPassword, PASSWORD_HINT } from "@/lib/passwordPolicy";
import { Card, V } from "../ui";
import { useV2 } from "../store";
import { Field } from "./Controls";
import PasswordInput from "./PasswordInput";
import { StatefulButton } from "./MotionKit";

const errMsg = (e: unknown) => (e instanceof Error && e.message && e.message !== "[object Object]" ? e.message : "Something went wrong. Please try again.");

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: V.ink }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12.5, color: V.muted, margin: "4px 0 0", lineHeight: 1.5 }}>{subtitle}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </Card>
  );
}

export function AccountSettings() {
  const { session, signOut } = useV2();
  const email = session?.email ?? "";
  const [name, setName] = useState(session?.name ?? "");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const grid = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(min(220px, 100%), 1fr))" } as const;

  const changePassword = async () => {
    setPwError(null);
    const fail = (m: string) => { setPwError(m); throw new Error(m); };
    if (!cur) fail("Enter your current password.");
    if (next !== again) fail("The two new passwords do not match.");
    if (next === cur) fail("Choose a password different from the current one.");
    const weak = await checkPassword(next, email);
    if (weak) fail(weak);
    // Prove it is really them before changing it.
    const { error: bad } = await supabase.auth.signInWithPassword({ email, password: cur });
    if (bad) fail("The current password is not right. If you have forgotten it, use the reset link below.");
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) fail(errMsg(error));
    setCur(""); setNext(""); setAgain("");
    toast.success("Password changed.");
  };

  return (
    <>
      <Block title="Your profile" subtitle="Your name appears on sign-offs and in the activity log.">
        <div style={grid}>
          <Field label="Name" htmlFor="account-name">
            <input id="account-name" className="v2-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="account-email" hint="This is how you sign in. To change it, write to support@fynhelp.com.">
            <input id="account-email" className="v2-input" value={email} disabled />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <StatefulButton
            label="Save profile"
            disabled={!name.trim() || name.trim() === (session?.name ?? "")}
            onAction={async () => {
              const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
              if (error) { toast.error(errMsg(error)); throw error; }
            }}
          />
        </div>
      </Block>

      <Block title="Change password" subtitle={`${PASSWORD_HINT}. Not a common password, not part of your email, and not one seen in a data breach.`}>
        <form onSubmit={(e) => e.preventDefault()} style={{ display: "grid", gap: 16, maxWidth: 420 }}>
          <Field label="Current password" htmlFor="account-cur">
            <PasswordInput id="account-cur" className="v2-input" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" htmlFor="account-new">
            <PasswordInput id="account-new" className="v2-input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Repeat new password" htmlFor="account-again" error={pwError}>
            <PasswordInput id="account-again" className="v2-input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </Field>
          <div>
            <StatefulButton label="Change password" disabled={!cur || !next || !again} onAction={changePassword} />
          </div>
        </form>
      </Block>

      <Block title="Forgot your password?" subtitle="We email a link to your address. It opens a page where you choose a new one.">
        <StatefulButton
          label={resetSent ? "Send again" : "Email me a reset link"}
          disabled={!email}
          onAction={async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/app/reset-password` });
            if (error) { toast.error(errMsg(error)); throw error; }
            setResetSent(true);
            toast.success(`Reset link sent to ${email}.`);
          }}
        />
        {resetSent && <div style={{ fontSize: 12.5, color: V.muted, marginTop: 8 }}>Check {email}, including spam. The link works once.</div>}
      </Block>

      <Block title="Sessions" subtitle="Signed in on a shared or lost device? Sign out everywhere else. This device stays signed in.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatefulButton
            label="Sign out of other devices"
            onAction={async () => {
              const { error } = await supabase.auth.signOut({ scope: "others" });
              if (error) { toast.error(errMsg(error)); throw error; }
              toast.success("Signed out of every other device.");
            }}
          />
          <button className="v2-btn v2-btn-ghost" onClick={() => signOut()}>Sign out of this device</button>
        </div>
      </Block>
    </>
  );
}
