import { toast } from "sonner";
import { riskOf, undoable } from "./agentTrust";

/**
 * Runs an action that cannot be taken back after a short, visible pause: a message that says what will happen and to whom, with Undo.
 * The window comes from the reversibility map (lib/agentTrust), so the length is decided once. `run` is not called if the person undoes in time.
 */
export function sendWithUndo(actionId: string, what: string, run: () => void | Promise<void>, opts: { onUndo?: () => void } = {}): void {
  const seconds = riskOf(actionId).undoSeconds ?? 0;
  if (!seconds) { void run(); return; }
  const u = undoable(run, seconds);
  const id = toast(what, {
    description: `Goes out in ${seconds} seconds.`,
    duration: seconds * 1000,
    action: { label: "Undo", onClick: () => { if (u.cancel()) { toast.dismiss(id); toast.success("Cancelled. Nothing was sent."); opts.onUndo?.(); } } },
  });
}
