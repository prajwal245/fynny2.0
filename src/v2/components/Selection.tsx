/**
 * Multi-select for tables: a checkbox on every row (44px to press), a header box that shows
 * none / some / all, shift-click for a range, Ctrl/Cmd+A for everything visible, Esc to clear,
 * a highlighted selected row, and a bar that slides up with the actions and a live count.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { prune, selectRange, selectState, toggleOne } from "../lib/selection";

export const SEL_STYLES = `
.sel-cell{width:52px;min-width:52px;padding:0!important}
.sel-box{display:grid;place-items:center;width:52px;height:48px;cursor:pointer}
.sel-box input{width:18px;height:18px;margin:0;cursor:pointer;accent-color:var(--v2-brand);transition:transform .12s ease}
.sel-box:active input{transform:scale(.88)}
.sel-box input:focus-visible{outline:2px solid var(--v2-brand);outline-offset:3px;border-radius:4px}
tr.is-selected,tr.is-selected:hover{background:rgba(217,43,43,.06)!important;box-shadow:inset 3px 0 0 var(--v2-brand)}
.sel-bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:max-content;z-index:70;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;max-width:min(96vw,920px);padding:10px 14px;border-radius:14px;background:var(--v2-pop,#fff);color:var(--v2-ink);border:1px solid rgba(20,18,16,.12);box-shadow:0 18px 44px -16px rgba(20,18,16,.38),0 0 0 1px rgba(217,43,43,.35)}
.sel-count{font-weight:700;font-size:14px;white-space:nowrap}
.sel-link{background:none;border:0;padding:8px 6px;font:inherit;font-size:13px;font-weight:600;color:var(--v2-maroon);cursor:pointer;text-decoration:underline;text-underline-offset:3px;min-height:40px}
.sel-link:focus-visible{outline:2px solid var(--v2-brand);outline-offset:2px;border-radius:6px}
.sel-bar.in-drawer{z-index:95;left:auto;right:20px;transform:none;max-width:min(520px,calc(100vw - 40px))}
@media (max-width:640px){.sel-bar{bottom:12px;left:8px;right:8px;transform:none;width:auto;max-width:none}}
`;

export interface Selection {
  selected: ReadonlySet<string>;
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string, shiftKey?: boolean) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
  state: ReturnType<typeof selectState>;
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

/** Selection over the rows currently shown (`order`). Rows that leave the table leave the selection. */
export function useSelection(order: string[]): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const key = order.join("\u0001");
  useEffect(() => {
    setSelected((s) => (s.size ? prune(s, order) : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback(
    (id: string, shiftKey = false) => {
      setSelected((s) => (shiftKey ? selectRange(order, s, anchor.current, id) : toggleOne(s, id)));
      anchor.current = id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const setAll = useCallback((on: boolean) => setSelected(on ? new Set(order) : new Set()), [order]);
  const clear = useCallback(() => setSelected(new Set()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || document.querySelector("[aria-modal='true']")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && order.length) {
        e.preventDefault();
        setSelected(new Set(order));
      } else if (e.key === "Escape" && selected.size) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, selected.size]);

  return useMemo(
    () => ({ selected, count: selected.size, has: (id: string) => selected.has(id), toggle, setAll, clear, state: selectState(order, selected) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, toggle, setAll, clear, key],
  );
}

/** The checkbox cell of a row. Clicking it never opens the row. */
export function SelectCell({ sel, id, label }: { sel: Selection; id: string; label: string }) {
  return (
    <td className="sel-cell" onClick={(e) => e.stopPropagation()}>
      <label className="sel-box">
        <input
          type="checkbox"
          checked={sel.has(id)}
          aria-label={`Select ${label}`}
          onChange={() => undefined}
          onClick={(e) => sel.toggle(id, e.shiftKey)}
        />
      </label>
    </td>
  );
}

/** The header checkbox: empty, dash (some) or tick (all). */
export function SelectAllHeader({ sel, total }: { sel: Selection; total: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = sel.state === "some";
  }, [sel.state]);
  return (
    <th className="sel-cell">
      <label className="sel-box">
        <input ref={ref} type="checkbox" checked={sel.state === "all"} aria-label={sel.state === "all" ? "Clear selection" : `Select all ${total}`} onChange={() => sel.setAll(sel.state !== "all")} />
      </label>
    </th>
  );
}

/** Slides up while something is selected. A polite live region tells screen readers the count. */
/** True while a drawer or modal is open, so a page-level bar does not sit half under it. */
function useDialogOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector("[aria-modal='true']"));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return open;
}

export function BulkBar({ sel, total, noun, children, inDrawer }: { sel: Selection; total: number; noun: string; children: ReactNode; inDrawer?: boolean }) {
  const reduce = useReducedMotion();
  const dialogOpen = useDialogOpen();
  return (
    <AnimatePresence>
      {sel.count > 0 && (inDrawer || !dialogOpen) && (
        <motion.div
          className={`sel-bar${inDrawer ? " in-drawer" : ""}`}
          role="region"
          aria-label={`Actions for ${sel.count} selected ${noun}`}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <span className="sel-count" aria-live="polite">
            {sel.count} {noun} selected
          </span>
          {sel.count < total && (
            <button className="sel-link" onClick={() => sel.setAll(true)}>
              Select all {total}
            </button>
          )}
          {children}
          <button className="sel-link" onClick={sel.clear} aria-label="Clear selection (Esc)">
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A destructive action that asks once more, in place, for a few seconds, before it runs. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = "bx-btn bx-sm" }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      style={armed ? { borderColor: "var(--v2-brand)", background: "rgba(217,43,43,.08)" } : undefined}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
