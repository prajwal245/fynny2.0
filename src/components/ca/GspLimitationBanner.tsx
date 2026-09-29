import { useEffect, useState } from "react";
import { CA } from "@/components/ca/portalUi";

const KEY = "gsp_banner_dismissed";

/**
 * Honest limitation notice on every CA surface that offers GST filing actions.
 * Renders unconditionally. Dismissal is remembered for the browser session.
 */
export function GspLimitationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: "rgba(26,26,26,0.035)",
        borderLeft: `3px solid ${CA.gold}`,
        borderRadius: 8,
        padding: "13px 16px",
        marginBottom: 16,
        fontFamily: CA.serif,
        fontSize: 13.5,
        color: CA.ink,
        lineHeight: 1.55,
      }}
    >
      <span style={{ flex: 1 }}>
        Note: GST filing through FynHelp is currently in preview. Direct filing via GSP integration is pending
        regulatory approval. You can prepare and review returns here, then file through the GSTN portal directly.
      </span>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            /* storage unavailable, dismiss for this view only */
          }
          setVisible(false);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: CA.muted,
          cursor: "pointer",
          fontSize: 15,
          lineHeight: 1,
          fontFamily: CA.sans,
          padding: 2,
        }}
      >
        X
      </button>
    </div>
  );
}

export default GspLimitationBanner;
