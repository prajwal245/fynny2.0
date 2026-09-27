import HCaptchaLib from "@hcaptcha/react-hcaptcha";
import { useRef } from "react";

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY || "10000000-ffff-ffff-ffff-000000000001";

interface HCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark";
}

export default function HCaptcha({ onVerify, onExpire, onError, theme = "light" }: HCaptchaProps) {
  const captchaRef = useRef<HCaptchaLib>(null);

  return (
    <div className="flex justify-center mt-2">
      <HCaptchaLib
        ref={captchaRef}
        sitekey={SITE_KEY}
        onVerify={onVerify}
        onExpire={onExpire}
        onError={onError}
        theme={theme}
        size="normal"
      />
    </div>
  );
}
