import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Modal, V } from "../ui";
import { ENTITY_TYPES, useV2, Client } from "../store";

// Same rule the server applies (and the register checks use), checked here so a typo never closes the form.
import { gstinCheckChar, gstinProblem } from "@/lib/practice/india";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Form = { name: string; entityType: string; gstin: string; contactName: string; email: string; phone: string };

/** Same name ignoring case, spaces and punctuation ("Sample Client Pvt. Ltd." = "sample client pvt ltd"). */
export const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

function validate(f: Form, others: Client[]): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) errors.name = "Enter the client's name.";
  else if (others.some((c) => sameName(c.name, f.name))) errors.name = "A client with this name already exists.";
  const g = f.gstin.trim().toUpperCase();
  // Short enough for two lines, so the form never changes height under the cursor.
  if (g && !gstinProblem(g) && others.some((c) => (c.gstin ?? "").toUpperCase() === g))
    errors.gstin = "Another client already has this GSTIN.";
  else if (g && gstinProblem(g))
    errors.gstin = g.length !== 15 || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)
      ? "Should be 15 characters, like 27AABCS1429B1ZU."
      : `Last character should be ${gstinCheckChar(g.slice(0, 14))}. Check for a typo.`;
  if (f.email.trim() && !EMAIL.test(f.email.trim())) errors.email = "This email doesn't look complete.";
  const digits = f.phone.replace(/[^\d]/g, "");
  if (f.phone.trim() && (digits.length < 10 || digits.length > 13)) errors.phone = "Enter the number with country code, e.g. 91 98200 11223.";
  return errors;
}

export default function AddClientModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Client }) {
  const { addClient, updateClient, clients } = useV2();
  const [form, setForm] = useState<Form>({ name: "", entityType: ENTITY_TYPES[0], gstin: "", contactName: "", email: "", phone: "" });
  const others = clients.filter((c) => c.id !== editing?.id);
  const twin = others.find((c) => sameName(c.name, form.name) || (!!form.gstin.trim() && (c.gstin ?? "").toUpperCase() === form.gstin.trim().toUpperCase()));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  useEffect(() => {
    if (open) {
      setErrors({});
      setForm({
        name: editing?.name ?? "",
        entityType: editing?.entityType ?? ENTITY_TYPES[0],
        gstin: editing?.gstin ?? "",
        contactName: editing?.contactName ?? "",
        email: editing?.email ?? "",
        phone: editing?.phone ?? "",
      });
    }
  }, [open, editing]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form, others);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const clean = { ...form, gstin: form.gstin.trim().toUpperCase(), phone: form.phone.replace(/[^\d+]/g, "") };
    if (editing) {
      updateClient(editing.id, clean);
      toast.success("Client updated");
    } else {
      addClient(clean);
      toast.success("Client added to your portfolio");
    }
    onClose();
  };

  const field = (id: keyof Form, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <label className="v2-label" htmlFor={`client-${id}`}>{label}</label>
      {input}
      {/* Messages sit in a fixed-height line so the form never jumps when one appears or clears. */}
      <div style={{ minHeight: id === "gstin" ? 32 : 16, marginTop: 4, fontSize: 12, lineHeight: 1.35 }}>
        {errors[id] ? (
          <div role="alert" style={{ color: V.maroon }}>
            {errors[id]}
            {twin && (id === "name" || id === "gstin") && /already/.test(errors[id] ?? "") && (
              <>
                {" "}
                <Link to="/app/clients/$clientId" params={{ clientId: twin.id }} onClick={onClose} style={{ color: V.maroon, fontWeight: 600 }}>
                  Open {twin.name}
                </Link>
              </>
            )}
          </div>
        ) : hint ? (
          <div style={{ color: V.muted }}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
  const invalid = (k: keyof Form) => (errors[k] ? { borderColor: V.maroon } : undefined);

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit client" : "Add client"}>
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: 14 }}>
        {field("name", "Client name · required", <input id="client-name" className="v2-input" style={invalid("name")} value={form.name} onChange={set("name")} placeholder="e.g. Sundar Textiles Pvt Ltd" autoFocus aria-invalid={Boolean(errors.name)} />)}
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
          {field("entityType", "Entity type", (
            <select id="client-entityType" className="v2-input" value={form.entityType} onChange={set("entityType")}>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ))}
          {field("gstin", "GSTIN · optional", <input id="client-gstin" className="v2-input v2-mono" style={invalid("gstin")} value={form.gstin} onChange={set("gstin")} placeholder="15 characters" aria-invalid={Boolean(errors.gstin)} />, "Checked against its last character when you save.")}
        </div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
          {field("contactName", "Contact person · optional", <input id="client-contactName" className="v2-input" value={form.contactName} onChange={set("contactName")} placeholder="Who sends you documents" />)}
          {field("email", "Email · recommended", <input id="client-email" className="v2-input" style={invalid("email")} type="email" value={form.email} onChange={set("email")} placeholder="Their usual email" aria-invalid={Boolean(errors.email)} />, "Statements emailed from this address file themselves.")}
        </div>
        {field("phone", "WhatsApp number · optional", <input id="client-phone" className="v2-input" style={invalid("phone")} value={form.phone} onChange={set("phone")} placeholder="With country code" inputMode="tel" aria-invalid={Boolean(errors.phone)} />)}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="v2-btn v2-btn-primary">{editing ? "Save changes" : "Add client"}</button>
        </div>
      </form>
    </Modal>
  );
}
