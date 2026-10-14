/** Small building blocks shared by the admin control pages. */
import type { ReactNode } from "react";

export const ink = "#171208";
export const maroon = "#8A1E18";
export const muted = "rgba(23,18,8,.6)";
export const line = "rgba(23,18,8,.1)";

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: ink }}>{title}</h1>
        {sub && <p className="text-sm mt-1" style={{ color: muted }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, children, action, testId }: { title?: string; children: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <section className="rounded-2xl bg-white p-5 mb-5" style={{ border: `1px solid ${line}` }} data-testid={testId}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h2 className="text-sm font-semibold" style={{ color: ink }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${line}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: muted }}>{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: ink }}>{value}</div>
      {hint && <div className="text-xs mt-1" style={{ color: muted }}>{hint}</div>}
    </div>
  );
}

export function Table({ head, children, testId }: { head: string[]; children: ReactNode; testId?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wider py-2 px-2 whitespace-nowrap" style={{ color: muted, borderBottom: `1px solid ${line}` }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "", mono }: { children: ReactNode; className?: string; mono?: boolean }) {
  return (
    <td className={`py-2.5 px-2 align-top ${mono ? "font-mono text-xs" : ""} ${className}`} style={{ borderBottom: `1px solid ${line}` }}>
      {children}
    </td>
  );
}

const TONES: Record<string, [string, string]> = {
  good: ["rgba(22,101,52,.1)", "#166534"],
  warn: ["rgba(180,83,9,.12)", "#92400e"],
  bad: ["rgba(138,30,24,.1)", maroon],
  info: ["rgba(23,18,8,.06)", ink],
};

export function Pill({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  const [bg, fg] = TONES[tone];
  return <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>{children}</span>;
}

export function Btn({ children, onClick, kind = "ghost", disabled, testId, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; testId?: string; type?: "button" | "submit" }) {
  const style =
    kind === "primary" ? { background: maroon, color: "#fff" } : kind === "danger" ? { background: "#fff", color: maroon, border: `1px solid ${maroon}` } : { background: "#fff", color: ink, border: `1px solid ${line}` };
  return (
    <button type={type} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 whitespace-nowrap" style={style} onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm py-6 text-center" style={{ color: muted }}>{children}</p>;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const m = error instanceof Error ? error.message.replace(/^ADMIN_REAUTH:\s*/, "") : String(error);
  return <p className="text-sm rounded-lg px-3 py-2 mb-4" style={{ background: "rgba(138,30,24,.08)", color: maroon }}>{m}</p>;
}
