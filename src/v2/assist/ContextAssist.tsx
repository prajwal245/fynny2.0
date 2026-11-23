import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { V } from "../ui";
import {
  StuckDetector,
  recordAccepted,
  recordDismissal,
  recordShown,
  type AssistConfig,
  type AssistPrefs,
  type Reason,
} from "./assistEngine";
import { guideFor, hasOpenWork, type Guide, type GuideFacts } from "./guides";
import { loadConfig, loadPrefs, savePrefs } from "./assistStore";
import { askAssistant } from "@/lib/practice/practice.functions";
import { toast } from "sonner";
import { ASSIST_SHOW_EVENT } from "./assistStore";

const TICK_MS = 5_000;

export const ASSIST_STYLES = `
.fha-dock{position:fixed;right:20px;bottom:20px;z-index:60;width:min(392px,calc(100vw - 32px));font-family:${V.font}}
.fha-card{position:relative;box-sizing:border-box;overflow:hidden;border-radius:20px;border:1px solid ${V.line};background:linear-gradient(135deg,var(--v2-cream) 0%,var(--v2-card) 58%);box-shadow:0 1px 2px rgba(20,18,16,.06),0 26px 50px -26px rgba(217,43,43,.42);padding:16px 16px 14px;color:${V.ink}}
.fha-card::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,#E23A3A,#D92B2B 40%,#8E1B1F)}
.fha-mark{flex:none;width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#E8453F 0%,#D92B2B 45%,#8E1B1F 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 8px 18px -8px rgba(142,27,31,.7)}
.fha-btn{font:inherit;font-size:13px;font-weight:600;border-radius:11px;padding:8px 14px;min-height:40px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:transform .15s ease,box-shadow .15s ease}
.fha-btn:focus-visible,.fha-link:focus-visible,.fha-x:focus-visible{outline:2px solid ${V.brand};outline-offset:2px}
.fha-primary{border:0;color:#fff;background:linear-gradient(135deg,var(--v2-btn-a),var(--v2-btn-b));box-shadow:0 8px 18px -10px rgba(142,27,31,.8)}
.fha-primary:hover{transform:translateY(-1px)}
.fha-ghost{color:${V.ink};background:${V.card};border:1px solid ${V.line}}
.fha-link{font:inherit;font-size:12.5px;background:none;border:0;padding:4px 0;color:${V.muted};cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.fha-x{border:0;background:transparent;padding:6px;margin:-6px -6px 0 0;color:${V.muted};cursor:pointer;line-height:0;border-radius:8px}
.fha-glass{backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);background:color-mix(in srgb,var(--v2-card) 84%,transparent)}
.fha-spot{position:fixed;z-index:59;pointer-events:none;border:1.5px dashed ${V.brand};border-radius:16px;box-shadow:0 0 0 4px rgba(217,43,43,.08);transition:all .25s ease}
.fha-input{width:100%;box-sizing:border-box;font:inherit;font-size:13px;color:${V.ink};background:${V.card};border:1px solid ${V.line};border-radius:11px;padding:9px 12px;min-height:40px}
@media (max-width:640px){.fha-dock{right:8px;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:auto}.fha-card{border-radius:22px;padding:14px 16px 16px}}
@media (prefers-reduced-motion:reduce){.fha-spot,.fha-btn{transition:none}}
`;

type Mode =
  | { kind: "offer"; reason: Reason }
  | { kind: "guide"; reason: Reason; step: number };

