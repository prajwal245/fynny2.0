/**
 * First-time admin set-up: enter your work email and we email a link to set
 * your own password. Only emails on the FynHelp founder list receive one; the
 * page answers the same way for every address.
 */
import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import BackHomeLink from "@/components/BackHomeLink";
import { adminRequestSetup } from "@/lib/admin/admin.functions";
import { adminError } from "@/components/admin/adminClient";

const ink = "#171208";
const maroon = "#8A1E18";

export default function AdminSetupPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await adminRequestSetup({ data: { email: email.trim() } });
      setSent(email.trim());
    } catch (e2) {
      setErr(adminError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#F0EBE0", color: ink }}>
      <div className="w-full max-w-md">
        <div className="mb-6"><BackHomeLink /></div>
        <div className="rounded-2xl bg-white p-8 shadow-sm" style={{ border: "1px solid rgba(23,18,8,.08)" }}>
          <div className="flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: maroon }}>
            <ShieldCheck size={15} /> FynHelp internal
          </div>
          <h1 className="text-2xl font-semibold mb-1">Set up your admin access</h1>
          {sent ? (
            <div className="grid gap-3 text-sm" data-testid="setup-sent">
              <p>
                If <b>{sent}</b> is on the FynHelp team list, an email is on its way with a link to set your password. It can take a few minutes; check spam too.
              </p>
              <ol className="list-decimal pl-5 grid gap-1">
                <li>Open the link in the email and choose your password (at least 10 characters).</li>
                <li>Sign in at the admin panel with that email and password.</li>
                <li>Scan the QR code with Google Authenticator or Authy, then enter the 6-digit code.</li>
              </ol>
              <a href="/admin/login" className="font-semibold underline" style={{ color: maroon }}>Go to admin sign in</a>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 mt-4">
              <p className="text-sm opacity-70">Enter your work email. We will email you a link to create your own password.</p>
              {err && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(138,30,24,.1)", color: maroon }} role="alert">{err}</div>}
              <label className="grid gap-1 text-sm">
                Work email
                <input className="rounded-lg border px-3 py-2.5" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="setup-email" />
              </label>
              <button className="rounded-lg py-2.5 text-white font-semibold disabled:opacity-60" style={{ background: maroon }} disabled={busy} data-testid="setup-send">
                {busy ? "Sending…" : "Email me a set-up link"}
              </button>
              <p className="text-xs opacity-60">Already set up? <a href="/admin/login" className="underline">Sign in</a></p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
