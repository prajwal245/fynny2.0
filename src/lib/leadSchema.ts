import { z } from "zod";

const t = z.string().max(200).optional();
const touch = z
  .object({
    utm_source: t, utm_medium: t, utm_campaign: t, utm_content: t, utm_term: t, utm_id: t, gclid: t, fbclid: t,
    landing: t,
    ts: z.number().optional(),
  })
  .partial();

/** First click and last click, as captured in the browser (see leadAttribution.ts). */
export const leadSchema = z.object({ first: touch, last: touch });
export type LeadInput = z.infer<typeof leadSchema>;

/** Flat columns for a lead sheet row: first_utm_source ... last_gclid. */
export function flatLead(l: LeadInput | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "gclid", "fbclid", "landing"] as const) {
    out[`first_${k}`] = l?.first?.[k] ?? "";
    out[`last_${k}`] = l?.last?.[k] ?? "";
  }
  return out;
}
