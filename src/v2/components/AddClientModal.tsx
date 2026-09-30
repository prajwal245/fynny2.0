import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "../ui";
import { ENTITY_TYPES, useV2, Client } from "../store";

export default function AddClientModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Client }) {
  const { addClient, updateClient } = useV2();
  const [form, setForm] = useState({ name: "", entityType: ENTITY_TYPES[0], gstin: "", contactName: "", email: "", phone: "" });

  useEffect(() => {
    if (open) {
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      updateClient(editing.id, form);
      toast.success("Client updated");
    } else {
      addClient(form);
      toast.success("Client added to your portfolio");
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit client" : "Add client"}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <div>
          <label className="v2-label">Client name</label>
          <input className="v2-input" value={form.name} onChange={set("name")} placeholder="Sundar Textiles Pvt Ltd" required />
        </div>
        <div>
          <label className="v2-label">Entity type</label>
          <select className="v2-input" value={form.entityType} onChange={set("entityType")}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="v2-label">GSTIN (optional)</label>
          <input className="v2-input" value={form.gstin} onChange={set("gstin")} placeholder="27AABCS1429B1ZP" />
        </div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(180px, 100%), 1fr))" }}>
          <div>
            <label className="v2-label">Contact name</label>
            <input className="v2-input" value={form.contactName} onChange={set("contactName")} />
          </div>
          <div>
            <label className="v2-label">Email</label>
            <input className="v2-input" type="email" value={form.email} onChange={set("email")} />
          </div>
        </div>
        <div>
          <label className="v2-label">Phone</label>
          <input className="v2-input" value={form.phone} onChange={set("phone")} placeholder="919820011223" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="v2-btn v2-btn-primary">{editing ? "Save changes" : "Add client"}</button>
        </div>
      </form>
    </Modal>
  );
}
