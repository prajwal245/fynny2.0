/**
 * Minimal, dependency-free XML reader. It is enough for Tally exports
 * (elements, attributes, text, CDATA, entities) and nothing more — no DTDs,
 * no namespaces handling beyond keeping the prefixed tag name.
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // Tally writes control characters like &#4; which are not valid XML text.
      return Number.isFinite(code) && code >= 32 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}

export function parseXml(input: string): XmlNode {
  const src = input.replace(/^﻿/, "");
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      stack[stack.length - 1].text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) stack[stack.length - 1].text += decodeEntities(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      stack[stack.length - 1].text += src.slice(lt + 9, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    const gt = src.indexOf(">", lt);
    if (gt === -1) throw new Error("Malformed XML: unterminated tag");
    const body = src.slice(lt + 1, gt);
    i = gt + 1;
    if (body.startsWith("/")) {
      const name = body.slice(1).trim().toUpperCase();
      // Pop to the matching open tag; tolerate sloppy nesting.
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === name) { stack.length = s; break; }
      }
      continue;
    }
    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1) : body;
    const sp = inner.search(/\s/);
    const name = (sp === -1 ? inner : inner.slice(0, sp)).trim().toUpperCase();
    const node: XmlNode = { name, attrs: sp === -1 ? {} : parseAttrs(inner.slice(sp)), children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

/** All descendants (depth-first) with the given tag name. */
export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  const upper = name.toUpperCase();
  for (const c of node.children) {
    if (c.name === upper) out.push(c);
    findAll(c, upper, out);
  }
  return out;
}

/** Direct child text of the first child with that name. */
export function childText(node: XmlNode, name: string): string {
  const upper = name.toUpperCase();
  const c = node.children.find((x) => x.name === upper);
  return c ? c.text.trim() : "";
}

export function children(node: XmlNode, name: string): XmlNode[] {
  const upper = name.toUpperCase();
  return node.children.filter((x) => x.name === upper);
}
