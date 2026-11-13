import { getDocumentProxy } from "unpdf";
import fs from "fs";
const [,, file, pageNo = "1", max = "60"] = process.argv;
const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
const page = await doc.getPage(Number(pageNo));
const vp = page.getViewport({ scale: 1 });
console.log("pages", doc.numPages, "size", vp.width, vp.height);
const c = await page.getTextContent();
const items = c.items.filter(i => typeof i.str === "string" && i.str.trim());
let n = 0;
for (const i of items) { if (n++ >= Number(max)) break; console.log(i.transform[4].toFixed(0).padStart(4), i.transform[5].toFixed(0).padStart(4), String(i.width.toFixed(0)).padStart(4), JSON.stringify(i.str)); }
