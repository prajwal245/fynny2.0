// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cleanPassword, isPasswordMessage, isWrongPasswordMessage, passwordNeededMessage, passwordWrongMessage } from "@/lib/practice/passwordFile";
import { pdfText, unlockWorkbook } from "@/lib/practice/files.server";
import { PdfPasswordError, runExtract } from "@/lib/practice/extract/pipeline";

const DIR = process.env["PW_FIXTURES"] ?? `${process.cwd()}/tests/fixtures/locked`;
const maybe = describe;

describe("password messages", () => {
  it("are recognised so the screen can offer a password box", () => {
    expect(isPasswordMessage(passwordNeededMessage("PDF"))).toBe(true);
    expect(isPasswordMessage(passwordWrongMessage("Excel file"))).toBe(true);
    expect(isWrongPasswordMessage(passwordWrongMessage("PDF"))).toBe(true);
    expect(isWrongPasswordMessage(passwordNeededMessage("PDF"))).toBe(false);
    expect(isPasswordMessage("Scanned PDFs larger than 15 MB must be split before upload.")).toBe(false);
    expect(isPasswordMessage(null)).toBe(false);
  });
  it("a password is used exactly as typed, within a length limit", () => {
    expect(cleanPassword(" a b ")).toBe(" a b ");
    expect(cleanPassword("")).toBeNull();
    expect(cleanPassword("x".repeat(129))).toBeNull();
    expect(cleanPassword(42)).toBeNull();
  });
});

// Real locked files (password "secret123"), made with pypdf and msoffcrypto.
maybe("opening real locked files", () => {
  const f = (n: string) => new Uint8Array(readFileSync(`${DIR}/${n}`));
  it("a locked PDF: no password, wrong password, right password", async () => {
    await expect(pdfText(f("locked.pdf"))).rejects.toMatchObject({ reason: "needed" });
    await expect(pdfText(f("locked.pdf"), "nope")).rejects.toMatchObject({ reason: "wrong" });
    const ok = await pdfText(f("locked.pdf"), "secret123");
    expect(ok.text).toMatch(/NEFT Sundara/);
    await expect(pdfText(f("locked.pdf"))).rejects.toBeInstanceOf(PdfPasswordError);
  });
  it("a locked workbook: no password, wrong password, right password; an open one passes through", async () => {
    await expect(unlockWorkbook(f("locked.xlsx"))).rejects.toMatchObject({ reason: "needed", what: "Excel file" });
    await expect(unlockWorkbook(f("locked.xlsx"), "nope")).rejects.toMatchObject({ reason: "wrong" });
    const open = await unlockWorkbook(f("locked.xlsx"), "secret123");
    expect(open[0]).toBe(0x50); // a zip: PK
    const plain = f("plain.xlsx");
    expect(await unlockWorkbook(plain)).toEqual(plain);
  });
  it("a plain PDF needs no password", async () => {
    expect((await pdfText(f("plain.pdf"))).text).toMatch(/HDFC/);
  });
  it("the extract pipeline asks for the password, rejects a wrong one, and reads the statement with the right one", async () => {
    const input = { bytes: f("locked.pdf"), filename: "HDFC Nov.pdf", mime: "application/pdf", side: "bank" as const, businessId: "b1", clientName: null, clientGstin: null };
    const ask = async (pw?: string) => runExtract(input, { pdfText: (b) => pdfText(b, pw) });
    const none = await ask();
    expect(none.error).toMatchObject({ code: "password_protected" });
    expect(none.error!.message).toMatch(/Enter the password/);
    const wrong = await ask("nope");
    expect(wrong.error).toMatchObject({ code: "password_wrong" });
    expect(wrong.error!.message).toMatch(/did not open/);
    const ok = await ask("secret123");
    expect(ok.error).toBeNull();
    expect(ok.rows.length).toBeGreaterThanOrEqual(1);
  });
});
