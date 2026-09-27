import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { setRememberMe } from "@/lib/sessionPolicy";

interface Props {
  mode: "signin" | "register";
  onStart?: () => void;
}

export function GoogleAuthButton({ mode, onStart }: Props) {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    onStart?.();
    // Google sign-in is an intentional action — always keep the user signed in.
    setRememberMe(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/ca/auth/callback`,
      extraParams: { access_type: "offline", prompt: "select_account" },
    });
    if (result.redirected) return; // browser is navigating to Google
    const error = result.error;
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("not enabled") || msg.includes("provider") || msg.includes("unsupported")) {
        toast.error("Google sign-in is not yet configured. Please use email and password for now.");
      } else {
        toast.error(error.message);
      }
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogle}
      disabled={loading}
      aria-label={mode === "signin" ? "Continue with Google" : "Sign up with Google"}
      style={{
        width: "100%",
        height: 46,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        borderRadius: 999,
        border: "1px solid rgba(23,18,8,0.15)",
        background: loading ? "rgba(23,18,8,0.04)" : "#FFFDF9",
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "'Instrument Sans','Inter',system-ui,sans-serif",
        fontSize: 14,
        fontWeight: 500,
        color: "#171208",
        boxShadow: "0 1px 3px rgba(23,18,8,0.08)",
        transition: "background 0.2s",
        outline: "none",
      }}
    >
      {loading ? (
        <span style={{ fontSize: 14, color: "rgba(23,18,8,0.45)" }}>Connecting to Google…</span>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.009 9.009 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          <span>{mode === "signin" ? "Continue with Google" : "Sign up with Google"}</span>
        </>
      )}
    </button>
  );
}
