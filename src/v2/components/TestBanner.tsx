import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FlaskConical } from "lucide-react";
import { V } from "../ui";
import { useV2 } from "../store";
import { setQaMode } from "@/lib/qa";
import { TEST_BANNER } from "@/lib/practice/testMode";

const AUTO_KEY = "fynhelp.qa.auto";
const mark = (on: boolean) => {
  try {
    if (on) localStorage.setItem(AUTO_KEY, "1");
    else localStorage.removeItem(AUTO_KEY);
  } catch {
    /* private mode */
  }
};
const wasSetByBanner = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Shown only on a tester account. It also switches QA mode on, so nothing a tester does reaches production
 * analytics (events are printed to the browser console instead).
 */
export function TestBanner() {
  const { firm } = useV2();
  const isTest = Boolean(firm?.isTest);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!firm) return;
    if (isTest) {
      if (!wasSetByBanner()) mark(true);
      setQaMode(true);
    } else if (wasSetByBanner()) {
      // The firm is real now: analytics come back, but only if this banner is what switched QA mode on
      // (a founder who chose QA mode by address keeps it).
      setQaMode(false);
      mark(false);
    }
  }, [firm, isTest]);
  return (
    <AnimatePresence initial={false}>
      {isTest && (
        <motion.div
          key="test-banner"
          initial={reduce ? false : { opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
          exit={
            reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }
          }
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          style={{ overflow: "hidden" }}
        >
          <div
            role="status"
            data-testid="test-banner"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              background: "#EEF2FF",
              color: "#2B3A8C",
              border: "1px solid #C7D2FE",
              borderRadius: 14,
              padding: "10px 16px",
              fontSize: 13.5,
            }}
          >
            <FlaskConical
              size={16}
              aria-hidden
              style={{ flexShrink: 0, color: V.ink }}
            />
            <span>
              <b>Test account.</b>{" "}
              {TEST_BANNER.replace(/^Test account\.\s*/, "")} Analytics are off
              for this browser (QA mode).
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
