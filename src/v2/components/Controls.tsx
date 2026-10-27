/**
 * The form controls used across Settings, so every toggle, field, checkbox and explanation looks and behaves the same:
 *  - Field: a label, the control, and a hint or error underneath.
 *  - Toggle: an on/off switch (role="switch") for anything that takes effect straight away.
 *  - Checkbox: a tick for choices that are saved with a button.
 *  - SettingRow: a title and a plain sentence on the left, one control on the right.
 *  - Tip: a small "i" that explains the detail on hover, focus or tap, so the page stays plain.
 *  - Disclosure: a section that stays folded until someone wants the detail.
 * Inputs and selects keep using the shared `v2-input` class.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { V } from "../ui";

export const CONTROLS_STYLES = `
.v2-switch { position:relative; flex:0 0 auto; width:42px; height:24px; border-radius:999px; border:0; padding:0; cursor:pointer; background:var(--v2-switch); transition:background .3s ease, box-shadow .2s ease; }
.v2-switch::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:999px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,.25); transition:transform .4s cubic-bezier(.34,1.56,.64,1), width .2s ease; }
.v2-switch[aria-checked="true"] { background:linear-gradient(180deg, var(--v2-btn-a), var(--v2-btn-b)); }
.v2-switch[aria-checked="true"]::after { transform:translateX(18px); }
.v2-switch:active::after { width:23px; }
.v2-switch[aria-checked="true"]:active::after { transform:translateX(13px); }
.v2-switch:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-switch:disabled { opacity:.5; cursor:not-allowed; }
.v2-check { display:inline-flex; gap:10px; align-items:flex-start; cursor:pointer; font-size:13px; line-height:1.5; color:${V.body}; }
.v2-check input { appearance:none; -webkit-appearance:none; flex:0 0 auto; width:18px; height:18px; margin:1px 0 0; border-radius:6px; border:1.5px solid ${V.line}; background:var(--v2-input); display:grid; place-items:center; cursor:pointer; transition:background .2s ease, border-color .2s ease, transform .3s cubic-bezier(.34,1.56,.64,1); }
.v2-check input:hover { border-color:${V.brand}; }
.v2-check input:active { transform:scale(.9); }
.v2-check input:checked { background:${V.brand}; border-color:${V.brand}; }
.v2-check input:checked::after { content:""; width:5px; height:9px; margin-top:-1px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
.v2-check input:focus-visible { outline:2px solid ${V.brand}; outline-offset:2px; }
.v2-check input:disabled { opacity:.5; cursor:not-allowed; }
.v2-setting { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:16px; align-items:center; padding:14px 0; border-top:1px solid ${V.line}; }
.v2-setting:first-child { border-top:0; padding-top:4px; }
@media (max-width:560px){ .v2-setting { grid-template-columns:minmax(0,1fr); gap:10px; } }
.v2-tip { position:relative; display:inline-grid; place-items:center; vertical-align:middle; }
.v2-tip > button { display:grid; place-items:center; width:20px; height:20px; border-radius:999px; border:0; background:transparent; color:${V.muted}; cursor:help; padding:0; transition:color .2s ease, background .2s ease; }
.v2-tip > button:hover, .v2-tip > button:focus-visible, .v2-tip > button[aria-expanded="true"] { color:${V.ink}; background:${V.gray}; }
.v2-tip [role="tooltip"] { position:absolute; z-index:70; left:50%; top:calc(100% + 8px); width:min(280px, 70vw); transform:translateX(-50%) translateY(-4px); padding:10px 12px; border-radius:12px; background:var(--v2-pop); color:${V.ink}; border:1px solid ${V.line}; box-shadow:0 18px 40px -18px rgba(0,0,0,.5); font-size:12.5px; line-height:1.5; font-weight:400; text-align:left; letter-spacing:0; text-transform:none; opacity:0; pointer-events:none; transition:opacity .18s ease, transform .25s cubic-bezier(.16,1,.3,1); }
.v2-tip:hover [role="tooltip"], .v2-tip:focus-within [role="tooltip"], .v2-tip[data-open="true"] [role="tooltip"] { opacity:1; transform:translateX(-50%); }
.v2-disclosure > button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 0; font:inherit; font-size:12.5px; font-weight:600; color:${V.body}; cursor:pointer; }
.v2-disclosure > button:hover { color:${V.ink}; }
.v2-disclosure > button svg { transition:transform .3s cubic-bezier(.34,1.56,.64,1); }
.v2-disclosure > button[aria-expanded="true"] svg { transform:rotate(180deg); }
.v2-disclosure-body { display:grid; grid-template-rows:0fr; opacity:0; transition:grid-template-rows .35s cubic-bezier(.16,1,.3,1), opacity .25s ease; }
.v2-disclosure-body[data-open="true"] { grid-template-rows:1fr; opacity:1; }
.v2-disclosure-body > div { overflow:hidden; min-height:0; }
@media (prefers-reduced-motion: reduce) { .v2-switch, .v2-switch::after, .v2-check input, .v2-tip [role="tooltip"], .v2-disclosure-body, .v2-disclosure > button svg { transition:none !important; } }
`;

/** A labelled control with a hint or an error underneath. */
export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="v2-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <div role="alert" style={{ fontSize: 11.5, color: V.maroon, marginTop: 4 }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 11.5, color: V.muted, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

/** An on/off switch. Use it for anything that takes effect as soon as it is flipped. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="v2-switch" disabled={disabled} onClick={() => onChange(!checked)} />
  );
}

/** A tick box with its sentence. Use it for choices saved together with a button. */
export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="v2-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A setting in a list: what it is and what it does on the left, its control on the right. */
export function SettingRow({ title, description, tip, children }: { title: string; description?: ReactNode; tip?: ReactNode; children: ReactNode }) {
  return (
    <div className="v2-setting">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          {title}
          {tip && <Tip>{tip}</Tip>}
        </div>
        {description && <div style={{ fontSize: 12.5, color: V.body, marginTop: 3, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

/** A small "i" that explains the detail on hover, focus or tap, so the page itself stays plain. */
export function Tip({ children, label = "More detail" }: { children: ReactNode; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="v2-tip" data-open={open}>
      <button type="button" aria-label={label} aria-describedby={id} aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        <Info size={14} />
      </button>
      <span role="tooltip" id={id}>{children}</span>
    </span>
  );
}

/** Folded until someone wants the detail. */
export function Disclosure({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="v2-disclosure">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {label} <ChevronDown size={14} />
      </button>
      <div className="v2-disclosure-body" data-open={open} id={id} inert={!open}>
        <div><div style={{ paddingTop: 10 }}>{children}</div></div>
      </div>
    </div>
  );
}
