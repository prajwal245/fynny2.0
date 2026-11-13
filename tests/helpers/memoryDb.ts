/**
 * A small in-memory stand-in for the Supabase client: enough of the query builder (select, insert, update, upsert, delete and the
 * usual filters) and of storage to run the upload pipeline end to end without a database.
 */
type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;

export function memoryDb(
  seed: Record<string, Row[]> = {},
  files: Record<string, Uint8Array> = {},
) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
  );
  let seq = 0;
  const table = (n: string) => (tables[n] ??= []);

  const builder = (name: string) => {
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const preds: Pred[] = [];
    let head = false;
    let wantCount = false;
    let max = Infinity;
    let afterWrite = false;

    const run = (): {
      data: unknown;
      error: { message: string } | null;
      count?: number;
    } => {
      const rows = table(name);
      const hit = () => rows.filter((r) => preds.every((p) => p(r)));
      if (op === "insert" || op === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload!]).map(
          (r) => ({ id: `${name}-${++seq}`, ...r }),
        );
        const keys = (upsertOpts.onConflict ?? "").split(",").filter(Boolean);
        const added: Row[] = [];
        for (const r of incoming) {
          const dupe =
            keys.length && rows.some((x) => keys.every((k) => x[k] === r[k]));
          if (dupe) {
            if (op === "upsert" && !upsertOpts.ignoreDuplicates)
              Object.assign(
                rows.find((x) => keys.every((k) => x[k] === r[k]))!,
                r,
              );
            continue;
          }
          rows.push(r);
          added.push(r);
        }
        return { data: added, error: null };
      }
      if (op === "update") {
        const h = hit();
        h.forEach((r) => Object.assign(r, payload));
        return { data: h, error: null };
      }
      if (op === "delete") {
        const h = hit();
        tables[name] = rows.filter((r) => !h.includes(r));
        return { data: h, error: null };
      }
      const h = hit().slice(0, max);
      return {
        data: head ? null : h,
        error: null,
        ...(wantCount ? { count: hit().length } : {}),
      };
    };

    const q: Record<string, unknown> = {};
    const chain =
      (f: () => void) =>
      (...a: unknown[]) => {
        void a;
        f();
        return q;
      };
    q["select"] = (_cols?: string, o?: { count?: string; head?: boolean }) => {
      if (op === "select") {
        head = !!o?.head;
        wantCount = !!o?.count;
      } else afterWrite = true;
      return q;
    };
    q["insert"] = (p: Row | Row[]) => ((op = "insert"), (payload = p), q);
    q["upsert"] = (p: Row | Row[], o: typeof upsertOpts = {}) => (
      (op = "upsert"),
      (payload = p),
      (upsertOpts = o),
      q
    );
    q["update"] = (p: Row) => ((op = "update"), (payload = p), q);
    q["delete"] = () => ((op = "delete"), q);
    q["eq"] = (k: string, v: unknown) => (preds.push((r) => r[k] === v), q);
    q["neq"] = (k: string, v: unknown) => (preds.push((r) => r[k] !== v), q);
    q["is"] = (k: string, v: unknown) => (
      preds.push((r) => (v === null ? r[k] == null : r[k] === v)),
      q
    );
    q["in"] = (k: string, v: unknown[]) => (
      preds.push((r) => v.includes(r[k])),
      q
    );
    q["not"] = (k: string, o: string, v: unknown) => (
      preds.push(
        (r) => !(o === "is" ? (v === null ? r[k] == null : r[k] === v) : false),
      ),
      q
    );
    q["gte"] = (k: string, v: string | number) => (
      preds.push((r) => (r[k] as string | number) >= v),
      q
    );
    q["lte"] = (k: string, v: string | number) => (
      preds.push((r) => (r[k] as string | number) <= v),
      q
    );
    q["gt"] = (k: string, v: string | number) => (
      preds.push((r) => (r[k] as string | number) > v),
      q
    );
    q["lt"] = (k: string, v: string | number) => (
      preds.push((r) => (r[k] as string | number) < v),
      q
    );
    q["overlaps"] = (k: string, v: unknown[]) => (
      preds.push(
        (r) =>
          Array.isArray(r[k]) && (r[k] as unknown[]).some((x) => v.includes(x)),
      ),
      q
    );
    q["ilike"] = (k: string, v: string) => (
      preds.push((r) =>
        new RegExp(`^${v.replace(/%/g, ".*")}$`, "i").test(String(r[k] ?? "")),
      ),
      q
    );
    q["or"] = (expr: string) => {
      const parts = expr.split(",").map((e) => /^([a-z_]+)\.eq\.(.*)$/.exec(e));
      preds.push((r) => parts.some((m) => m && String(r[m[1]!]) === m[2]));
      return q;
    };
    q["order"] = chain(() => undefined);
    q["limit"] = (n: number) => ((max = n), q);
    q["range"] = chain(() => undefined);
    q["maybeSingle"] = async () => {
      const r = run();
      return {
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : null,
        error: r.error,
      };
    };
    q["single"] = q["maybeSingle"];
    q["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve().then(run).then(res, rej);
    void afterWrite;
    return q;
  };

  const db = {
    from: (n: string) => builder(n),
    storage: {
      from: () => ({
        download: async (p: string) =>
          files[p]
            ? {
                data: {
                  arrayBuffer: async () =>
                    files[p]!.buffer.slice(
                      files[p]!.byteOffset,
                      files[p]!.byteOffset + files[p]!.byteLength,
                    ),
                },
                error: null,
              }
            : { data: null, error: { message: "not found" } },
        upload: async (p: string, b: Uint8Array) => (
          (files[p] = b),
          { error: null }
        ),
      }),
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return { db: db as never, tables };
}
