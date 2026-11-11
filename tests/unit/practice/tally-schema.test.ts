import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TALLY_SCHEMA, companiesSaveProblem, looksLikeSchemaError } from "@/lib/practice/tallySchema";

const dir = "supabase/migrations";
const sql = readdirSync(dir).filter((f) => /tally/i.test(f)).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");

describe("the Tally tables the code needs", () => {
  it("every column the code uses is created or added by the migrations", () => {
    const missing: string[] = [];
    for (const [table, cols] of Object.entries(TALLY_SCHEMA))
      for (const c of cols) if (!new RegExp(`\\b${c}\\b`).test(sql)) missing.push(`${table}.${c}`);
    expect(missing).toEqual([]);
  });
  it("the repairs add the company columns, the unique index the check-in upsert needs, and reload the schema", () => {
    expect(sql).toMatch(/ca_tally_companies_connector_name_uidx/);
    expect(sql.match(/NOTIFY pgrst, 'reload schema'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/DROP NOT NULL/);
  });
  it("the second repair lists the same columns as the code", () => {
    const repair = readFileSync(`${dir}/20261111120000_tally_tables_repair_2.sql`, "utf8");
    for (const cols of Object.values(TALLY_SCHEMA)) for (const c of cols) expect(repair).toContain(`'${c}'`);
  });
});

describe("what the connector card says when saving companies fails", () => {
  it("recognises a wrong table shape, including a NOT NULL on an old column", () => {
    expect(looksLikeSchemaError("Could not find the 'company_name' column of 'ca_tally_companies' in the schema cache")).toBe(true);
    expect(looksLikeSchemaError('null value in column "name" of relation "ca_tally_companies" violates not-null constraint')).toBe(true);
    expect(looksLikeSchemaError("there is no unique or exclusion constraint matching the ON CONFLICT specification")).toBe(true);
    expect(looksLikeSchemaError("fetch failed")).toBe(false);
  });
  it("names the missing columns when it knows them, and always carries the database's own words", () => {
    const m = companiesSaveProblem(3, "Could not find the 'x' column", ["ca_tally_companies.company_name"]);
    expect(m).toContain("ca_tally_companies.company_name");
    expect(m).toContain("Could not find");
    expect(companiesSaveProblem(2, 'null value in column "name" violates not-null constraint', [])).toContain("violates not-null");
    expect(companiesSaveProblem(1, "fetch failed", [])).toContain("fetch failed");
  });
});
