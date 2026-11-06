import { describe, expect, it } from "vitest";
import { chaseContactPatch, samePhone, type ChaseContact } from "@/lib/practice/chaseContact";

const chase = (over: Partial<ChaseContact> = {}): ChaseContact => ({ contact_name: "Ramesh", contact_email: "old@client.in", contact_phone: "919820011223", notes: JSON.stringify({ note: "n", contact: "Ramesh", phone: "919820011223" }), ...over });

describe("samePhone", () => {
  it("ignores spaces, plus and the country code", () => {
    expect(samePhone("98200 11223", "+91 98200 11223")).toBe(true);
    expect(samePhone("919820011223", "09820011223")).toBe(true);
    expect(samePhone("9820011223", "9820011224")).toBe(false);
    expect(samePhone(null, "")).toBe(true);
    expect(samePhone(null, "9820011223")).toBe(false);
  });
});

describe("keeping open chases in step with an edited client", () => {
  it("a chase that carries the old client number gets the new one, in the column and the notes", () => {
    const p = chaseContactPatch(chase(), { phone: { old: "98200 11223", next: "919811122233" } })!;
    expect(p.contact_phone).toBe("919811122233");
    expect(JSON.parse(p.notes as string).phone).toBe("919811122233");
    expect(JSON.parse(p.notes as string).note).toBe("n");
  });
  it("a chase with no number yet gets the new one", () => {
    expect(chaseContactPatch(chase({ contact_phone: null }), { phone: { old: null, next: "919811122233" } })).toMatchObject({ contact_phone: "919811122233" });
  });
  it("a chase set to a different number on purpose is left alone", () => {
    expect(chaseContactPatch(chase({ contact_phone: "919000000000" }), { phone: { old: "919820011223", next: "919811122233" } })).toBeNull();
  });
  it("clearing the client's number clears it on the chase too", () => {
    expect(chaseContactPatch(chase(), { phone: { old: "919820011223", next: null } })).toMatchObject({ contact_phone: null });
  });
  it("nothing to do when the chase already has the new number", () => {
    expect(chaseContactPatch(chase({ contact_phone: "919811122233" }), { phone: { old: "919820011223", next: "919811122233" } })).toBeNull();
  });
  it("email and contact name follow the same rule, ignoring case", () => {
    const p = chaseContactPatch(chase(), { email: { old: "OLD@client.in", next: "new@client.in" }, contactName: { old: "ramesh", next: "Suresh" } })!;
    expect(p.contact_email).toBe("new@client.in");
    expect(p.contact_name).toBe("Suresh");
    expect(chaseContactPatch(chase({ contact_email: "other@x.in" }), { email: { old: "old@client.in", next: "new@client.in" } })).toBeNull();
  });
  it("broken notes never stop the update", () => {
    expect(chaseContactPatch(chase({ notes: "not json" }), { phone: { old: "919820011223", next: "919811122233" } })).toEqual({ contact_phone: "919811122233" });
    expect(chaseContactPatch(chase({ notes: null }), { phone: { old: "919820011223", next: "919811122233" } })).toEqual({ contact_phone: "919811122233" });
  });
});
