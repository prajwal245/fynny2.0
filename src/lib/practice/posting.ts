/**
 * Writing to the books is OFF. The QC offering reads and reviews books that are already prepared; it does not post entries to Tally or
 * Zoho Books. The switch below is read on the server for every write path, so no screen, connector call or stale browser can turn it on.
 * Turning it on is a deployment decision (PRACTICE_TALLY_POSTING=on), not a setting a firm can change.
 */
export const tallyPostingEnabled = (): boolean => process.env["PRACTICE_TALLY_POSTING"] === "on";

export const POSTING_OFF_MESSAGE = "Posting to Tally is switched off. FynHelp reads and reviews your books; it does not write entries to them.";
