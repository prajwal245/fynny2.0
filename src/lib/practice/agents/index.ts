/**
 * The agent layer: six flows built on the four existing agents (Extract, Recon, Narrate, Chaser).
 * Every flow starts at "suggest", is off until a partner switches it on for the firm, and never acts on anything it cannot take back.
 */
import type { AgentId } from "./autonomy";

export * from "./autonomy";
export * from "./queryLoop";
export * from "./classifier";
export * from "./reviewer";
export * from "./conductor";
export * from "./gstLoop";
export * from "./evaluation";

export const AGENT_INFO: Record<AgentId, { label: string; job: string }> = {
  query: {
    label: "Client query loop",
    job: "Asks the client about open items in one grouped message, and reads the reply as a proposal.",
  },
  classifier: {
    label: "Classifier",
    job: "Suggests how to treat a line from this client's own earlier decisions.",
  },
  reviewer: {
    label: "Pre-sign-off review",
    job: "Lists what to check before the partner signs off. Edits nothing.",
  },
  conductor: {
    label: "Close conductor",
    job: "Works out the next step of each close, who has it and what it is blocked on.",
  },
  gst: {
    label: "GST month loop",
    job: "Asks for the missing GST files and drafts supplier follow-ups for approval.",
  },
  evaluator: {
    label: "Evaluation loop",
    job: "Audits auto-matches and demotes any rule that slips.",
  },
};
