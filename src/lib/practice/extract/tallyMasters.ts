/**
 * Tally masters as XML: the ledgers of a company with their groups and opening balances ("Import Data" with
 * REPORTNAME "All Masters", or a Tally export of the same ledgers).
 *
 *   <LEDGER NAME="ICICI Bank CA 6205" ACTION="Create">
 *     <PARENT>Bank Accounts</PARENT>          the group the ledger sits under
 *     <OPENINGBALANCE>-2955158.12</OPENINGBALANCE>   Tally writes a DEBIT balance NEGATIVE and a credit balance positive
 *
 * A masters file holds no transactions. It tells FynHelp which ledgers exist (so an entry is only ever posted to a real
 * one) and whether the opening position adds up, which is the first thing to check before any month is closed.
 */
import { decodeEntities } from "./xml";

export interface MasterLedger {
  name: string;
  parent: string;
  /** Signed as Tally writes it: negative is a debit balance, positive a credit balance. 0 when none. */
  opening: number;
  gstin: string | null;
  state: string | null;
}

export interface TallyMasters {
  company: string | null;
  ledgers: MasterLedger[];
  /** Totals in paise. */
  debitPaise: number;
  creditPaise: number;
}

/** True for a masters file: ledgers with a group, and no vouchers or ledger report lines. */
export function isTallyMastersXml(text: string): boolean {
  const head = text.slice(0, 200_000);
  return (
    /<LEDGER\s+NAME\s*=/i.test(head) &&
    !/<VOUCHER[\s>]/i.test(head) &&
    !/<DSPVCHDATE\b/i.test(head)
  );
}

const tag = (block: string, name: string): string | null => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, "i").exec(
    block,
  );
  return m ? decodeEntities(m[1]!.trim()) || null : null;
};

export function readTallyMasters(xml: string): TallyMasters {
  const ledgers: MasterLedger[] = [];
  for (const m of xml.matchAll(
    /<LEDGER\s+NAME\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER\s*>/gi,
  )) {
    const body = m[2]!;
    const opening = Number(
      (tag(body, "OPENINGBALANCE") ?? "0")
        .replace(/[,\s₹]/g, "")
        .replace(/(dr|cr)$/i, ""),
    );
    ledgers.push({
      name: decodeEntities(m[1]!).trim(),
      parent: tag(body, "PARENT") ?? "",
      opening: Number.isFinite(opening) ? opening : 0,
      gstin: tag(body, "PARTYGSTIN"),
      state: tag(body, "LEDSTATENAME"),
    });
  }
  let debitPaise = 0;
  let creditPaise = 0;
  for (const l of ledgers) {
    const p = Math.round(Math.abs(l.opening) * 100);
    if (l.opening < 0) debitPaise += p;
    else if (l.opening > 0) creditPaise += p;
  }
  return {
    company: tag(xml, "SVCURRENTCOMPANY"),
    ledgers,
    debitPaise,
    creditPaise,
  };
}

const inr = (p: number) =>
  `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BANK_GROUPS = /^(bank accounts|bank od a\/c|bank occ a\/c)$/i;
const CASH_GROUP = /^cash-in-hand$/i;

export function mastersSummary(r: TallyMasters): {
  entries: number;
  totals: { label: string; amount: number }[];
  groups: { key: string; amount: number; count: number }[];
  checks: { ok: boolean; label: string; detail: string }[];
  note: string;
} {
  const byGroup = new Map<string, { amount: number; count: number }>();
  for (const l of r.ledgers) {
    const g = byGroup.get(l.parent || "(no group)") ?? { amount: 0, count: 0 };
    g.count++;
    g.amount += Math.abs(l.opening);
    byGroup.set(l.parent || "(no group)", g);
  }
  const names = new Map<string, number>();
  for (const l of r.ledgers)
    names.set(l.name.toLowerCase(), (names.get(l.name.toLowerCase()) ?? 0) + 1);
  const dupes = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  const banks = r.ledgers.filter((l) => BANK_GROUPS.test(l.parent));
  const cash = r.ledgers.filter((l) => CASH_GROUP.test(l.parent));
  const noGroup = r.ledgers.filter((l) => !l.parent);
  const diff = r.debitPaise - r.creditPaise;
  return {
    entries: r.ledgers.length,
    totals: [
      { label: "Opening debits", amount: r.debitPaise / 100 },
      { label: "Opening credits", amount: r.creditPaise / 100 },
    ],
    groups: [...byGroup]
      .map(([key, g]) => ({
        key,
        amount: Math.round(g.amount * 100) / 100,
        count: g.count,
      }))
      .sort((a, b) => b.count - a.count),
    checks: [
      {
        ok: Math.abs(diff) <= 100,
        label: "Opening balances balance",
        detail:
          Math.abs(diff) <= 100
            ? `Debits and credits are both ${inr(r.debitPaise)}.`
            : `Debits ${inr(r.debitPaise)} and credits ${inr(r.creditPaise)} differ by ${inr(Math.abs(diff))}. Tally will not accept an opening position that does not balance; check the ledgers with an opening balance.`,
      },
      {
        ok: banks.length > 0,
        label: "A bank ledger is present",
        detail: banks.length
          ? `${banks.map((b) => b.name).join(", ")}.`
          : "No ledger sits under Bank Accounts, so there is nothing for a bank statement to be reconciled with.",
      },
      {
        ok: cash.length > 0,
        label: "A cash ledger is present",
        detail: cash.length
          ? `${cash.map((c) => c.name).join(", ")}.`
          : "No ledger sits under Cash-in-Hand, so a cash withdrawal cannot be recorded as a transfer.",
      },
      {
        ok: dupes.length === 0,
        label: "No ledger name twice",
        detail: dupes.length
          ? `Names that appear twice: ${dupes.slice(0, 5).join(", ")}.`
          : "Every ledger name is unique.",
      },
      {
        ok: noGroup.length === 0,
        label: "Every ledger has a group",
        detail: noGroup.length
          ? `${noGroup.length} ledger(s) have no group, for example ${noGroup[0]!.name}.`
          : "Every ledger sits under a group.",
      },
    ],
    note: `${r.company ? `Ledgers of ${r.company}: ` : "Ledgers: "}${r.ledgers.length} in ${byGroup.size} groups. A masters file holds no transactions, so none were created. It is used to check that entries only go to ledgers that exist and that the opening position balances.`,
  };
}
