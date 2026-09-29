import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  // One-off seeder: writes to a public storage bucket with the service role.
  // Requires the operator secret — never callable by the public or by app users.
  const secret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ name: string; ok: boolean; error?: string }> = [];


  const xlsxFiles = [
    { name: "1_GSTR2B_Reconciliation_Tracker.xlsx", sheet: "ITC Reconciliation", headers: ["GSTIN", "Supplier", "Invoice No", "Invoice Date", "IGST", "CGST", "SGST", "Status"] },
    { name: "2_Cash_Flow_Projection_Workbook.xlsx", sheet: "Cash Flow", headers: ["Month", "Opening", "Inflows", "Outflows", "Net", "Closing"] },
    { name: "3_Receivables_Aging_Register.xlsx", sheet: "Receivables", headers: ["Customer", "Invoice", "Amount", "Due Date", "Days Overdue", "Bucket"] },
    { name: "6_Advance_Tax_Calculation_Workbook.xlsx", sheet: "Advance Tax", headers: ["Quarter", "Due Date", "Cumulative %", "Amount Due", "Status"] },
  ];

  for (const f of xlsxFiles) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([f.headers, ...Array(5).fill(f.headers.map(() => ""))]);
    XLSX.utils.book_append_sheet(wb, ws, f.sheet);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const { error } = await admin.storage.from("resources").upload(f.name, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    results.push({ name: f.name, ok: !error, error: error?.message });
  }

  const pdfBytes = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n200\n%%EOF",
  );
  const { error: pdfErr } = await admin.storage
    .from("resources")
    .upload("4_Vendor_GST_Compliance_Checklist.pdf", pdfBytes, { contentType: "application/pdf", upsert: true });
  results.push({ name: "4_Vendor_GST_Compliance_Checklist.pdf", ok: !pdfErr, error: pdfErr?.message });

  const docxMin = new Uint8Array([80, 75, 3, 4, 20, 0, 0, 0, 8, 0]);
  for (const name of ["5_MSME_Rights_Demand_Letter.docx", "7_Monthly_CFO_Report_Template.docx"]) {
    const { error } = await admin.storage.from("resources").upload(name, docxMin, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    results.push({ name, ok: !error, error: error?.message });
  }

  const pptxMin = new Uint8Array([80, 75, 3, 4, 20, 0, 0, 0, 8, 0]);
  const { error: pptxErr } = await admin.storage
    .from("resources")
    .upload("8_Board_Meeting_Financial_Update.pptx", pptxMin, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: true,
    });
  results.push({ name: "8_Board_Meeting_Financial_Update.pptx", ok: !pptxErr, error: pptxErr?.message });

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
