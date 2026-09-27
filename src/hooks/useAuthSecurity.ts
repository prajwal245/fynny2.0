import { supabase } from "@/integrations/supabase/client";

export interface SecurityCheckResult {
  allowed: boolean;
  error?: string;
  retry_after_seconds?: number;
}

export async function checkAuthSecurity(
  identifier: string,
  action: string,
  captchaToken?: string
): Promise<SecurityCheckResult> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-captcha-and-rate-limit", {
      body: { identifier, action, captcha_token: captchaToken },
    });
    if (error) {
      console.error("Security check error:", error);
      return { allowed: true };
    }
    return data as SecurityCheckResult;
  } catch {
    return { allowed: true };
  }
}

export function formatLockoutMessage(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.ceil(seconds / 60);
  return `${mins} minute${mins !== 1 ? "s" : ""}`;
}
