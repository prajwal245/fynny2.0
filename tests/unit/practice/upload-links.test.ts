// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const registered: Record<string, unknown>[] = [];
vi.mock("@/lib/practice/documents.server", () => ({
  BUCKET: "bucket",
  registerDocument: async (_db: unknown, _ctx: unknown, input: Record<string, unknown>) => {
    registered.push(input);
    return { extraction_id: "x1", duplicate: false };
  },
}));
vi.mock("@/lib/practice/db.server", () => ({ logActivity: async () => undefined }));

import { acceptUpload, createUploadLink, hashToken, linkInfo, MAX_FILE_BYTES } from "@/lib/practice/uploadLinks.server";

type Row = Record<string, unknown>;
const links: Row[] = [];
const uploads: string[] = [];
const db = {
  from: (table: string) => {
    const f: ((r: Row) => boolean)[] = [];
    let op = "select";
    let payload: Row = {};
    const data = () => (table === "ca_upload_links" ? links : table === "ca_firms" ? [{ firm_name: "Rao & Co" }] : table === "ca_clients" ? [{ client_name: "Acme Traders" }] : [{ title: "Bank statement", period: "Sep 2026", status: "open" }]);
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === undefined || r[k] === v); return b; },
      limit: () => b,
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      // A copy, as a real database returns: later changes to the row must not change what was read.
      maybeSingle: async () => {
        const row = data().filter((r) => f.every((x) => x(r)))[0];
        return { data: row ? { ...row } : null, error: null };
      },
      then: (ok: (v: unknown) => unknown) => {
        if (op === "insert") links.push({ id: `l${links.length + 1}`, files_uploaded: 0, max_files: 25, revoked_at: null, ...payload });
        return Promise.resolve({ data: op === "select" ? data() : null, error: null }).then(ok);
      },
    };
    return b;
  },
  rpc: async (fn: string, a: { p_link: string }) => {
    const l = links.find((x) => x.id === a.p_link)!;
    if (fn === "ca_upload_link_take") {
      if (Number(l.files_uploaded) >= Number(l.max_files)) return { data: false, error: null };
      l.files_uploaded = Number(l.files_uploaded) + 1;
      return { data: true, error: null };
    }
    l.files_uploaded = Math.max(0, Number(l.files_uploaded) - 1);
    return { data: null, error: null };
  },
  storage: { from: () => ({ upload: async (p: string) => { uploads.push(p); return { error: null }; } }) },
} as never;

const pdf = (n = 20) => new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new Array(n).fill(0x20)]);
const file = (o: Partial<{ name: string; mime: string; bytes: Uint8Array }> = {}) => ({ name: "stmt.pdf", mime: "application/pdf", bytes: pdf(), ...o });
const now = new Date("2026-10-26T10:00:00Z");

beforeEach(() => {
  links.length = 0;
  uploads.length = 0;
  registered.length = 0;
});

describe("upload links", () => {
  it("a new link is stored as a hash that expires in 14 days", async () => {
    const l = await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now);
    expect(l!.url).toBe(`https://fynhelp.com/u/${l!.token}`);
    expect(links[0].token_hash).toBe(hashToken(l!.token));
    expect(JSON.stringify(links[0])).not.toContain(l!.token);
    expect(links[0].expires_at).toBe("2026-11-09T10:00:00.000Z");
  });

  it("the page learns who is asking and what for, and nothing more", async () => {
    const l = (await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now))!;
    expect(await linkInfo(db, l.token, now)).toMatchObject({ ok: true, firmName: "Rao & Co", clientName: "Acme Traders", items: ["Bank statement (Sep 2026)"], filesLeft: 25 });
  });

  it("an unknown, malformed, expired or full link is refused", async () => {
    const l = (await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now))!;
    expect(await linkInfo(db, "nope", now)).toEqual({ ok: false, reason: "invalid" });
    expect(await linkInfo(db, "A".repeat(32), now)).toEqual({ ok: false, reason: "invalid" });
    expect(await linkInfo(db, l.token, new Date("2026-12-01T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
    links[0].files_uploaded = 25;
    expect(await linkInfo(db, l.token, now)).toEqual({ ok: false, reason: "full" });
    links[0].files_uploaded = 0;
    links[0].revoked_at = "2026-10-26T00:00:00Z";
    expect(await linkInfo(db, l.token, now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a good file is stored under the firm and client, and registered against the chase", async () => {
    const l = (await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now))!;
    const r = await acceptUpload(db, l.token, file(), now);
    expect(r).toMatchObject({ ok: true, duplicate: false, filesLeft: 24 });
    expect(uploads[0]).toMatch(/^f1\/b1\/upload-link\/\d+_stmt\.pdf$/);
    expect(registered[0]).toMatchObject({ channel: "Upload link", business_id: "b1", request_id: "r1", mime: "application/pdf", process: false });
  });

  it("refuses the wrong type, a disguised file, an empty file and a big file, and keeps no slot for them", async () => {
    const l = (await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now))!;
    expect(await acceptUpload(db, l.token, file({ mime: "application/x-msdownload" }), now)).toMatchObject({ ok: false, reason: "type" });
    expect(await acceptUpload(db, l.token, file({ bytes: new Uint8Array([0x4d, 0x5a, 0x90]) }), now)).toMatchObject({ ok: false, reason: "type" });
    expect(await acceptUpload(db, l.token, file({ bytes: new Uint8Array() }), now)).toMatchObject({ ok: false });
    expect(await acceptUpload(db, l.token, file({ bytes: pdf(MAX_FILE_BYTES) }), now)).toMatchObject({ ok: false, reason: "size" });
    expect(links[0].files_uploaded).toBe(0);
    expect(uploads).toHaveLength(0);
  });

  it("stops at the file limit, and an expired link takes nothing", async () => {
    const l = (await createUploadLink(db, { firmId: "f1", businessId: "b1", requestId: "r1" }, now))!;
    links[0].max_files = 2;
    expect((await acceptUpload(db, l.token, file(), now)).ok).toBe(true);
    expect((await acceptUpload(db, l.token, file(), now)).ok).toBe(true);
    expect(await acceptUpload(db, l.token, file(), now)).toMatchObject({ ok: false, reason: "full" });
    expect(await acceptUpload(db, l.token, file(), new Date("2027-01-01T00:00:00Z"))).toMatchObject({ ok: false, reason: "expired" });
    expect(uploads).toHaveLength(2);
  });
});
