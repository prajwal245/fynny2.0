/**
 * ⌘K / Ctrl+K: go anywhere, open any client, or start an agent without
 * hunting for the button. Every action is the same one the screens use.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { V } from "../ui";
import { AGENTS, type AgentKey } from "../agents";
import { useV2 } from "../store";

type Command = { id: string; group: string; label: string; hint?: string; agent?: AgentKey; run: () => void };

export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { clients, period, runRecon, generateReport, isRunning, signOut, canSignOff } = useV2();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate({ to });
    const list: Command[] = [
      { id: "nav:today", group: "Go to", label: "Today", hint: "Needs you, agent activity", run: go("/v2") },
      { id: "nav:clients", group: "Go to", label: "Clients", run: go("/v2/clients") },
      { id: "nav:documents", group: "Go to", label: "Documents", hint: "Uploads and unassigned inbox", run: go("/v2/documents") },
      { id: "nav:review", group: "Go to", label: "Review Queue", run: go("/v2/review") },
      { id: "nav:exceptions", group: "Go to", label: "Exception Queue", run: go("/v2/exceptions") },
      { id: "nav:chaser", group: "Go to", label: "Chaser", run: go("/v2/chaser") },
      { id: "nav:reports", group: "Go to", label: "MIS and Reports", run: go("/v2/reports") },
      { id: "nav:settings", group: "Go to", label: "Settings", run: go("/v2/settings") },
      { id: "act:upload", group: "Actions", label: "Upload documents", agent: "extract", run: go("/v2/documents") },
      { id: "act:invite", group: "Actions", label: "Invite a teammate", run: go("/v2/settings") },
      { id: "act:gmail", group: "Actions", label: "Connect Gmail intake", run: go("/v2/settings") },
    ];
    for (const c of clients) {
      list.push({ id: `client:${c.id}`, group: "Clients", label: c.name, hint: c.entityType, run: () => navigate({ to: "/v2/clients/$clientId", params: { clientId: c.id } }) });
      list.push({
        id: `recon:${c.id}`,
        group: "Agents",
        label: `Run recon for ${c.name}`,
        hint: period,
        agent: "recon",
        run: () => {
          if (isRunning("recon", c.id)) return toast.info("Recon is already matching this client.");
          runRecon(c.id, (r) => toast.success(`${c.name}: ${r.matched} matched, ${r.exceptions} exception${r.exceptions === 1 ? "" : "s"}.`));
          navigate({ to: "/v2/clients/$clientId", params: { clientId: c.id }, search: { tab: "recon" } as never });
        },
      });
      list.push({
        id: `mis:${c.id}`,
        group: "Agents",
        label: `Generate ${period} MIS for ${c.name}`,
        hint: "From matched transactions only",
        agent: "narrate",
        run: () => {
          if (isRunning("narrate", c.id)) return toast.info("Narrate is already preparing this MIS.");
          generateReport(c.id, period, "Monthly MIS", (r) => navigate({ to: "/v2/reports/$reportId", params: { reportId: r.id } }));
        },
      });
      list.push({ id: `chase:${c.id}`, group: "Agents", label: `Chase ${c.name} for documents`, agent: "chaser", run: go("/v2/chaser") });
    }
    list.push({ id: "sys:signout", group: "Account", label: "Sign out", run: () => { signOut(); navigate({ to: "/v2/onboarding" }); } });
    return list;
  }, [clients, period, navigate, runRecon, generateReport, isRunning, signOut, canSignOff]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = words.length
      ? commands.filter((c) => words.every((w) => `${c.label} ${c.group} ${c.hint ?? ""}`.toLowerCase().includes(w)))
      : commands.filter((c) => c.group !== "Agents");
    return hits.slice(0, 40);
  }, [q, commands]);

  useEffect(() => setActive(0), [q]);

  const runAt = (i: number) => {
    const c = filtered[i];
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runAt(active); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  if (typeof document === "undefined") return null;
  let lastGroup = "";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="v2" style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "start center", paddingTop: "12vh", paddingInline: 16 }}>
          <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} style={{ position: "absolute", inset: 0, background: "rgba(20,20,20,.28)" }} />
          <motion.div
            role="dialog"
            aria-label="Command menu"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            style={{ position: "relative", width: "min(620px,100%)", background: V.card, borderRadius: 18, border: `1px solid ${V.line}`, boxShadow: "0 30px 80px -30px rgba(20,20,20,.5)", overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${V.line}` }}>
              <Search size={16} color={V.muted} />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search clients, pages, or tell an agent what to do…"
                aria-label="Command"
                style={{ flex: 1, border: 0, outline: "none", fontSize: 15, background: "transparent", color: V.ink, fontFamily: "inherit" }}
              />
              <span className="v2-kbd">Esc</span>
            </div>
            <div role="listbox" style={{ maxHeight: "min(420px,60vh)", overflowY: "auto", padding: 6 }}>
              {filtered.length === 0 && <div style={{ padding: 18, fontSize: 13, color: V.muted }}>Nothing matches “{q}”.</div>}
              {filtered.map((c, i) => {
                const head = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {head && <div style={{ padding: "10px 10px 4px", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: V.muted, fontWeight: 700 }}>{head}</div>}
                    <div
                      role="option"
                      aria-selected={i === active}
                      data-command={c.id}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => runAt(i)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, cursor: "pointer", background: i === active ? V.gray : "transparent" }}
                    >
                      {c.agent ? <span style={{ width: 8, height: 8, borderRadius: 999, background: AGENTS[c.agent].dot }} /> : <span style={{ width: 8 }} />}
                      <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                      {c.hint && <span style={{ fontSize: 12, color: V.muted, whiteSpace: "nowrap" }}>{c.hint}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, padding: "10px 16px", borderTop: `1px solid ${V.line}`, fontSize: 11.5, color: V.muted }}>
              <span><span className="v2-kbd">↑</span> <span className="v2-kbd">↓</span> move</span>
              <span><span className="v2-kbd">Enter</span> run</span>
              <span>Try “recon sundara” or “mis”</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
