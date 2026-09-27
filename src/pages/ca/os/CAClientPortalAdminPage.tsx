/**
 * Client portal administration.
 *
 * A client contact gets a scoped login tied to exactly one business_id. RLS
 * (ca_client_users + client_portal_business_id()) is what actually enforces
 * that boundary; this page only manages who holds one and what they owe the
 * firm right now.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCAPortal } from "@/hooks/useCAPortal";
import { useCARole } from "@/hooks/useCARole";
import { useCAClientOptions } from "@/hooks/useCAClientOptions";
import { CA, CACard, CAButton, CABadge, CAField, caInputStyle, dateIN } from "@/components/ca/portalUi";
import { ModuleHeader, PermissionNotice, QueueTable, StateChip, StatStrip } from "@/components/ca/os/primitives";
import { logCAAudit } from "@/lib/caAudit";

interface ContactRow {
  id: string;
  business_id: string | null;
  user_id: string | null;
  invited_email: string | null;
  contact_name: string | null;
  status: string;
  invite_token: string | null;
  created_at: string;
}

interface RequestRow {
  id: string;
  business_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
}

interface MessageRow {
  id: string;
  business_id: string | null;
  sender_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function CAClientPortalAdminPage() {
  const { firmId } = useCAPortal();
  const { can, role, isLoading: roleLoading } = useCARole();
  const { clients } = useCAClientOptions();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [draft, setDraft] = useState({ business_id: "", email: "", name: "" });
  const [busy, setBusy] = useState(false);

  const canManage = can("manage_clients");

  const load = useCallback(async () => {
    if (!firmId) return;
    const [c, r, m] = await Promise.all([
      supabase
        .from("ca_client_users")
        .select("id, business_id, user_id, invited_email, contact_name, status, invite_token, created_at")
        .eq("ca_firm_id", firmId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ca_document_requests")
        .select("id, business_id, title, status, due_date")
        .eq("ca_firm_id", firmId)
        .neq("status", "fulfilled")
        .limit(500),
      supabase
        .from("ca_client_messages")
        .select("id, business_id, sender_type, message, is_read, created_at")
        .eq("ca_firm_id", firmId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setContacts((c.data ?? []) as ContactRow[]);
    setRequests((r.data ?? []) as RequestRow[]);
    setMessages((m.data ?? []) as MessageRow[]);
  }, [firmId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = (id: string | null) =>
    (id && clients.find((c) => c.business_id === id)?.client_name) || "Unknown client";

  const invite = async () => {
    if (!firmId) return;
    const email = draft.email.trim().toLowerCase();
    if (!draft.business_id) return toast.error("Pick which client this contact belongs to");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email address");
    if (contacts.some((c) => c.invited_email === email && c.business_id === draft.business_id && c.status !== "revoked")) {
      return toast.error("That contact already has access to this client");
    }

    setBusy(true);
    const { data, error } = await supabase
      .from("ca_client_users")
      .insert({
        ca_firm_id: firmId,
        business_id: draft.business_id,
        invited_email: email,
        contact_name: draft.name.trim() || null,
        status: "invited",
      })
      .select("id, invite_token")
      .single();
    setBusy(false);
    if (error) return toast.error(error.message);

    await logCAAudit({
      firmId,
      businessId: draft.business_id,
      entityType: "client_user",
      entityId: data.id,
      action: "client_portal_invited",
      actorRole: role,
      detail: { email, client: nameFor(draft.business_id) },
    });
    toast.success(`${email} can now claim access to ${nameFor(draft.business_id)}`);
    setDraft({ business_id: "", email: "", name: "" });
    void load();
  };

  const setStatus = async (c: ContactRow, next: string) => {
    const { error } = await supabase
      .from("ca_client_users")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    await logCAAudit({
      firmId: firmId!,
      businessId: c.business_id ?? undefined,
      entityType: "client_user",
      entityId: c.id,
      action: next === "revoked" ? "client_portal_revoked" : "client_portal_restored",
      actorRole: role,
      detail: { email: c.invited_email, from: c.status, to: next },
    });
    toast.success(next === "revoked" ? "Access revoked" : "Access restored");
    void load();
  };

  const copyInvite = async (c: ContactRow) => {
    if (!c.invite_token) return toast.error("No invite token on this contact");
    const url = `${window.location.origin}/ca/client-invite/${c.invite_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied — send it to the client contact");
    } catch {
      window.prompt("Copy this invite link", url);
    }
  };

  const visible = useMemo(
    () => contacts.filter((c) => !clientFilter || c.business_id === clientFilter),
    [contacts, clientFilter],
  );

  const countFor = <T extends { business_id: string | null }>(rows: T[], id: string | null) =>
    rows.filter((r) => r.business_id === id).length;

  const activeContacts = contacts.filter((c) => c.status === "active");
  const pending = contacts.filter((c) => c.status === "invited");
  const clientsWithAccess = new Set(activeContacts.map((c) => c.business_id).filter(Boolean));
  const unread = messages.filter((m) => m.sender_type === "client" && !m.is_read);

  if (roleLoading) return null;

  return (
    <div>
      <ModuleHeader
        title="Client portal"
        subtitle="Scoped logins for your clients. A contact sees only the business they are attached to — uploads land straight in the intake inbox, and their open requests stay visible to both sides."
      />

      <StatStrip
        items={[
          { label: "Active client logins", value: String(activeContacts.length) },
          { label: "Invites pending", value: String(pending.length), tone: pending.length ? "amber" : "green" },
          {
            label: "Clients without a login",
            value: String(clients.filter((c) => !clientsWithAccess.has(c.business_id)).length),
          },
          { label: "Unread client messages", value: String(unread.length), tone: unread.length ? "amber" : "green" },
        ]}
      />

      {canManage ? (
        <CACard style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 14 }}>Invite a client contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, alignItems: "end" }}>
            <CAField label="Client">
              <select
                style={caInputStyle}
                value={draft.business_id}
                onChange={(e) => setDraft({ ...draft, business_id: e.target.value })}
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.business_id} value={c.business_id}>
                    {c.client_name}
                  </option>
                ))}
              </select>
            </CAField>
            <CAField label="Contact email">
              <input
                style={caInputStyle}
                type="email"
                placeholder="accounts@client.com"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </CAField>
            <CAField label="Contact name (optional)">
              <input
                style={caInputStyle}
                placeholder="Priya Menon"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </CAField>
            <div>
              <CAButton onClick={invite} disabled={busy}>
                {busy ? "Creating…" : "Create access"}
              </CAButton>
            </div>
          </div>
          <p style={{ fontFamily: CA.sans, fontSize: 12, color: CA.faint, marginTop: 12 }}>
            The contact only ever sees the one business you attach them to. Access can be revoked here at any time.
          </p>
        </CACard>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <PermissionNotice permission="manage_clients" />
        </div>
      )}

      <CACard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <select
            style={{ ...caInputStyle, maxWidth: 260 }}
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.business_id} value={c.business_id}>
                {c.client_name}
              </option>
            ))}
          </select>
        </div>

        <QueueTable
          columns={["Client", "Contact", "Status", "Open requests", "Added", ""]}
          empty="No client logins yet"
          emptyHint="Invite a contact so the client can upload documents themselves instead of emailing them."
          rows={visible.map((c) => [
            nameFor(c.business_id),
            <div key="c">
              <div style={{ fontWeight: 600 }}>{c.contact_name ?? c.invited_email}</div>
              <div style={{ fontSize: 11.5, color: CA.faint }}>{c.invited_email}</div>
            </div>,
            <StateChip key="s" value={c.status === "invited" ? "pending" : c.status} />,
            <CABadge key="r" tone={countFor(requests, c.business_id) ? "amber" : "green"}>
              {countFor(requests, c.business_id)} open
            </CABadge>,
            dateIN(c.created_at),
            canManage ? (
              <div key="a" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {c.status === "invited" && (
                  <CAButton variant="ghost" onClick={() => copyInvite(c)}>
                    Copy invite link
                  </CAButton>
                )}
                <CAButton
                  variant="ghost"
                  onClick={() => setStatus(c, c.status === "revoked" ? "active" : "revoked")}
                >
                  {c.status === "revoked" ? "Restore" : "Revoke"}
                </CAButton>
              </div>
            ) : null,
          ])}
        />
      </CACard>

      <CACard style={{ padding: 20 }}>
        <div style={{ fontFamily: CA.serif, fontSize: 16, color: CA.ink, marginBottom: 14 }}>Recent portal messages</div>
        <QueueTable
          columns={["When", "Client", "From", "Message", ""]}
          empty="No portal messages"
          emptyHint="Messages your clients send from their login appear here."
          rows={messages
            .filter((m) => !clientFilter || m.business_id === clientFilter)
            .slice(0, 25)
            .map((m) => [
              dateIN(m.created_at),
              nameFor(m.business_id),
              <CABadge key="f" tone={m.sender_type === "client" ? "amber" : "teal"}>
                {m.sender_type === "client" ? "Client" : "Firm"}
              </CABadge>,
              <span key="m" style={{ fontSize: 13 }}>
                {m.message.length > 140 ? `${m.message.slice(0, 140)}…` : m.message}
              </span>,
              !m.is_read && m.sender_type === "client" ? <CABadge key="u" tone="red">Unread</CABadge> : null,
            ])}
        />
      </CACard>
    </div>
  );
}
