/**
 * The GST month loop: once a return is filed, which GST files are still missing, who is asked for them, which checks can run and
 * which are waiting, and one approval-gated draft per supplier whose invoices are missing from GSTR-2B.
 *
 * It builds on the readiness model and the supplier message already in the product. It files nothing, and sends nothing: a message
 * to a supplier is a message to a third party, so every draft needs a partner's approval and the firm's own consent and compliance review.
 */
import {
  allChecks,
  askable,
  composeRequest,
  inputDef,
  requestPlan,
  type CheckDef,
  type InputDef,
  type InputStates,
} from "../readiness/model";
import { vendorMessage, type VendorFollowUp } from "../gst/reconcile";

/** The inputs the GST checks of a month read, in the order a CA collects them. */
export const GST_MONTHLY_KEYS = [
  "registers",
  "gst_ledgers",
  "gstr1",
  "gstr3b",
  "gstr2b",
  "ims",
  "credit_ledger",
  "cash_ledger",
  "challans",
] as const;
/** The portal returns exist only after filing. */
const AFTER_FILING = new Set(["gstr1", "gstr3b", "gstr2b", "ims"]);

export interface GstMonthPlan {
  state: "waiting_for_filing" | "collecting" | "ready";
  missing: InputDef[];
  firmTasks: InputDef[];
  clientRequests: InputDef[];
  runnable: CheckDef[];
  waiting: { check: CheckDef; waitingFor: InputDef[] }[];
  /** The message to the client for what only the client holds. Null when there is nothing to ask. */
  clientMessage: string | null;
}

export function gstMonthPlan(
  inputs: InputStates,
  ctx: {
    client: string;
    period: string;
    returnsFiled: boolean;
    firm: string;
    uploadUrl?: string | null;
    firmHoldsGstLogin?: boolean;
    tallyConnected?: boolean;
  },
): GstMonthPlan {
  const have = (k: string) =>
    inputs[k]?.status === "received" || inputs[k]?.status === "not_applicable";
  const wanted = GST_MONTHLY_KEYS.filter(
    (k) => ctx.returnsFiled || !AFTER_FILING.has(k),
  );
  const missing = askable(
    wanted
      .filter((k) => !have(k))
      .map((k) => inputDef(k))
      .filter((d): d is InputDef => !!d),
  );
  const plan = requestPlan(missing, {
    firmHoldsGstLogin: ctx.firmHoldsGstLogin ?? true,
    firmHoldsItLogin: true,
    tallyConnected: ctx.tallyConnected ?? false,
  });
  const checks = allChecks(inputs).filter((c) => c.def.module === "GST");
  const runnable = checks
    .filter(
      (c) =>
        c.status === "ready" || c.status === "passed" || c.status === "failed",
    )
    .map((c) => c.def);
  const waiting = checks
    .filter((c) => c.status === "blocked")
    .map((c) => ({ check: c.def, waitingFor: c.waitingFor }));
  const state: GstMonthPlan["state"] = !ctx.returnsFiled
    ? "waiting_for_filing"
    : missing.length
      ? "collecting"
      : "ready";
  return {
    state,
    missing,
    firmTasks: plan.firmTasks,
    clientRequests: plan.clientRequests,
    runnable,
    waiting,
    clientMessage: plan.clientRequests.length
      ? composeRequest(ctx.client, plan.clientRequests, {
          period: ctx.period,
          uploadUrl: ctx.uploadUrl ?? null,
          firm: ctx.firm,
        })
      : null,
  };
}

export interface SupplierDraft {
  gstin: string;
  party: string;
  itcAtRisk: number;
  message: string;
  /** Always true: a partner approves each message. */
  needsApproval: true;
  /** The risk-table action, whose gate is "confirm". */
  riskId: "gst_supplier_send";
  consentNote: string;
}

/** One draft per supplier worth chasing, the largest credit at risk first. A supplier with nothing at risk is left alone. */
export function supplierDrafts(
  vendors: VendorFollowUp[],
  period: string | null,
  firm: string,
  opts: { minItcAtRisk?: number } = {},
): SupplierDraft[] {
  const min = opts.minItcAtRisk ?? 1;
  return vendors
    .filter((v) => v.itcAtRisk >= min && v.missing.length > 0)
    .sort((a, b) => b.itcAtRisk - a.itcAtRisk || a.party.localeCompare(b.party))
    .map((v) => ({
      gstin: v.gstin,
      party: v.party,
      itcAtRisk: v.itcAtRisk,
      message: vendorMessage(v, period, firm),
      needsApproval: true as const,
      riskId: "gst_supplier_send" as const,
      consentNote:
        "A message to a third party. Needs the firm's consent and compliance review before it is switched on.",
    }));
}
