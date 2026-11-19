/**
 * Tables for the blog editor.
 *
 * Without a table in the editor's schema, pasting from Google Docs or Word flattens every table into one paragraph with the cells run
 * together ("AreaAdding more employeesImproving the workflow"). These four nodes keep a pasted table as a table, so each cell stays a
 * cell and the words stay apart. They use only prosemirror-tables, which ships with Tiptap (@tiptap/pm), so no new package is added.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { tableEditing } from "@tiptap/pm/tables";

declare module "@tiptap/core" {
  interface NodeConfig {
    /** What prosemirror-tables calls this node: table, row, cell or header_cell. */
    tableRole?: string;
  }
}

export const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  parseHTML: () => [{ tag: "table" }],
  renderHTML: ({ HTMLAttributes }) => ["div", { class: "table-wrap" }, ["table", mergeAttributes(HTMLAttributes), ["tbody", 0]]],
  // prosemirror-tables finds its nodes by this role on the schema spec, so every node's role is passed on to it.
  extendNodeSchema: (extension) => ({ tableRole: (extension.config as { tableRole?: string }).tableRole }),
  tableRole: "table",
  addProseMirrorPlugins: () => [tableEditing()],
});

export const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",
  tableRole: "row",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", mergeAttributes(HTMLAttributes), 0],
});

const cellAttributes = () => ({
  colspan: { default: 1, parseHTML: (el: HTMLElement) => Number(el.getAttribute("colspan") ?? 1) || 1 },
  rowspan: { default: 1, parseHTML: (el: HTMLElement) => Number(el.getAttribute("rowspan") ?? 1) || 1 },
  colwidth: { default: null },
});

export const TableCell = Node.create({
  name: "tableCell",
  content: "block+",
  tableRole: "cell",
  isolating: true,
  addAttributes: cellAttributes,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", mergeAttributes(HTMLAttributes), 0],
});

export const TableHeader = Node.create({
  name: "tableHeader",
  content: "block+",
  tableRole: "header_cell",
  isolating: true,
  addAttributes: cellAttributes,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes), 0],
});

export const TableKit = [Table, TableRow, TableCell, TableHeader];
