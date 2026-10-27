import { useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { V } from "../ui";
import { useV2 } from "../store";
import { MOBILE_HINT, parseMobile } from "@/lib/practice/mobile";

/**
 * A one-line ask for partners who signed up before the mobile number was collected. It asks once per browser
 * session, can be dismissed, and goes away for good once a number is saved.
 */
export function PhonePrompt() {
  const { firm, firmRole, saveFirm } = useV2();
  const [value, setValue] = useState("");
  const [wa, setWa] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("fynhelp.phone.dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const mayEdit = !firmRole || ["owner", "admin", "partner"].includes(firmRole);
  if (!firm || firm.isTest || firm.phone || hidden || !mayEdit) return null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseMobile(value)) {
      toast.error("Enter a valid mobile number, for example 98200 11223.");
      return;
    }
    setBusy(true);
    const ok = await saveFirm({ phone: value.trim(), whatsappOk: wa }, { settings: true });
    setBusy(false);
    if (ok) toast.success("Thank you. We will only use it to help you.");
  };
  return (
    <form
      onSubmit={save}
      data-testid="phone-prompt"
      style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: V.gray, borderRadius: 14, padding: "10px 14px", marginBottom: 16, fontSize: 13.5 }}
    >
      <Phone size={16} aria-hidden style={{ color: V.coral }} />
      <span style={{ flex: "1 1 220px" }}>
        <b>Add your mobile number.</b> If something needs help, a real person can reach you.
        <span style={{ display: "block", fontSize: 11.5, color: V.muted }}>{MOBILE_HINT}</span>
      </span>
      <input className="v2-input" type="tel" inputMode="tel" aria-label="Mobile number" placeholder="98200 11223" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 180 }} />
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, flexBasis: "100%" }}>
        <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> Setup tips and trial alerts on WhatsApp. Reply STOP anytime to opt out.
      </label>
      <button className="v2-btn v2-btn-primary" type="submit" disabled={busy}>Save</button>
      <button
        type="button"
        className="v2-btn v2-btn-ghost"
        onClick={() => {
          try { sessionStorage.setItem("fynhelp.phone.dismissed", "1"); } catch { /* private mode */ }
          setHidden(true);
        }}
      >
        Not now
      </button>
    </form>
  );
}
