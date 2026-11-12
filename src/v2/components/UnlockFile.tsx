/**
 * The password step for a locked PDF or Excel file. One box, one button. The password is used once to open the file and
 * is not saved. A wrong password says so, in place, and keeps the box ready for another try.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, LockKeyhole, ShieldCheck, Unlock } from "lucide-react";
import { V } from "../ui";
import PasswordInput from "./PasswordInput";
import { isWrongPasswordMessage } from "@/lib/practice/passwordFile";
import { useV2 } from "../store";

export function UnlockFile({ docId, fileName, lastError, compact = false }: { docId: string; fileName: string; lastError?: string; compact?: boolean }) {
  const { unlockDoc } = useV2();
  const reduce = useReducedMotion();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(isWrongPasswordMessage(lastError) ? lastError ?? null : null);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, [docId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setMessage(null);
    const r = await unlockDoc(docId, pw);
    setBusy(false);
    if (!r.ok) {
      // Wrong password: stay here, say so, and let them try again.
      setMessage(r.message);
      setShake((n) => n + 1);
      setPw("");
      input.current?.focus();
    }
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{ border: `1px solid ${V.line}`, borderRadius: 16, padding: compact ? 14 : 18, display: "grid", gap: 12, background: V.card }}
      data-testid="unlock-file"
      aria-label={`Open ${fileName} with its password`}
    >
      <div style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: V.ink, color: "#fff", display: "grid", placeItems: "center" }}>
          <LockKeyhole size={19} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>This file is password protected</div>
          <div style={{ fontSize: 12.5, color: V.muted, overflowWrap: "anywhere" }}>{fileName}</div>
        </div>
      </div>

      <motion.div key={shake} animate={shake && !reduce ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.4 }}>
        <label className="v2-label" htmlFor={`unlock-${docId}`}>Password</label>
        <PasswordInput
          ref={input}
          id={`unlock-${docId}`}
          className="v2-input"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          // A file's password is not a login: stop Chrome offering saved logins, and never ask to "update password".
          autoComplete="new-password"
          name="file-password"
          data-lpignore="true"
          data-1p-ignore="true"
          spellCheck={false}
          maxLength={128}
          placeholder="Enter the password for this file"
          aria-invalid={Boolean(message)}
          aria-describedby={message ? `unlock-msg-${docId}` : undefined}
          style={message ? { borderColor: V.maroon } : undefined}
          disabled={busy}
        />
      </motion.div>

      {message && (
        <div id={`unlock-msg-${docId}`} role="alert" style={{ fontSize: 13, color: V.maroon }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="v2-btn v2-btn-primary" type="submit" disabled={!pw || busy} data-busy={busy}>
          {busy ? <Loader2 size={15} className="fh-spin" /> : <Unlock size={15} />} {busy ? "Opening…" : "Unlock and read"}
        </button>
        <span style={{ fontSize: 12, color: V.muted, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ShieldCheck size={13} aria-hidden="true" /> Used once to open this file. Never saved.
        </span>
      </div>
      <style>{`@keyframes fh-spin{to{transform:rotate(360deg)}}.fh-spin{animation:fh-spin 1s linear infinite}@media (prefers-reduced-motion:reduce){.fh-spin{animation:none}}`}</style>
    </motion.form>
  );
}
