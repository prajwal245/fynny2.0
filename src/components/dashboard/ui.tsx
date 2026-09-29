/**
 * Dashboard design-system primitives.
 *
 * Use these on every /dashboard/* page so typography, spacing, colors,
 * tables and badges stay consistent. Existing brand tokens win
 * (fyn-beige page bg, fyn-beige-card cards, Georgia/Playfair headings,
 * fyn-red accents). Only the structure/scale comes from the new spec.
 *
 * Tokens used:
 *   - bg-fyn-beige        page background
 *   - bg-fyn-beige-card   card background
 *   - text-fyn-ink / -60 / -45 / -40   text hierarchy
 *   - border-fyn-ink-10   borders / dividers
 *   - text-fyn-h1 / h2 / h3 / body / small / tiny / metric  type scale
 *   - p-fyn-lg / gap-fyn-lg ...                              spacing scale
 */
import { ReactNode, HTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Layout ───────────────────────────────────────────── */

export function FynPage({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("max-w-[1400px] mx-auto p-fyn-lg space-y-fyn-lg", className)} {...rest}>
      {children}
    </div>
  );
}

export function FynPageTitle({ children, sub, className }: { children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <header className={cn("space-y-fyn-xs", className)}>
      <h1 className="font-serif text-fyn-h1 text-fyn-ink">{children}</h1>
      {sub && <p className="text-fyn-body text-fyn-ink-60">{sub}</p>}
    </header>
  );
}

/* ── Card ─────────────────────────────────────────────── */

export function FynCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-fyn-beige-card border border-fyn-ink-10 rounded-lg p-fyn-lg", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function FynCardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("font-serif text-fyn-h3 text-fyn-ink mb-fyn-md", className)}>{children}</h3>;
}

export function FynSectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("font-serif text-fyn-h2 text-fyn-ink mb-fyn-md", className)}>{children}</h2>;
}

/* ── Labels & values ──────────────────────────────────── */

export function FynLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-fyn-tiny font-medium text-fyn-ink-45 uppercase tracking-[0.06em]", className)}>
      {children}
    </p>
  );
}

export function FynMetric({ value, label, sub, className }: { value: ReactNode; label?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <FynLabel className="mb-fyn-sm">{label}</FynLabel>}
      <p className="font-mono text-fyn-metric text-fyn-ink mt-fyn-xs">{value}</p>
      {sub && <p className="text-fyn-small text-fyn-ink-40 mt-fyn-xs">{sub}</p>}
    </div>
  );
}

/* ── Buttons ──────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" };

export function FynButton({ className, variant = "primary", ...rest }: BtnProps) {
  const base = "px-5 py-2.5 text-fyn-body font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2";
  const variants: Record<string, string> = {
    primary: "bg-fyn-red text-white hover:bg-fyn-red-dark",
    secondary: "bg-fyn-beige-card text-fyn-ink border border-fyn-ink-10 hover:bg-fyn-ink-05",
    ghost: "text-fyn-ink-60 hover:text-fyn-ink hover:bg-fyn-ink-05",
  };
  return <button className={cn(base, variants[variant], className)} {...rest} />;
}

/* ── Badges ───────────────────────────────────────────── */

type BadgeTone = "success" | "warning" | "danger" | "neutral";

export function FynBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    success: "bg-[#DCFCE7] text-[#16A34A]",
    warning: "bg-[#FEF3E2] text-[#8B5A00]",
    danger: "bg-[#FDEAEA] text-[#C41E1E]",
    neutral: "bg-[#F1F5F9] text-[#475569]",
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-fyn-tiny font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ── Table ────────────────────────────────────────────── */

export function FynTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full", className)}>{children}</table>
    </div>
  );
}

export function FynTH({ children, align = "left", className }: { children?: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <th
      className={cn(
        "px-fyn-md py-fyn-sm text-fyn-tiny font-medium text-fyn-ink-45 uppercase tracking-[0.06em]",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}

export function FynTR({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-fyn-ink-10 hover:bg-fyn-ink-02 transition-colors", className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function FynTD({ children, align = "left", mono, className }: { children?: ReactNode; align?: "left" | "right"; mono?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        "px-fyn-md py-fyn-sm text-fyn-small font-medium text-fyn-ink-60",
        align === "right" ? "text-right" : "text-left",
        mono && "font-mono",
        className
      )}
    >
      {children}
    </td>
  );
}

/* ── Form inputs ──────────────────────────────────────── */

const inputBase =
  "w-full bg-fyn-beige-card border border-fyn-ink-10 rounded-md px-fyn-md py-fyn-sm text-fyn-body text-fyn-ink placeholder:text-fyn-ink-40 focus:outline-hidden focus:ring-2 focus:ring-fyn-red focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const FynInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FynInput({ className, type = "text", ...rest }, ref) {
    return <input ref={ref} type={type} className={cn(inputBase, className)} {...rest} />;
  }
);

export const FynSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FynSelect({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(inputBase, "appearance-none bg-no-repeat bg-[right_12px_center] pr-10", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231A1008' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e\")",
        }}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

export const FynTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function FynTextarea({ className, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(inputBase, "resize-y", className)} {...rest} />;
  }
);

export const FynSearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FynSearchInput({ className, placeholder = "Search…", ...rest }, ref) {
    return (
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fyn-ink-40 pointer-events-none" />
        <input
          ref={ref}
          type="search"
          placeholder={placeholder}
          className={cn(inputBase, "pl-9", className)}
          {...rest}
        />
      </div>
    );
  }
);

export function FynField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-fyn-xs", className)}>
      {label && <label className="block text-fyn-small font-medium text-fyn-ink-60">{label}</label>}
      {children}
      {error ? (
        <p className="text-fyn-tiny text-fyn-danger">{error}</p>
      ) : hint ? (
        <p className="text-fyn-tiny text-fyn-ink-45">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── States ───────────────────────────────────────────── */

export function FynLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-fyn-sm">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-32 bg-fyn-ink-05 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

export function FynEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <FynCard className="p-fyn-2xl text-center">
      {icon && (
        <div className="mx-auto w-16 h-16 mb-fyn-md rounded-full bg-fyn-ink-05 flex items-center justify-center text-fyn-ink-45">
          {icon}
        </div>
      )}
      <h3 className="font-serif text-[20px] font-semibold text-fyn-ink mb-fyn-sm">{title}</h3>
      {description && <p className="text-fyn-body text-fyn-ink-60 mb-fyn-lg">{description}</p>}
      {action}
    </FynCard>
  );
}
