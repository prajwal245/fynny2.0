/**
 * Keeps a chase's contact details in step with its client. A chase copies the client's phone, email and
 * contact name when it is created; when the client is edited, every OPEN chase that still carries the old
 * client value gets the new one. A chase whose contact was set to something different on purpose is left alone.
 * Pure: no database here.
 */

export interface ChaseContact {
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}
export interface ClientContactChange {
  phone?: { old: string | null; next: string | null };
  email?: { old: string | null; next: string | null };
  contactName?: { old: string | null; next: string | null };
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** Same mobile ignoring spaces, +, 0 prefix and country code: the last ten digits decide. */
export const samePhone = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = digits(a), y = digits(b);
  if (!x || !y) return !x && !y;
  return x.slice(-10) === y.slice(-10);
};
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** The columns to change on one chase, or null when nothing should change. */
export function chaseContactPatch(chase: ChaseContact, change: ClientContactChange): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let notes: Record<string, unknown> | null = null;
  const meta = () => {
    if (notes) return notes;
    try {
      const parsed = chase.notes ? JSON.parse(chase.notes) : {};
      notes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      notes = null;
    }
    return notes;
  };
  if (change.phone) {
    const stale = !chase.contact_phone?.trim() || samePhone(chase.contact_phone, change.phone.old);
    if (stale && !samePhone(chase.contact_phone, change.phone.next)) {
      out.contact_phone = change.phone.next;
      const m = meta();
      if (m && "phone" in m) {
        m.phone = change.phone.next ?? "";
        out.notes = JSON.stringify(m);
      }
    }
  }
  if (change.email) {
    const stale = !chase.contact_email?.trim() || sameText(chase.contact_email, change.email.old);
    if (stale && !sameText(chase.contact_email, change.email.next)) out.contact_email = change.email.next;
  }
  if (change.contactName) {
    const stale = !chase.contact_name?.trim() || sameText(chase.contact_name, change.contactName.old);
    if (stale && !sameText(chase.contact_name, change.contactName.next)) out.contact_name = change.contactName.next;
  }
  return Object.keys(out).length ? out : null;
}
