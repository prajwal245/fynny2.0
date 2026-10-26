/** The two automatic emails that go with a follow-up. Short, plain, from a person's point of view, and easy to answer. */
import { PLANS, type PlanKey } from "../billing/plans";
import type { EmailParts } from "../lifecycle/emails";

export function touchpointEmail(kind: "signup_unfinished" | "checkout_abandoned", opts: { plan?: string | null }): EmailParts {
  if (kind === "signup_unfinished")
    return {
      subject: "Your FynHelp account is two minutes from ready",
      preheader: "Pick up where you left off. No card needed.",
      heading: "Pick up where you left off",
      paragraphs: [
        "You created a FynHelp account but did not finish setting up your firm. It takes about two minutes: your firm's name, then your first client.",
        "Your free trial has not started and no card is needed. The 14 days begin with your first upload.",
        "If something stopped you, just reply to this email. A person will answer.",
      ],
      cta: { label: "Finish setting up", path: "/app/onboarding" },
    };
  const plan = PLANS[(opts.plan as PlanKey) ?? "professional"]?.name ?? "chosen";
  return {
    subject: `Your ${plan} plan is one step away`,
    preheader: "Your work is safe. Finish whenever you are ready.",
    heading: `Your ${plan} plan is one step away`,
    paragraphs: [
      `You chose the ${plan} plan but the payment was not completed. Nothing is charged unless you saw a payment confirmation, and everything you have done in FynHelp is exactly where you left it.`,
      "Yearly plans give you two months free, and a first yearly payment can be refunded in full within 7 days.",
      "If a question stopped you (the price, a GST invoice, how many clients are included), reply to this email and we will sort it out with you.",
    ],
    cta: { label: "Choose your plan", path: "/app/settings#billing" },
  };
}
