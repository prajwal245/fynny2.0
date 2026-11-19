// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@/lib/tiptapTable";

const PASTED = `<p>Hiring vs. workflow</p><table><tbody>
<tr><th><p>Area</p></th><th><p>Adding more employees</p></th><th><p>Improving the workflow</p></th></tr>
<tr><td><p>Document collection</p></td><td><p>More people can follow up</p></td><td><p>Requests become visible</p></td></tr></tbody></table>`;

describe("blog editor tables", () => {
  it("keeps a pasted table as a table, so cells are not run together", () => {
    const ed = new Editor({ extensions: [StarterKit, ...TableKit], content: PASTED });
    const html = ed.getHTML();
    expect(html).toContain("<table");
    expect(html.match(/<th/g)).toHaveLength(3);
    expect(html.match(/<td/g)).toHaveLength(3);
    expect(ed.getText()).not.toMatch(/AreaAdding|employeesImproving/);
    ed.destroy();
  });
  it("stores a table that the page's sanitiser keeps", async () => {
    const { sanitizeForStorage } = await import("@/lib/sanitizeHtml");
    const ed = new Editor({ extensions: [StarterKit, ...TableKit], content: PASTED });
    const out = sanitizeForStorage(ed.getHTML());
    expect(out).toContain("<table");
    expect(out).toContain("Adding more employees");
    ed.destroy();
  });
});
