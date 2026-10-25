import { useEffect } from "react";
import { FlaskConical } from "lucide-react";
import { V } from "../ui";
import { useV2 } from "../store";
import { setQaMode } from "@/lib/qa";
import { TEST_BANNER } from "@/lib/practice/testMode";

/**
 * Shown only on a tester account. It also switches QA mode on, so nothing a tester does reaches production
 * analytics (events are printed to the browser console instead).
 */
export function TestBanner() {
  const { firm } = useV2();
  const isTest = Boolean(firm?.isTest);
  useEffect(() => {
    if (isTest) setQaMode(true);
  }, [isTest]);
  if (!isTest) return null;
  return (
    <div
      role="status"
      data-testid="test-banner"
      style={{ display: "flex", gap: 10, alignItems: "center", background: "#EEF2FF", color: "#2B3A8C", border: "1px solid #C7D2FE", borderRadius: 14, padding: "10px 16px", marginBottom: 16, fontSize: 13.5 }}
    >
      <FlaskConical size={16} aria-hidden style={{ flexShrink: 0, color: V.ink }} />
      <span>
        <b>Test account.</b> {TEST_BANNER.replace(/^Test account\.\s*/, "")} Analytics are off for this browser (QA mode).
      </span>
    </div>
  );
}
