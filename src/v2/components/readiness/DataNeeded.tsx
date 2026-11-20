import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "../../ui";
import { useV2 } from "../../store";
import { getPracticeReadiness, markPracticeInput } from "@/lib/practice/practice.functions";
import { INPUTS, PACKS, askable, composeRequest, requestPlan, type InputStates, type Pack } from "@/lib/practice/readiness/model";
import ReadinessView from "./ReadinessView";
import RequestPanel, { type Channel } from "./RequestPanel";

/** The monthly month and the financial year that a screen is looking at. */
export const fyOf = (month: string) => { const [y, m] = month.split("-").map(Number); const s = m! >= 4 ? y! : y! - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

/**
 * The data pathway for one client: what each review needs, what has arrived, and what is still missing, with one request for it.
 * Items read from documents tick themselves; a person marks the rest. Nothing is posted or filed.
 */
export default function DataNeeded({ clientId, month, onOpenCheck, onBlockedCount }: { clientId: string; month: string; onOpenCheck?: (opensIn: string) => void; onBlockedCount?: (n: number) => void }) {
  const { clients, addChase } = useV2();
  const client = clients.find((c) => c.id === clientId);
  const fy = fyOf(month);
  const [pack, setPack] = useState<Pack>("monthly");
  const [inputs, setInputs] = useState<InputStates>({});
  const [sqlMissing, setSqlMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(client?.phone ? "whatsapp" : "email");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await getPracticeReadiness({ data: { business_id: clientId, month, fy } });
      setInputs(r.inputs);
      setSqlMissing(r.sqlMissing);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load what the client has sent.");
    }
  }, [clientId, month, fy]);
  useEffect(() => { void load(); }, [load]);

  const missing = useMemo(() => INPUTS.filter((i) => !["received", "not_applicable"].includes(inputs[i.key]?.status ?? "")), [inputs]);
  // Conditional items (bill-wise, loans) are asked for only once the team says they apply.
  const toAsk = useMemo(() => askable(missing), [missing]);
  const plan = useMemo(() => requestPlan(toAsk, { firmHoldsGstLogin: true, firmHoldsItLogin: true, tallyConnected: false }), [toAsk]);

  const draft = useCallback(() => composeRequest(client?.contactName || client?.name || "there", plan.clientRequests, { period: `FY ${fy}`, uploadUrl: "auto" }), [client, plan, fy]);
  useEffect(() => { if (!open) setMessage(draft()); }, [open, draft]);
  useEffect(() => { onBlockedCount?.(missing.length); }, [missing.length, onBlockedCount]);

  const onMark = async (key: string, status: "received" | "not_applicable" | "missing") => {
    let note: string | null = null;
    if (status === "not_applicable") {
      note = window.prompt("Why does this not apply to this client?")?.trim() || null;
      if (!note) return;
    }
    const before = inputs;
    setInputs((cur) => ({ ...cur, [key]: status === "missing" ? undefined : { status, source: "marked", at: new Date().toISOString(), note } }));
    try {
      await markPracticeInput({ data: { business_id: clientId, key, month, fy, status, note } });
      if (status === "received") toast.success("Marked as received. The checks it unblocks can run now.");
    } catch (e) {
      setInputs(before);
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  };

  const send = () => {
    if (!client) return;
    addChase({
      clientId, type: `Data for FY ${fy}`.slice(0, 200), contact: client.contactName || client.name, email: client.email ?? "", phone: client.phone ?? "", due: "",
      note: message.length <= 1000 ? message : plan.clientRequests.map((i, n) => `${n + 1}. ${i.label}`).join("\n").slice(0, 1000), channel,
    } as Parameters<typeof addChase>[0]);
    setSent(true);
    toast.success("Request sent. The Chaser keeps following up until it arrives.");
  };

  if (!client) return null;
  const reachable = channel === "email" ? (client.email || "No email saved") : client.phone ? `${client.contactName || client.name} · ${client.phone}` : "No WhatsApp number saved";
  return (
    <>
      <ReadinessView
        client={client.name} pack={pack} onPack={setPack} inputs={inputs} sqlMissing={sqlMissing} onMark={onMark} onOpenCheck={onOpenCheck}
        onRequest={() => { setSent(false); setOpen(true); }} clientCount={plan.clientRequests.length + plan.partyRequests.length} teamCount={plan.firmTasks.length}
      />
      <Drawer open={open} onClose={() => setOpen(false)} title="Request what is missing" expandable>
        <RequestPanel
          client={client.name} plan={plan} message={message} onMessage={setMessage} channel={channel} onChannel={setChannel} sent={sent} reachable={reachable}
          onSend={send} onCopy={() => { void navigator.clipboard?.writeText(message); toast.success("Copied."); }}
        />
      </Drawer>
    </>
  );
}

export { PACKS };
