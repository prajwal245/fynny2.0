import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, Lock, UploadCloud, XCircle } from "lucide-react";
import { CA } from "@/components/ca/portalUi";

export const Route = createFileRoute("/u/$token")({
  head: () => ({
    meta: [
      { title: "Send your documents | FynHelp" },
      { name: "description", content: "Send the documents your accountant asked for. No login needed." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: UploadPage,
});

type Info =
  | { ok: true; firmName: string; clientName: string | null; items: string[]; filesLeft: number; expiresAt: string; resolved: boolean }
  | { ok: false; reason: "invalid" | "expired" | "full" };

type Item = { id: number; name: string; size: number; state: "uploading" | "done" | "error"; pct: number; message?: string; duplicate?: boolean };

const WHY: Record<string, { title: string; hint: string }> = {
  invalid: { title: "This link is not valid", hint: "Please ask your accountant to send you a new one." },
  expired: { title: "This link has expired", hint: "Links last 14 days. Ask your accountant to send you a new one." },
  full: { title: "This link has reached its limit", hint: "Ask your accountant to send you a new link." },
};
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function UploadPage() {
  const { token } = Route.useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const next = useRef(1);
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/upload-link?token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<Info>)
      .then((d) => alive && setInfo(d))
      .catch(() => alive && setInfo({ ok: false, reason: "invalid" }));
    return () => {
      alive = false;
    };
  }, [token]);

  const send = useCallback(
    (file: File) => {
      const id = next.current++;
      setItems((p) => [...p, { id, name: file.name || "photo", size: file.size, state: "uploading", pct: 0 }]);
      const patch = (o: Partial<Item>) => setItems((p) => p.map((x) => (x.id === id ? { ...x, ...o } : x)));
      const form = new FormData();
      form.append("token", token);
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/public/upload-link");
      xhr.upload.onprogress = (e) => e.lengthComputable && patch({ pct: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let body: { ok?: boolean; message?: string; duplicate?: boolean } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* fall through to the generic message */
        }
        if (xhr.status === 200 && body.ok) patch({ state: "done", pct: 100, duplicate: body.duplicate });
        else patch({ state: "error", message: body.message ?? "We could not save that file. Please try again." });
      };
      xhr.onerror = () => patch({ state: "error", message: "No connection. Check your internet and try again." });
      xhr.send(form);
    },
    [token],
  );

  const add = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(send);
    if (pick.current) pick.current.value = "";
    if (cam.current) cam.current.value = "";
  };

  const done = items.filter((i) => i.state === "done").length;
  const busy = items.some((i) => i.state === "uploading");

  return (
    <main style={{ background: CA.bg, minHeight: "100vh", padding: "24px 16px 48px", fontFamily: CA.sans, color: CA.ink }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {!info ? (
          <p style={{ textAlign: "center", color: CA.muted, marginTop: 80 }}>Loading…</p>
        ) : !info.ok ? (
          <div style={card({ textAlign: "center", padding: "36px 24px", marginTop: 40 })}>
            <XCircle size={36} color={CA.red} aria-hidden />
            <h1 style={{ fontFamily: CA.serif, fontSize: 22, margin: "12px 0 6px" }}>{WHY[info.reason].title}</h1>
            <p style={{ color: CA.muted, margin: 0, lineHeight: 1.6 }}>{WHY[info.reason].hint}</p>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: CA.teal, fontWeight: 700 }}>From {info.firmName}</div>
            <h1 style={{ fontFamily: CA.serif, fontSize: 26, lineHeight: 1.2, margin: "6px 0 8px" }}>
              {info.clientName ? `Hello, ${info.clientName}` : "Send your documents"}
            </h1>
            <p style={{ color: CA.muted, margin: "0 0 16px", lineHeight: 1.6, fontSize: 15 }}>
              {info.resolved
                ? "Everything requested has been received. You can still add more files below."
                : "Please send the following. Photos from your phone are fine."}
            </p>

            {info.items.length > 0 && (
              <ul style={{ ...card({ padding: "6px 16px" }), listStyle: "none", margin: "0 0 16px" }} aria-label="What we need">
                {info.items.map((t, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: i ? `0.5px solid ${CA.line}` : "none", fontSize: 14.5 }}>
                    <FileText size={16} color={CA.teal} aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                add(e.dataTransfer.files);
              }}
              style={{ ...card({ padding: 22, textAlign: "center" }), border: `1.5px dashed ${drag ? CA.teal : "rgba(23,18,8,0.22)"}`, background: drag ? CA.tealSoft : CA.card }}
            >
              <UploadCloud size={30} color={CA.teal} aria-hidden />
              <div style={{ fontWeight: 650, fontSize: 16, margin: "8px 0 4px" }}>Add your files</div>
              <div style={{ color: CA.muted, fontSize: 13, marginBottom: 14 }}>PDF, photos, Excel or CSV · up to 15 MB each</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => pick.current?.click()} style={btn(true)}>
                  <UploadCloud size={16} aria-hidden /> Choose files
                </button>
                <button type="button" onClick={() => cam.current?.click()} style={btn(false)}>
                  <Camera size={16} aria-hidden /> Take a photo
                </button>
              </div>
              <input ref={pick} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.csv,.xls,.xlsx,application/pdf,image/*" onChange={(e) => add(e.target.files)} />
              <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => add(e.target.files)} />
            </div>

            {items.length > 0 && (
              <ul aria-live="polite" style={{ ...card({ padding: "4px 16px" }), listStyle: "none", margin: "16px 0 0" }}>
                {items.map((it, i) => (
                  <li key={it.id} style={{ padding: "12px 0", borderTop: i ? `0.5px solid ${CA.line}` : "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{it.name}</span>
                      <span style={{ fontSize: 12.5, color: it.state === "error" ? CA.red : it.state === "done" ? CA.green : CA.muted, display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                        {it.state === "done" && <CheckCircle2 size={15} aria-hidden />}
                        {it.state === "uploading" ? `${it.pct}%` : it.state === "done" ? (it.duplicate ? "Already received" : "Received") : "Not sent"}
                      </span>
                    </div>
                    {it.state === "uploading" && (
                      <div style={{ height: 4, borderRadius: 4, background: "rgba(23,18,8,.08)", marginTop: 8 }}>
                        <div style={{ width: `${it.pct}%`, height: "100%", borderRadius: 4, background: CA.teal, transition: "width .2s" }} />
                      </div>
                    )}
                    {it.state === "error" && <div style={{ color: CA.red, fontSize: 12.5, marginTop: 4 }}>{it.message}</div>}
                    {it.state !== "error" && <div style={{ color: CA.faint, fontSize: 12, marginTop: 2 }}>{kb(it.size)}</div>}
                  </li>
                ))}
              </ul>
            )}

            {done > 0 && !busy && (
              <div role="status" style={{ ...card({ padding: 18, marginTop: 16 }), background: "rgba(31,90,70,0.08)", borderColor: "rgba(31,90,70,0.25)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 650, color: CA.green }}>
                  <CheckCircle2 size={18} aria-hidden /> Thank you. {info.firmName} has received {done} file{done === 1 ? "" : "s"}.
                </div>
                <p style={{ margin: "6px 0 0", color: CA.muted, fontSize: 13.5, lineHeight: 1.6 }}>You can close this page, or add more files above. Reminders for this request stop on their own once everything is in.</p>
              </div>
            )}

            <p style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", color: CA.faint, fontSize: 12, marginTop: 22, textAlign: "center" }}>
              <Lock size={12} aria-hidden /> Sent securely to {info.firmName}. No login needed. This link works until{" "}
              {new Date(info.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
            </p>
          </>
        )}
        <p style={{ textAlign: "center", color: CA.faint, fontSize: 11.5, marginTop: 8 }}>Prepared with FynHelp</p>
      </div>
    </main>
  );
}

function card(extra: React.CSSProperties): React.CSSProperties {
  return { background: CA.card, border: `0.5px solid ${CA.line}`, borderRadius: 16, boxShadow: "0 1px 2px rgba(23,18,8,.04)", ...extra };
}
function btn(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    padding: "0 20px",
    borderRadius: 12,
    fontFamily: CA.sans,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    border: primary ? "none" : `1px solid ${CA.line}`,
    background: primary ? CA.teal : CA.card,
    color: primary ? "#fff" : CA.ink,
  };
}
