/**
 * When to offer help. Pure and testable: it decides from facts it is given and keeps no timers of its own.
 *
 * Time alone never counts as "stuck". An idle prompt needs the screen to have something waiting for the person (open work),
 * and every prompt respects typing, open dialogs, a cooldown, a per-screen snooze, a cap per session and an off switch.
 */

export interface AssistConfig {
  /** Quiet time on a screen with open work before a first nudge. */
  idleMs: number;
  /** Opening and closing the same section this many times within the window. */
  repeatToggles: number;
  repeatWindowMs: number;
  /** Error messages seen within the window. */
  errorCount: number;
  errorWindowMs: number;
  /** Coming back to the same screen this many times within the window. */
  revisitCount: number;
  revisitWindowMs: number;
  /** Minimum gap between any two prompts. */
  cooldownMs: number;
  /** No prompt this soon after the last keystroke. */
  typingQuietMs: number;
  maxPerSession: number;
  /** How long "Maybe later" silences that screen. */
  snoozeMs: number;
  /** After this many dismissals of one screen, stay quiet for suppressMs. */
  suppressAfter: number;
  suppressMs: number;
}

export const DEFAULT_ASSIST_CONFIG: AssistConfig = {
  idleMs: 75_000,
  repeatToggles: 3,
  repeatWindowMs: 60_000,
  errorCount: 2,
  errorWindowMs: 90_000,
  revisitCount: 3,
  revisitWindowMs: 15 * 60_000,
  cooldownMs: 10 * 60_000,
  typingQuietMs: 8_000,
  maxPerSession: 3,
  snoozeMs: 24 * 3_600_000,
  suppressAfter: 2,
  suppressMs: 7 * 24 * 3_600_000,
};

/** Merges stored overrides into the defaults, keeping only sane positive numbers. */
export function mergeConfig(over: unknown): AssistConfig {
  const out = { ...DEFAULT_ASSIST_CONFIG };
  if (over && typeof over === "object") {
    for (const k of Object.keys(out) as (keyof AssistConfig)[]) {
      const v = (over as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

export type Reason = "idle" | "repeat_toggle" | "errors" | "revisit";

export interface AssistPrefs {
  enabled: boolean;
  lastShownAt: number | null;
  screens: Record<string, { dismissed: number; until: number }>;
}
export const FRESH_PREFS: AssistPrefs = {
  enabled: true,
  lastShownAt: null,
  screens: {},
};

export function recordShown(p: AssistPrefs, now: number): AssistPrefs {
  return { ...p, lastShownAt: now };
}

/** A dismissal silences the screen for a day; a second one for a week. */
export function recordDismissal(
  p: AssistPrefs,
  screen: string,
  now: number,
  cfg: AssistConfig,
): AssistPrefs {
  const prev = p.screens[screen] ?? { dismissed: 0, until: 0 };
  const dismissed = prev.dismissed + 1;
  const until =
    now + (dismissed >= cfg.suppressAfter ? cfg.suppressMs : cfg.snoozeMs);
  return { ...p, screens: { ...p.screens, [screen]: { dismissed, until } } };
}

/** Accepting help counts as engagement: the screen stays quiet for a day, with no strike against it. */
export function recordAccepted(
  p: AssistPrefs,
  screen: string,
  now: number,
  cfg: AssistConfig,
): AssistPrefs {
  const prev = p.screens[screen] ?? { dismissed: 0, until: 0 };
  return {
    ...p,
    screens: { ...p.screens, [screen]: { ...prev, until: now + cfg.snoozeMs } },
  };
}

export interface StuckContext {
  screen: string;
  /** The screen has something waiting for the person (open exceptions, items to review, a held statement). */
  hasOpenWork: boolean;
  /** An input has focus, a dialog is open, or a save is running. Nothing is offered meanwhile. */
  busy: boolean;
}

/** Remembers what the person has been doing. Memory only: it resets on reload, which is the safe direction. */
export class StuckDetector {
  private screen = "";
  private enteredAt = 0;
  private lastInteractionAt = 0;
  private lastKeyAt = -Infinity;
  private shown = 0;
  private toggles = new Map<string, number[]>();
  private errors: number[] = [];
  private visits = new Map<string, number[]>();

  constructor(private cfg: AssistConfig) {}

  setConfig(cfg: AssistConfig) {
    this.cfg = cfg;
  }

  enter(screen: string, now: number) {
    if (screen === this.screen) return;
    this.screen = screen;
    this.enteredAt = now;
    this.lastInteractionAt = now;
    const v = (this.visits.get(screen) ?? []).filter(
      (t) => now - t <= this.cfg.revisitWindowMs,
    );
    v.push(now);
    this.visits.set(screen, v);
  }

  /** A click, a choice, a submit: something that moves the work on. Not a mouse move or a scroll. */
  interact(now: number) {
    this.lastInteractionAt = now;
  }

  key(now: number) {
    this.lastKeyAt = now;
    this.lastInteractionAt = now;
  }

  toggle(key: string, now: number) {
    const list = (this.toggles.get(key) ?? []).filter(
      (t) => now - t <= this.cfg.repeatWindowMs,
    );
    list.push(now);
    this.toggles.set(key, list);
  }

  error(now: number) {
    this.errors = this.errors.filter((t) => now - t <= this.cfg.errorWindowMs);
    this.errors.push(now);
  }

  markShown() {
    this.shown += 1;
  }

  get shownThisSession() {
    return this.shown;
  }

  /** The reason to offer help right now, or null. */
  evaluate(now: number, ctx: StuckContext, prefs: AssistPrefs): Reason | null {
    const c = this.cfg;
    if (!prefs.enabled || ctx.busy || !ctx.screen) return null;
    if (this.shown >= c.maxPerSession) return null;
    if (now - this.lastKeyAt < c.typingQuietMs) return null;
    if (prefs.lastShownAt !== null && now - prefs.lastShownAt < c.cooldownMs)
      return null;
    if ((prefs.screens[ctx.screen]?.until ?? 0) > now) return null;

    if (
      this.errors.filter((t) => now - t <= c.errorWindowMs).length >=
      c.errorCount
    )
      return "errors";
    for (const list of this.toggles.values())
      if (
        list.filter((t) => now - t <= c.repeatWindowMs).length >=
        c.repeatToggles
      )
        return "repeat_toggle";
    if (
      (this.visits.get(ctx.screen) ?? []).filter(
        (t) => now - t <= c.revisitWindowMs,
      ).length >= c.revisitCount &&
      ctx.hasOpenWork
    )
      return "revisit";
    if (
      ctx.hasOpenWork &&
      now - Math.max(this.enteredAt, this.lastInteractionAt) >= c.idleMs
    )
      return "idle";
    return null;
  }

  /** Called after a prompt: the counters that caused it start again, so one cause never fires twice. */
  reset(now: number) {
    this.errors = [];
    this.toggles.clear();
    this.visits.set(this.screen, [now]);
    this.lastInteractionAt = now;
  }
}
