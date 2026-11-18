/**
 * The value a month shows: how much of the bank statement FynHelp handled by itself and how much is left for a person.
 * Pure, so every figure can be checked by hand. Nothing here is invented: when a count is missing the field is null and the screen
 * says so. The hours figure is an ESTIMATE with its assumption in plain sight (seconds a person takes per line by hand).
 */
export const DEFAULT_SECONDS_PER_LINE = 45;

export interface ValueInput {
  /** Bank lines dated in the month, all of them (including those set aside). */
  bankLines: number;
  /** Matched by FynHelp's own stages. */
  autoMatched: number;
  /** Matched by a person. */
  manualMatched: number;
  /** Own-account transfers and reversed payments paired and set aside by FynHelp. */
  setAside: number;
  /** Decisions a person still has to make (a bank line and its book entry count once; explained ones are not counted). */
  decisionsLeft: number;
  secondsPerLine?: number;
}

export interface ValueSummary {
  bankLines: number;
  /** Lines that were real work: all lines less those set aside as transfers or reversals. */
  workLines: number;
  autoMatched: number;
  manualMatched: number;
  setAside: number;
  decisionsLeft: number;
  /** Share of the work lines FynHelp matched without a person, 0 to 100. Null when there are no work lines. */
  autoPct: number | null;
  /** Lines FynHelp handled alone (matched or set aside). */
  handledByFynHelp: number;
  secondsPerLine: number;
  /** Estimated hours of manual ticking saved: handled lines times seconds per line. */
  hoursSaved: number;
  /** One plain sentence, with the assumption stated. */
  sentence: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function valueFrom(i: ValueInput): ValueSummary {
  const secondsPerLine = i.secondsPerLine && i.secondsPerLine > 0 ? i.secondsPerLine : DEFAULT_SECONDS_PER_LINE;
  const setAside = Math.max(0, i.setAside);
  const workLines = Math.max(0, i.bankLines - setAside);
  const auto = Math.max(0, i.autoMatched);
  const handled = auto + setAside;
  const autoPct = workLines > 0 ? round1(Math.min(100, (auto / workLines) * 100)) : null;
  const hoursSaved = round1((handled * secondsPerLine) / 3600);
  const sentence =
    autoPct === null
      ? "No bank lines in this month yet."
      : `${autoPct}% of ${workLines} bank line${workLines === 1 ? "" : "s"} matched automatically (${auto}); ${setAside ? `${setAside} more set aside as transfers or reversals; ` : ""}${i.decisionsLeft} decision${i.decisionsLeft === 1 ? "" : "s"} left for a person. About ${hoursSaved} hour${hoursSaved === 1 ? "" : "s"} of manual ticking saved, assuming ${secondsPerLine} seconds a line by hand.`;
  return { bankLines: i.bankLines, workLines, autoMatched: auto, manualMatched: Math.max(0, i.manualMatched), setAside, decisionsLeft: i.decisionsLeft, autoPct, handledByFynHelp: handled, secondsPerLine, hoursSaved, sentence };
}
