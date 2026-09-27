import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { completeGmailConnect } from "@/lib/caGmail.functions";
import { CA, CACard, CAButton } from "@/components/ca/portalUi";

const ORIGIN_KEY = "fyn:gmail:connect-origin";


function sanitizeErrorForUser(msg: string): string {
  if (msg.includes("refresh_token") || msg.includes("access_token")) {
    return "The Google authorisation could not be completed. Please try connecting Gmail again.";
  }
  if (msg.includes("ca_gmail_connections") || msg.includes("upsert") || /\b42[0-9A-Z]{3}\b/.test(msg)) {
    return "Could not save the Gmail connection. Please try again or contact support at support@fynhelp.com";
  }
  if (msg.includes("GMAIL_CLIENT") || msg.includes("GOOGLE_OAUTH") || msg.includes("not configured")) {
    return "Gmail integration is not configured for this environment. Please contact support.";
  }
  return msg;
}

export default function CAGmailCallbackPage() {
  const navigate = useNavigate();
  const complete = useServerFn(completeGmailConnect);
  const started = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      console.log("[fyn:gmail] oauth callback received");
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (error || !code || !state) {
        setErrorMsg(
          error === "access_denied"
            ? "You declined Gmail access. You can try again from the Integrations page."
            : `Google returned: ${error ?? "no authorisation code"}. If it mentions a redirect mismatch, add ${window.location.origin}/ca/integrations/gmail/callback to the authorised redirect list in Google Cloud Console.`,
        );
        return;
      }

      // The session can lag behind the redirect on some browsers — wait for it.
      let session = null;
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!session) {
        setErrorMsg("Your sign in did not carry over from Google. Please sign in again, then reconnect Gmail from the Integrations page.");
        return;
      }

      // Use the exact origin the consent started from, so the redirect address matches Google.
      let origin = window.location.origin;
      try {
        const saved = window.sessionStorage.getItem(ORIGIN_KEY);
        if (saved) origin = saved;
      } catch { /* storage unavailable */ }

      console.log(`[fyn:gmail] session confirmed, completing connection origin=${origin}`);

      try {
        const res = await complete({ data: { code, state, origin } });
        try { window.sessionStorage.removeItem(ORIGIN_KEY); } catch { /* ignore */ }
        toast.success(`Gmail connected — ${res.gmailAddress}`);
        navigate("/ca/integrations", { replace: true });
      } catch (e) {
        console.error("[fyn:gmail] callback failed:", e instanceof Error ? e.message : e);
        setErrorMsg(e instanceof Error ? e.message : "Could not complete the Gmail connection.");
      }
    };

    void run();
  }, [complete, navigate]);

  if (errorMsg) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: CA.page, padding: 24 }}>
        <CACard style={{ maxWidth: 480, padding: 36, textAlign: "center" }}>
          <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700, color: CA.ink }}>Gmail not connected</div>
          <div style={{ fontFamily: CA.sans, fontSize: 13, color: CA.red, marginTop: 14, marginBottom: 8 }}>Something stopped the connection</div>
          <div style={{ fontFamily: CA.mono, fontSize: 12, color: CA.muted, marginBottom: 20, lineHeight: 1.6, textAlign: "left", background: "rgba(23,18,8,0.04)", padding: "10px 14px", borderRadius: 8 }}>
            {sanitizeErrorForUser(errorMsg)}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <CAButton onClick={() => navigate("/ca/integrations")}>Back to Integrations</CAButton>
            <CAButton variant="ghost" onClick={() => { window.location.href = "/ca/integrations"; }}>Try again</CAButton>
          </div>
        </CACard>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: CA.page }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: CA.serif, fontSize: 20, fontWeight: 700, color: CA.ink }}>FynHelp</div>
        <p style={{ fontFamily: CA.sans, fontSize: 14, color: CA.muted, marginTop: 12 }}>Connecting your Gmail…</p>
      </div>
    </div>
  );
}