/** The assistant: offers help when someone looks stuck, then walks them through the screen. It only explains; it never changes anything. */
export function ContextAssist({ facts }: { facts: GuideFacts }) {
  const pathname = useRouterState({
    select: (s) =>
      (s.resolvedLocation ?? s.location).pathname.replace(/(.)\/+$/, "$1"),
  });
  const guide = useMemo(() => guideFor(pathname), [pathname]);
  const screen = guide?.screen ?? "";
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode | null>(null);
  const cfgRef = useRef<AssistConfig>(loadConfig());
  const prefsRef = useRef<AssistPrefs>(loadPrefs());
  const det = useRef(new StuckDetector(cfgRef.current));
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Leaving a screen ends its offer; arriving counts as a visit.
  useEffect(() => {
    det.current.setConfig(cfgRef.current);
    det.current.enter(screen, Date.now());
    setMode(null);
  }, [screen]);

  // What the person does: clicks and keys count as activity; opening the same disclosure again and again is a signal; an error toast is one too.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const now = Date.now();
      det.current.interact(now);
      const t = (e.target as Element | null)?.closest?.(
        "[aria-expanded]",
      ) as HTMLElement | null;
      if (t && !t.closest(".fha-dock"))
        det.current.toggle(
          t.getAttribute("aria-label") ||
            t.textContent?.trim().slice(0, 40) ||
            t.id ||
            "section",
          now,
        );
    };
    const onKey = () => det.current.key(Date.now());
    const mo = new MutationObserver((list) => {
      for (const m of list)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (
            n.matches?.('[data-sonner-toast][data-type="error"]') ||
            n.querySelector?.('[data-sonner-toast][data-type="error"]')
          )
            det.current.error(Date.now());
          // Opening the same panel again and again (a drawer or dialog) is the clearest sign of someone going round in circles.
          const panel = n.matches?.('[aria-modal="true"]')
            ? n
            : n.querySelector?.('[aria-modal="true"]');
          if (panel && !panel.closest(".fha-dock"))
            det.current.toggle(
              `panel:${panel.getAttribute("aria-label") ?? "panel"}`,
              Date.now(),
            );
        });
    });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      mo.disconnect();
    };
  }, []);

  // Decide every few seconds. Nothing is offered while someone is typing, a dialog is open or a save is running.
  useEffect(() => {
    if (!guide) return;
    const id = setInterval(() => {
      if (modeRef.current) return;
      const a = document.activeElement as HTMLElement | null;
      const typing =
        !!a &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
      // Only a modal panel that has taken over the screen counts as busy. Ordinary banners and loaders must not silence the assistant for good.
      const modal = !!document.querySelector(
        '[aria-modal="true"]:not(.fha-dock *)',
      );
      const busy = typing || modal;
      const now = Date.now();
      const reason = det.current.evaluate(
        now,
        {
          screen: guide.screen,
          hasOpenWork: hasOpenWork(guide.screen, factsRef.current),
          busy,
        },
        prefsRef.current,
      );
      if (!reason) return;
      det.current.markShown();
      det.current.reset(now);
      prefsRef.current = recordShown(prefsRef.current, now);
      savePrefs(prefsRef.current);
      setMode({ kind: "offer", reason });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [guide]);

  // "Tips for this screen" in the profile menu: shown on request, whatever the rules and the switch say.
  useEffect(() => {
    const show = () => {
      if (!guide) {
        toast.info(
          "Tips are for working screens such as Exceptions, Review, Documents and Reports.",
        );
        return;
      }
      setMode({ kind: "offer", reason: "idle" });
    };
    window.addEventListener(ASSIST_SHOW_EVENT, show);
    return () => window.removeEventListener(ASSIST_SHOW_EVENT, show);
  }, [guide]);

  const close = useCallback(
    (how: "dismiss" | "accept") => {
      const now = Date.now();
      prefsRef.current =
        how === "dismiss"
          ? recordDismissal(prefsRef.current, screen, now, cfgRef.current)
          : recordAccepted(prefsRef.current, screen, now, cfgRef.current);
      savePrefs(prefsRef.current);
      setMode(null);
    },
    [screen],
  );
  const turnOff = useCallback(() => {
    prefsRef.current = { ...prefsRef.current, enabled: false };
    savePrefs(prefsRef.current);
    setMode(null);
  }, []);

  if (!guide) return null;
  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key={mode.kind}
          className="fha-dock"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          data-assist
        >
          {mode.kind === "offer" ? (
            <Offer
              guide={guide}
              reason={mode.reason}
              facts={facts}
              onShow={() => {
                close("accept");
                setMode({ kind: "guide", reason: mode.reason, step: 0 });
              }}
              onLater={() => close("dismiss")}
              onOff={turnOff}
            />
          ) : (
            <GuideStepCard
              guide={guide}
              step={mode.step}
              onStep={(n) => setMode({ ...mode, step: n })}
              onStop={() => setMode(null)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Mark() {
  return (
    <div className="fha-mark" aria-hidden="true">
      <Sparkles size={18} strokeWidth={1.8} />
    </div>
  );
}

function Offer({
  guide,
  reason,
  facts,
  onShow,
  onLater,
  onOff,
}: {
  guide: Guide;
  reason: Reason;
  facts: GuideFacts;
  onShow: () => void;
  onLater: () => void;
  onOff: () => void;
}) {
  return (
    <section
      className="fha-card"
      role="dialog"
      aria-label="Help suggestion"
      aria-live="polite"
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Mark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h2
              style={{
                fontSize: 15.5,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {guide.title(reason, facts)}
            </h2>
            <button
              type="button"
              className="fha-x"
              aria-label="Dismiss"
              onClick={onLater}
            >
              <X size={16} />
            </button>
          </div>
          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13.5,
              lineHeight: 1.5,
              color: V.body,
            }}
          >
            {guide.offer(reason, facts)}
          </p>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
          paddingLeft: 48,
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="fha-btn fha-primary" onClick={onShow}>
          Show me how
        </button>
        <button type="button" className="fha-btn fha-ghost" onClick={onLater}>
          Maybe later
        </button>
      </div>
      <div style={{ margin: "10px 0 0 48px", fontSize: 12, color: V.muted }}>
        I only explain; I never change anything.{" "}
        <button type="button" className="fha-link" onClick={onOff}>
          Turn off tips
        </button>
      </div>
    </section>
  );
}

function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    document
      .querySelector(selector)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);
  return rect;
}

function GuideStepCard({
  guide,
  step,
  onStep,
  onStop,
}: {
  guide: Guide;
  step: number;
  onStep: (n: number) => void;
  onStop: () => void;
}) {
  const s = guide.steps[step]!;
  const last = step === guide.steps.length - 1;
  const rect = useTargetRect(s.target);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await askAssistant({
        data: { screen: guide.screen, question: text.slice(0, 300) },
      });
      setAnswer(
        r.answer ??
          "I could not answer that here. The steps above cover this screen; for anything else, contact support.",
      );
    } catch {
      setAnswer(
        "I could not answer that right now. The steps above still apply.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {rect && (
        <div
          className="fha-spot"
          aria-hidden="true"
          style={{
            left: rect.left - 8,
            top: rect.top - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}
      <section
        className="fha-card fha-glass"
        role="dialog"
        aria-label={`Guide, step ${step + 1} of ${guide.steps.length}`}
        aria-live="polite"
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Mark />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: V.muted,
                }}
              >
                Step {step + 1} of {guide.steps.length}
              </div>
              <button
                type="button"
                className="fha-x"
                aria-label="Stop guide"
                onClick={onStop}
              >
                <X size={16} />
              </button>
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "4px 0 0" }}>
              {s.title}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: V.body,
              }}
            >
              {s.text}
            </p>
          </div>
        </div>
        <div
          style={{ display: "flex", gap: 6, margin: "12px 0 0 48px" }}
          aria-hidden="true"
        >
          {guide.steps.map((_, i) => (
            <span
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 99,
                background: i <= step ? V.brand : V.gray,
              }}
            />
          ))}
        </div>
        {asking && (
          <div style={{ margin: "12px 0 0 48px" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <label
                className="sr-only"
                htmlFor="fha-q"
                style={{ position: "absolute", left: -9999 }}
              >
                Your question about this screen
              </label>
              <input
                id="fha-q"
                className="fha-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask about this screen"
                maxLength={300}
                autoFocus
              />
              <button
                type="submit"
                className="fha-btn fha-primary"
                disabled={busy || !q.trim()}
                aria-label="Send question"
                style={{ padding: "8px 12px" }}
              >
                <ArrowRight size={16} />
              </button>
            </form>
            {busy && (
              <div style={{ fontSize: 12.5, color: V.muted, marginTop: 8 }}>
                Thinking…
              </div>
            )}
            {answer && (
              <p
                role="status"
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: V.body,
                }}
              >
                {answer}
              </p>
            )}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            paddingLeft: 48,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {last ? (
            <button
              type="button"
              className="fha-btn fha-primary"
              onClick={onStop}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              className="fha-btn fha-primary"
              onClick={() => onStep(step + 1)}
            >
              Next
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              className="fha-btn fha-ghost"
              onClick={() => onStep(step - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="fha-link"
            onClick={() => setAsking((a) => !a)}
          >
            {asking ? "Hide question" : "Ask a question"}
          </button>
        </div>
      </section>
    </>
  );
}
