/**
 * In the exception drawer: for a bank charge, or a receipt that names one open invoice, a partner
 * can have FynHelp create that one entry in the client's Zoho Books. Always previewed first,
 * always approved by a person, always undoable. Hidden unless posting is switched on for the client.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { zohoBooksPost, zohoBooksPreviewPost, zohoBooksStatus, zohoBooksUndoPost } from "@/lib/practice/practice.functions";
import { V } from "../ui";
import { useV2 } from "../store";

type Preview = Awaited<ReturnType<typeof zohoBooksPreviewPost>>;
const msg = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

export function ZohoPostPanel({ clientId, txnId, side, open }: { clientId: string; txnId?: string; side?: string; open: boolean }) {
  const { canSignOff } = useV2();
  const [linkId, setLinkId] = useState<string | null>(null);
  const [view, setView] = useState<Preview | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "post" | "undo" | null>(null);
  const [posted, setPosted] = useState<{ postingId: string } | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    setView(null);
    setWhy(null);
    setPosted(null);
    setUndone(false);
    setLinkId(null);
    if (!canSignOff || !txnId || side !== "bank" || !open) return;
    let live = true;
    void zohoBooksStatus()
      .then((s) => {
        if (!live || !s.postingAvailable || !s.writeEnabled) return;
        const l = s.links.find((x) => x.business_id === clientId && x.posting_enabled);
        if (l) setLinkId(l.id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [canSignOff, clientId, txnId, side, open]);

  if (!linkId || !txnId) return null;

  const show = async () => {
    setBusy("preview");
    setWhy(null);
    try {
      setView(await zohoBooksPreviewPost({ data: { linkId, txnId } }));
    } catch (e) {
      setWhy(msg(e));
    } finally {
      setBusy(null);
    }
  };
  const approve = async () => {
    setBusy("post");
    try {
      const r = await zohoBooksPost({ data: { linkId, txnId } });
      setPosted({ postingId: r.postingId });
      setView(null);
      toast.success("Entry created in Zoho Books");
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setBusy(null);
    }
  };
  const undo = async () => {
    if (!posted) return;
    setBusy("undo");
    try {
      await zohoBooksUndoPost({ data: { postingId: posted.postingId } });
      setPosted(null);
      setUndone(true);
      toast.success("Entry removed from Zoho Books");
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="zoho-post" style={{ border: `1px solid ${V.line}`, borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 650 }}>Zoho Books</div>
      {posted ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
          <span className="ic-check"><Check size={12} strokeWidth={3} /></span>
          <span style={{ color: "#1F6B45", fontWeight: 600 }}>Created in Zoho Books. Pull the month again to match it.</span>
          <button className="v2-btn v2-btn-quiet" style={{ padding: "6px 10px", fontSize: 12.5 }} disabled={busy === "undo"} onClick={() => void undo()}>
            <Undo2 size={13} /> Undo
          </button>
        </div>
      ) : view ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{view.title}</div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 14px", fontSize: 13 }}>
            {view.lines.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ color: V.muted }}>{k}</dt>
                <dd style={{ margin: 0 }}>{v}</dd>
              </div>
            ))}
          </dl>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="v2-btn v2-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} disabled={busy === "post"} data-testid="zoho-approve" onClick={() => void approve()}>
              {busy === "post" ? <><span className="ic-spin" /> Creating…</> : "Approve and create in Zoho"}
            </button>
            <button className="v2-btn v2-btn-quiet" onClick={() => setView(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {why && <div style={{ fontSize: 12.5, color: V.body }} data-testid="zoho-why">{why}</div>}
          {undone && <div style={{ fontSize: 12.5, color: V.body }}>Removed from Zoho Books.</div>}
          <button className="v2-btn v2-btn-ghost" style={{ justifySelf: "start", padding: "8px 14px", fontSize: 13 }} disabled={busy === "preview"} data-testid="zoho-preview" onClick={() => void show()}>
            {busy === "preview" ? <><span className="ic-spin" /> Checking…</> : "Post to Zoho Books…"}
          </button>
        </>
      )}
    </div>
  );
}
