import type { Db } from "@/lib/practice/db.server";

/** Just enough of the Supabase query builder for the practice services: in-memory tables and chainable filters. */
export function fakeDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let n = 0;
  const T = (name: string) => (tables[name] ??= []);
  const db = {
    tables,
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
    from(name: string) {
      let op: "select" | "insert" | "update" | "upsert" = "select";
      let payload: unknown;
      let conflict: string[] = [];
      let ignoreDup = false;
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      let order: { col: string; asc: boolean } | null = null;
      let lim = Infinity;
      let wantRows = false;
      const run = () => {
        const rows = T(name);
        if (op === "insert" || op === "upsert") {
          const list = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
          const out: Record<string, unknown>[] = [];
          for (const item of list) {
            const dup = op === "upsert" ? rows.find((r) => conflict.length && conflict.every((c) => r[c] === item[c])) : undefined;
            if (dup) {
              if (!ignoreDup) Object.assign(dup, item);
              out.push(dup);
            } else {
              const row = { id: `id${++n}`, created_at: new Date().toISOString(), ...item };
              rows.push(row);
              out.push(row);
            }
          }
          return out;
        }
        let hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") { hit.forEach((r) => Object.assign(r, payload)); return hit; }
        if (order) hit = [...hit].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : String(a[order!.col]) > String(b[order!.col]) ? 1 : 0) * (order!.asc ? 1 : -1));
        return hit.slice(0, lim);
      };
      const b: Record<string, unknown> = {
        select: () => { wantRows = true; return b; },
        insert: (p: unknown) => { op = "insert"; payload = p; return b; },
        update: (p: unknown) => { op = "update"; payload = p; return b; },
        upsert: (p: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => { op = "upsert"; payload = p; conflict = (o?.onConflict ?? "").split(",").filter(Boolean); ignoreDup = !!o?.ignoreDuplicates; return b; },
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
        neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
        is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b; },
        not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return b; },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
        gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return b; },
        lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return b; },
        order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return b; },
        limit: (k: number) => { lim = k; return b; },
        // Rows leave as copies, like a real database's: a caller holding one never sees later updates.
        maybeSingle: async () => { const r = run()[0]; return { data: r ? { ...r } : null, error: null }; },
        single: async () => { const r = run()[0]; return { data: r ? { ...r } : null, error: r ? null : { message: "no row" } }; },
        then: (res: (v: unknown) => void) => { const rows = run(); res({ data: op === "select" || wantRows ? rows.map((r) => ({ ...r })) : null, error: null }); },
      };
      return b;
    },
  };
  return db as unknown as Db & { tables: typeof tables };
}
