export type LegalBlock =
  | { t: "h"; n: string; text: string }
  | { t: "c"; n: string; text: string; lead?: string; sub?: boolean }
  | { t: "p"; text: string; strong?: boolean }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "kv"; rows: string[][] };

export interface LegalDoc {
  title: string | null;
  updated: string;
  version: string;
  blocks: LegalBlock[];
}
