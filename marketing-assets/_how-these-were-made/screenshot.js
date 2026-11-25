const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const dir = process.argv[2];
  const out = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await p.goto("file://" + dir + "/" + f);
    await p.evaluate(() => document.fonts.ready);
    // Static capture: let scroll boxes grow and sticky bars sit in the flow, so nothing is clipped or floating.
    await p.evaluate(() => {
      document.querySelectorAll("#shot *").forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position === "sticky") el.style.position = "static";
        if (/(auto|scroll|hidden)/.test(cs.overflowY) && cs.maxHeight !== "none") { el.style.maxHeight = "none"; el.style.overflowY = "visible"; }
      });
    });
    const h = await p.evaluate(() => document.getElementById("shot").scrollHeight + 40);
    // A tall window, so a sticky bar sits at the bottom of the content instead of floating mid-page.
    await p.setViewportSize({ width: 1400, height: h });
    await p.waitForTimeout(250);
    const name = f.replace(".html", "");
    await (await p.$("#shot")).screenshot({ path: out + "/" + name + ".png" });
    if (name === "close-checklist") {
      const kids = await p.$$("#shot > * > *");
      const names = ["summary", "bank-and-books", "statutory-mis-signoff", "bank-statements", "expected-statements", "who-confirmed"];
      for (let i = 0; i < Math.min(kids.length, names.length); i++) {
        await kids[i].screenshot({ path: out + "/close-checklist--" + names[i] + ".png" });
      }
    }
    await p.close();
  }
  await b.close();
})();
