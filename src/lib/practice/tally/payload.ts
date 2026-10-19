/**
 * What the Tally agent sends, and the small pure rules around it (pairing
 * codes, hashing). Kept free of I/O so the shape the agent must follow is
 * tested in one place.
 */
import { z } from "zod";
import { round2 } from "../core";
import { fromTallySign, type GroupMaster, type LedgerBalance } from "./statements";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dates are YYYY-MM-DD");
const name = z.string().trim().min(1).max(300);
const money = z.number().finite().min(-1e13).max(1e13);

export const companiesPayload = z.object({
  kind: z.literal("companies"),
  agentVersion: z.string().max(40).optional(),
  tallyVersion: z.string().max(80).optional(),
  companies: z.array(z.object({ name })).max(200),
});

/** `closing` and `opening` are Tally's own signs: a debit is negative. */
export const snapshotPayload = z.object({
  kind: z.literal("snapshot"),
  agentVersion: z.string().max(40).optional(),
  tallyVersion: z.string().max(80).optional(),
  company: name,
  fyStart: date,
  asOn: date,
  groups: z.array(z.object({ name, parent: z.string().trim().max(300), opening: money.optional(), closing: money.optional() })).max(5_000),
  ledgers: z.array(z.object({ name, parent: z.string().trim().max(300), closing: money, opening: money.optional() })).max(30_000),
});
export type SnapshotPayload = z.infer<typeof snapshotPayload>;

/** One range of Tally's Day Book, as the XML Tally produced. Read by the same Tally parser as an uploaded export. */
export const daybookPayload = z.object({
  kind: z.literal("daybook"),
  agentVersion: z.string().max(40).optional(),
  company: name,
  from: date,
  to: date,
  xml: z.string().min(20).max(6 * 1024 * 1024),
});
export type DaybookPayload = z.infer<typeof daybookPayload>;

export const ingestPayload = z.discriminatedUnion("kind", [companiesPayload, snapshotPayload, daybookPayload]);

/** One snapshot, signs flipped to debit-positive and duplicates merged. */
export function normaliseSnapshot(p: SnapshotPayload): { groups: GroupMaster[]; ledgers: LedgerBalance[] } {
  const groups: GroupMaster[] = [...new Map(p.groups.map((g) => [g.name.toLowerCase(), g])).values()].map((g) => ({
    name: g.name,
    parent: g.parent,
    ...(g.opening === undefined ? {} : { opening: fromTallySign(g.opening) }),
    ...(g.closing === undefined ? {} : { closing: fromTallySign(g.closing) }),
  }));
  const merged = new Map<string, LedgerBalance>();
  for (const l of p.ledgers) {
    const k = l.name.toLowerCase();
    const prev = merged.get(k);
    const closing = fromTallySign(l.closing);
    if (prev) prev.closing = round2(prev.closing + closing);
    else merged.set(k, { name: l.name, parent: l.parent, closing, opening: l.opening === undefined ? undefined : fromTallySign(l.opening) });
  }
  return { groups, ledgers: [...merged.values()] };
}

/** Looks like FYN-7K3Q-9XPA. No 0/O/1/I so it survives being read aloud. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function newPairingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const pick = (n: number) => [...random(n)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `FYN-${pick(4)}-${pick(4)}`;
}
export const normaliseCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newAgentToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "fhta_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The Indian financial year (April to March) a date falls in. */
export function fyStartOf(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}
