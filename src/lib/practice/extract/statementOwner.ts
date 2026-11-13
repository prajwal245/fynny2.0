/**
 * Does this statement belong to this client? A statement for another company or account that is filed under the wrong
 * client is accepted silently otherwise, and its lines then mix into that client's reconciliation.
 *
 * The account holder is read from the statement's own header and compared with the client's name; the account number
 * is compared with the Tally bank ledgers of the client. Neither is guessed: when the statement does not say, the
 * answer is "could not compare", not a pass.
 */
import { compareAccount, statementAccount, type StatementAccount } from "../tallyReconView";

const STOP = new Set(["m", "s", "ms", "mr", "mrs", "shri", "smt", "the", "and", "pvt", "private", "ltd", "limited", "llp", "co", "company", "inc", "proprietor", "prop", "india", "ac", "a", "c", "of"]);

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/m\/s\.?/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** The account holder as the statement prints it ("Account Name : ..."), or the first line that looks like a business name. */
export function holderName(text: string): string | null {
  const head = text.slice(0, 5000);
  const labelled = /(?:account\s*(?:holder'?s?\s*)?name|a\/c\s*(?:holder\s*)?name|customer\s*name|name\s*of\s*(?:the\s*)?(?:account\s*holder|customer)|account\s*holder)\s*[:\-]\s*([^\n,|:]{3,80})/i.exec(head);
  if (labelled) return labelled[1]!.replace(/\s{2,}.*$/, "").trim();
  const mess = /\b(M\/S\.?\s+[A-Z][A-Z0-9 &.\-]{2,60})/.exec(head);
  return mess ? mess[1]!.trim() : null;
}

export interface OwnerCheck {
  state: "match" | "mismatch" | "unknown";
  message: string;
  holder: string | null;
}

/** Whether the holder named on the statement is the client: every distinctive word of the shorter name is in the other. */
export function compareOwner(holder: string | null, clientName: string): OwnerCheck {
  if (!holder) return { state: "unknown", message: "The statement does not name the account holder, so it could not be compared with the client.", holder };
  const a = tokens(holder);
  const b = tokens(clientName);
  if (!a.length || !b.length) return { state: "unknown", message: `The account holder "${holder}" could not be compared with the client name.`, holder };
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const found = small.filter((t) => big.some((u) => u === t || (t.length >= 4 && (u.startsWith(t) || t.startsWith(u)))));
  const share = found.length / small.length;
  return share >= 0.6
    ? { state: "match", message: `The account holder "${holder}" is ${clientName}.`, holder }
    : { state: "mismatch", message: `The statement is for "${holder}", not ${clientName}. It may belong to another client.`, holder };
}

/** The statement's account number and bank against the client's Tally bank ledgers: a match on any one is a match. */
export function compareWithBankLedgers(stmt: StatementAccount, ledgers: string[]): { state: "match" | "mismatch" | "unknown"; message: string } {
  if (!ledgers.length) return { state: "unknown", message: "No Tally bank ledger is linked to this client yet, so the account could not be compared." };
  const results = ledgers.map((l) => compareAccount(stmt, l));
  const hit = results.find((r) => r.state === "match");
  if (hit) return { state: "match", message: hit.message };
  const bad = results.find((r) => r.state === "mismatch");
  if (bad) return { state: "mismatch", message: `${bad.message} None of the client's ${ledgers.length} Tally bank ledger${ledgers.length === 1 ? "" : "s"} fits this statement.` };
  return { state: "unknown", message: results[0]!.message };
}

export { statementAccount };

/**
 * Which client's name is printed on the statement? Looks through the top of the statement for the name of every client of the
 * firm, so it works however the bank lays the header out (a labelled "Account Name", a bare "M/S ..." line, an address block).
 * A client counts as found when nearly all of the distinctive words of its name are in the header.
 */
export function clientFromHeader(text: string, clients: { id: string; name: string }[]): { id: string; name: string; share: number } | null {
  const head = tokens(text.slice(0, 4500));
  if (!head.length) return null;
  let best: { id: string; name: string; share: number } | null = null;
  for (const c of clients) {
    const t = tokens(c.name);
    if (!t.length) continue;
    const found = t.filter((w) => head.some((h) => h === w || (w.length >= 5 && h.startsWith(w))));
    const share = found.length / t.length;
    // One distinctive word alone ("Konkan") is not enough unless the whole name is that one word.
    if (share >= 0.75 && (found.length >= 2 || t.length === 1) && (!best || share > best.share || (share === best.share && t.length > tokens(best.name).length))) best = { id: c.id, name: c.name, share };
  }
  return best;
}

export interface Ownership {
  owner: OwnerCheck;
  account: { state: "match" | "mismatch" | "unknown"; message: string } | null;
  /** The client whose name is on the statement, when that is not the client it was filed under. */
  suggested: { id: string; name: string } | null;
  /** The statement belongs to someone else: its lines are held until a person decides. */
  hold: boolean;
}

/** Decides whether a statement belongs to the client it was filed under. */
export function judgeOwnership(input: {
  text: string;
  filename: string;
  clientId: string;
  clientName: string;
  clients: { id: string; name: string }[];
  bankLedgers: string[] | null;
}): Ownership {
  const found = clientFromHeader(input.text, input.clients);
  const holder = holderName(input.text);
  let owner: OwnerCheck;
  let suggested: Ownership["suggested"] = null;
  if (found && found.id === input.clientId) owner = { state: "match", message: `The statement is for ${input.clientName}.`, holder: holder ?? found.name };
  else if (found) {
    suggested = { id: found.id, name: found.name };
    owner = { state: "mismatch", message: `The statement is for ${found.name}, not ${input.clientName}.`, holder: holder ?? found.name };
  } else owner = compareOwner(holder, input.clientName);
  const account = input.bankLedgers ? compareWithBankLedgers(statementAccount(input.text, input.filename), input.bankLedgers) : null;
  // A statement for another known client, or one whose holder and account both disagree, is not for this client.
  const hold = Boolean(suggested) || (owner.state === "mismatch" && account?.state === "mismatch");
  return { owner, account, suggested, hold };
}
