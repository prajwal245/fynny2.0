/**
 * What the assistant says on each screen. Plain, true to what the screen does, and never an instruction to change a figure:
 * every step tells the person what to look at and what they decide.
 */
import type { Reason } from "./assistEngine";

export interface GuideFacts {
  exceptions: number;
  review: number;
  chases: number;
}

export interface GuideStep {
  title: string;
  text: string;
  /** CSS selector of the element to outline, when the screen has a stable one. */
  target?: string;
}

export interface Guide {
  screen: string;
  title: (r: Reason, f: GuideFacts) => string;
  offer: (r: Reason, f: GuideFacts) => string;
  steps: GuideStep[];
  /** A short summary the follow-up answers from, so an answer never goes beyond this screen. */
  about: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const trouble = (r: Reason, fallback: string) =>
  r === "errors"
    ? "Something not working?"
    : r === "repeat_toggle"
      ? "Looking for something?"
      : fallback;

export const GUIDES: Guide[] = [
  {
    screen: "/app/close",
    title: (r) => trouble(r, "Not sure what to do next?"),
    offer: () =>
      "Each client shows the next step and who has it. I can show you where to start.",
    about:
      "Month-end close lists every client's next step, who owns it, and the 7th, 11th and 20th due dates. A person confirms GST, TDS, provisions, the MIS review and sign-off.",
    steps: [
      {
        title: "Start with what needs a person",
        text: "This list is ordered by how late each step is. Open a row to go to that client.",
        target: '[data-testid="needs-you"]',
      },
      {
        title: "Check the due dates",
        text: "Statements, reconciliation and TDS are due by the 7th, GST by the 11th, the MIS by the 20th.",
        target: '[data-testid="due-dates"]',
      },
      {
        title: "You confirm the rest",
        text: "FynHelp checks statements and reconciliation. GST, TDS, provisions, MIS review and sign-off are confirmed by people.",
      },
    ],
  },
  {
    screen: "/app/exceptions",
    title: (r) => trouble(r, "Having trouble reconciling?"),
    offer: (_r, f) =>
      f.exceptions
        ? `${plural(f.exceptions, "item")} could not be matched. I can show you how to work through them.`
        : "I can walk you through how exceptions are worked.",
    about:
      "The Exception Queue lists bank and book lines FynHelp could not match. A person picks the matching entry or records a reason; nothing is posted by FynHelp.",
    steps: [
      {
        title: "Open an item",
        text: "It shows why it could not be matched and the closest candidates.",
      },
      {
        title: "Choose what it is",
        text: "Pick the matching entry, or explain it with a short note. Some items have no bank statement yet; those wait for the file.",
      },
      {
        title: "You decide",
        text: "Every decision is yours. I never change a record or post anything.",
      },
    ],
  },
  {
    screen: "/app/review",
    title: (r) => trouble(r, "Not sure about a row?"),
    offer: (_r, f) =>
      f.review
        ? `${plural(f.review, "row")} need a quick check. I can show you what to look at.`
        : "I can explain what the Review Queue is for.",
    about:
      "The Review Queue holds rows FynHelp read but was not sure about, such as a thin narration. A person confirms or corrects each one.",
    steps: [
      {
        title: "Compare with the statement",
        text: "Each row shows what was read from the file. Check the date, amount and direction against the source.",
      },
      {
        title: "Confirm or correct",
        text: "If it matches the statement, confirm it. If not, correct it.",
      },
    ],
  },
  {
    screen: "/app/documents",
    title: (r) => trouble(r, "Upload not working?"),
    offer: () =>
      "I can explain what happens to a file after you upload it and what a hold means.",
    about:
      "Documents are read by type. A statement is checked against its running balance. If it is held, the card says why, and a person decides.",
    steps: [
      {
        title: "Upload the files",
        text: "FynHelp works out the type from the content: bank statement, books, loan, register or tax file.",
      },
      {
        title: "Read the card",
        text: "A held statement shows the real reason, for example the account holder differs from the client. The balance checks are shown beside it.",
      },
      {
        title: "You accept or replace",
        text: "If it belongs to this client, accept it with a reason. Otherwise replace the file.",
      },
    ],
  },
  {
    screen: "/app/reports",
    title: (r) => trouble(r, "Need help with this report?"),
    offer: () =>
      "I can explain how the MIS is built and what to check before sign-off.",
    about:
      "The MIS uses matched transactions only. Sign off is for the partner and is a different action from Request correction.",
    steps: [
      {
        title: "What is in the MIS",
        text: "Only matched lines are counted, and every figure links to its source rows.",
        target: '[data-testid="mis-basis"]',
      },
      {
        title: "Check before you send",
        text: "Look at large payments and receipts, and at transfers between the client's own accounts.",
      },
      {
        title: "Sign off is separate",
        text: "Request correction sends the report back with a note. Sign off approves it. They are different buttons for a reason.",
      },
    ],
  },
  {
    screen: "/app/gst",
    title: (r) => trouble(r, "Need help with GST?"),
    offer: () => "I can show you how GST checks and returns fit together.",
    about:
      "The GST screen compares returns and books. Filing and corrections are done by people.",
    steps: [
      {
        title: "Read the check first",
        text: "Each check says what it compared and what differs.",
      },
      { title: "You decide what to file", text: "I never file anything." },
    ],
  },
  {
    screen: "/app/chaser",
    title: (r) => trouble(r, "Waiting on a client?"),
    offer: (_r, f) =>
      f.chases
        ? `${plural(f.chases, "request")} still waiting. I can show you how follow-ups work.`
        : "I can explain how follow-ups work.",
    about:
      "The Chaser asks clients for missing documents on the firm's schedule, by email or WhatsApp where consent exists.",
    steps: [
      {
        title: "See who has not replied",
        text: "Requests show their status and the next follow-up.",
      },
      {
        title: "You stay in control",
        text: "Messages go out on your schedule and tone settings.",
      },
    ],
  },
  {
    screen: "/app",
    title: (r) => trouble(r, "Not sure where to start?"),
    offer: () => "I can show you where today's work is.",
    about:
      "The Portfolio lists every client ordered by who needs a person first.",
    steps: [
      {
        title: "Start at the top",
        text: "Clients are ordered by what is waiting on a person.",
      },
      {
        title: "Open a client",
        text: "Each client has its own close checklist.",
      },
    ],
  },
];

export function guideFor(pathname: string): Guide | null {
  const p = pathname.replace(/(.)\/+$/, "$1");
  return (
    GUIDES.find((g) => g.screen === p) ??
    (p.startsWith("/app/reports")
      ? GUIDES.find((g) => g.screen === "/app/reports")!
      : null)
  );
}

/** Whether the screen has something waiting for the person, from counts the app already holds. */
export function hasOpenWork(screen: string, f: GuideFacts): boolean {
  switch (screen) {
    case "/app/exceptions":
      return f.exceptions > 0;
    case "/app/review":
      return f.review > 0;
    case "/app/chaser":
      return f.chases > 0;
    case "/app/close":
    case "/app/documents":
    case "/app/reports":
    case "/app":
      return f.exceptions + f.review + f.chases > 0;
    default:
      return false;
  }
}
