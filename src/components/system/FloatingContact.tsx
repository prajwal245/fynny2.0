import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Mail, Phone, CalendarClock } from "lucide-react";

const WHATSAPP = "https://wa.me/919876543210";
const EMAIL = "mailto:support@fynhelp.com";
const CALL = "https://calendly.com/nidhi-fynhelp/nidhi-meetings";

/** Persistent contact launcher for public marketing pages. */
export default function FloatingContact() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const item = (href: string, Icon: typeof Mail, label: string, sub: string) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
        borderRadius: 10, textDecoration: "none", color: "#171208",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F2EC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 28, height: 28, borderRadius: 8, background: "#EFE8D8",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={14} color="#A93838" />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "rgba(23,18,8,0.55)" }}>{sub}</span>
      </span>
    </a>
  );

  return (
    <div ref={ref} className="fyn-no-print" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 80 }}>
      {open && (
        <div
          style={{
            position: "absolute", bottom: 56, right: 0, width: 240,
            background: "#FFFFFF", borderRadius: 14, padding: 6,
            border: "1px solid rgba(23,18,8,0.08)",
            boxShadow: "0 16px 40px rgba(23,18,8,0.16)",
          }}
        >
          <div style={{ padding: "8px 10px 6px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(23,18,8,0.45)" }}>
            Talk to us
          </div>
          {item(WHATSAPP, MessageCircle, "WhatsApp", "Fastest response")}
          {item(EMAIL, Mail, "Email support", "support@fynhelp.com")}
          {item(CALL, CalendarClock, "Book a call", "15-minute intro")}
          {item("tel:+919876543210", Phone, "Call us", "Mon–Sat, 10am–7pm IST")}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close contact menu" : "Contact FynHelp"}
        aria-expanded={open}
        style={{
          width: 48, height: 48, borderRadius: 16, border: "none",
          background: "#A93838", color: "#FFFFFF", cursor: "pointer",
          boxShadow: "0 10px 28px rgba(169,56,56,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </div>
  );
}
